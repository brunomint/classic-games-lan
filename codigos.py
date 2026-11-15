"""Códigos de trapaça por jogo (Game Genie, Action Replay, GameShark...).

Ficam no servidor e valem para a casa toda: alguém digita o código uma vez (no PC ou no
celular) e depois qualquer um liga e desliga pelo controle, no menu de pausa.
"""
import re

from flask import abort, jsonify, request

import db
from auth import login_obrigatorio

# códigos são letras, números e separadores ("7E0DBE:05", "8009C6E4 0003", "DD62-3B0D+...")
CODIGO_VALIDO = re.compile(r"^[A-Za-z0-9 :+\-\n]{4,600}$")


def register_codigos(app, catalog):

    def _jogo_existe(game_id):
        if not any(g["game_id"] == game_id for g in catalog.scan()):
            abort(404)

    @app.get("/api/codigos/<int:game_id>")
    @login_obrigatorio(api=True)
    def api_codigos(game_id):
        with db.ler() as con:
            return jsonify(db.codigos(con, game_id))

    @app.post("/api/codigos/<int:game_id>")
    @login_obrigatorio(api=True)
    def api_criar_codigo(game_id):
        _jogo_existe(game_id)
        dados = request.get_json(silent=True) or {}
        nome = " ".join(str(dados.get("nome", "")).split())[:60]
        # um código por linha ou separados por "+": vira o formato que o emulador entende
        codigo = "+".join(p.strip() for p in re.split(r"[\n+]", str(dados.get("codigo", ""))) if p.strip())
        if not nome:
            return jsonify(erro="Dê um nome ao código (ex.: Vidas infinitas)."), 400
        if not CODIGO_VALIDO.match(codigo):
            return jsonify(erro="Código inválido: use só letras, números, espaço, : e -."), 400
        with db.conectar() as con:
            novo = db.criar_codigo(con, game_id, nome, codigo, request.jogador["id"])
        return jsonify(id=novo, nome=nome, codigo=codigo)

    @app.delete("/api/codigos/<int:game_id>/<int:codigo_id>")
    @login_obrigatorio(api=True)
    def api_apagar_codigo(game_id, codigo_id):
        with db.conectar() as con:
            if not db.apagar_codigo(con, game_id, codigo_id):
                abort(404)
        return jsonify(ok=True)
