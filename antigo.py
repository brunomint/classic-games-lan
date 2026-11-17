"""Jogar junto com rollback ("Jogar junto (rollback)" no menu de pausa).

No modo por vídeo do EmulatorJS 4.3, só quem cria a sala roda o jogo e transmite o vídeo.
Aqui, todos os aparelhos rodam o jogo e trocam só os botões apertados; quando um botão
chega atrasado, o jogo volta uns quadros e refaz (rollback). Este servidor só cuida das
salas e repassa as mensagens (e a combinação da conexão direta entre os aparelhos); a
lógica fica em static/js/modo-antigo.js.

Canal Socket.IO separado ("/antigo") para não se misturar com o netplay do EmulatorJS.
  antigo-listar {game_id}            -> [{codigo, nome, jogadores}]
  antigo-criar {game_id, nome}       -> {codigo, jogador: 0}
  antigo-entrar {codigo, nome}       -> {codigo, jogador: n} ; os outros recebem antigo-entrou
  antigo-msg {...}                   -> repassada aos outros da sala (antigo-msg)
  desconectar                        -> os outros recebem antigo-saiu
"""
import random
import threading

from flask import request, session
from flask_socketio import emit, join_room, leave_room

NS = "/antigo"
MAX_JOGADORES = 4

salas = {}        # codigo -> {"game_id", "dono_nome", "jogadores": {sid: {"indice", "nome"}}}
por_sid = {}      # sid -> codigo
lock = threading.Lock()


def _novo_codigo():
    while True:
        codigo = f"{random.randint(0, 9999):04d}"
        if codigo not in salas:
            return codigo


def listar_salas():
    """Salas com vaga, para o lobby da home: [{codigo, game_id, nome, jogadores, max}]."""
    with lock:
        return [
            {"codigo": c, "game_id": s["game_id"], "nome": s["dono_nome"],
             "jogadores": len(s["jogadores"]), "max": MAX_JOGADORES}
            for c, s in salas.items()
            if len(s["jogadores"]) < MAX_JOGADORES
        ]


def register_antigo(socketio):

    # só quem está logado neste app entra nas salas (a origem já é conferida no app.py)
    @socketio.on("connect", namespace=NS)
    def conectou(*_):
        if not session.get("jogador_id"):
            return False

    @socketio.on("antigo-listar", namespace=NS)
    def listar(data):
        game_id = str((data or {}).get("game_id"))
        with lock:
            return [
                {"codigo": c, "nome": s["dono_nome"], "jogadores": len(s["jogadores"])}
                for c, s in salas.items()
                if s["game_id"] == game_id and len(s["jogadores"]) < MAX_JOGADORES
            ]

    @socketio.on("antigo-criar", namespace=NS)
    def criar(data):
        data = data or {}
        _sair(request.sid)
        with lock:
            codigo = _novo_codigo()
            nome = str(data.get("nome") or "Jogador")[:20]
            salas[codigo] = {
                "game_id": str(data.get("game_id")),
                "dono_nome": nome,
                "jogadores": {request.sid: {"indice": 0, "nome": nome}},
            }
            por_sid[request.sid] = codigo
        join_room(codigo, namespace=NS)
        return {"codigo": codigo, "jogador": 0}

    @socketio.on("antigo-entrar", namespace=NS)
    def entrar(data):
        data = data or {}
        codigo = str(data.get("codigo") or "")
        nome = str(data.get("nome") or "Jogador")[:20]
        _sair(request.sid)
        with lock:
            sala = salas.get(codigo)
            if not sala:
                return {"erro": "Essa sala já fechou."}
            if len(sala["jogadores"]) >= MAX_JOGADORES:
                return {"erro": "A sala está cheia."}
            usados = {j["indice"] for j in sala["jogadores"].values()}
            indice = next(i for i in range(MAX_JOGADORES) if i not in usados)
            sala["jogadores"][request.sid] = {"indice": indice, "nome": nome}
            por_sid[request.sid] = codigo
        join_room(codigo, namespace=NS)
        emit("antigo-entrou", {"jogador": indice, "nome": nome}, to=codigo, include_self=False, namespace=NS)
        return {"codigo": codigo, "jogador": indice}

    @socketio.on("antigo-msg", namespace=NS)
    def mensagem(data):
        codigo = por_sid.get(request.sid)
        if codigo:
            emit("antigo-msg", data, to=codigo, include_self=False, namespace=NS)

    @socketio.on("antigo-sair", namespace=NS)
    def sair_evento(*_):
        _sair(request.sid)

    @socketio.on("disconnect", namespace=NS)
    def desconectou(*_):
        _sair(request.sid)

    def _sair(sid):
        with lock:
            codigo = por_sid.pop(sid, None)
            sala = salas.get(codigo) if codigo else None
            if not sala:
                return
            jogador = sala["jogadores"].pop(sid, None)
            if not sala["jogadores"]:
                del salas[codigo]
        leave_room(codigo, sid=sid, namespace=NS)
        if jogador:
            socketio.emit("antigo-saiu", {"jogador": jogador["indice"], "nome": jogador["nome"]},
                          to=codigo, namespace=NS)
