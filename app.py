"""Fliperama de Casa: jogos antigos no navegador, com multiplayer pela rede local.

Rodar:  python app.py          (porta escolhida em Ajustes; 5000 se nunca mudou)
        python app.py 8080     (força outra porta)
"""
import os
import re
import socket
import sys

from datetime import datetime

from flask import Flask, abort, jsonify, render_template, request, send_from_directory, session
from flask_socketio import SocketIO

import config
from ajustes import register_ajustes
from antigo import listar_salas, register_antigo
from avatares import register_avatares
from auth import login_obrigatorio, register_auth
from codigos import register_codigos
from conta import register_conta
import db
import capas
from games import Catalog
from netplay import list_rooms, register_netplay
from registro import register_registro
from uploads import register_uploads

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EJS_DIR = os.path.join(BASE_DIR, "emulatorjs")   # conteúdo da pasta data/ do EmulatorJS

app = Flask(__name__)
# max_http_buffer_size: o jogo com rollback manda o "save state" inteiro pela rede (PS1 tem ~5 MB)
# sem cors_allowed_origins: o Socket.IO só aceita páginas servidas por este mesmo servidor
# (um site qualquer aberto num aparelho da casa não consegue entrar nas salas)
socketio = SocketIO(app, async_mode="threading", max_http_buffer_size=32 * 1024 * 1024)
catalog = Catalog(BASE_DIR)
register_auth(app)
register_netplay(app, socketio)
register_antigo(socketio)   # "Jogar junto (rollback)": salas e mensagens entre aparelhos
register_avatares(app)
register_uploads(app, catalog)
register_registro(app, catalog)
register_codigos(app, catalog)
register_conta(app)

# porta em que este processo está rodando (definida ao iniciar)
_porta = {"atual": None}
register_ajustes(app, catalog, lambda: _porta["atual"])

ONE_WEEK = 7 * 24 * 3600


def lan_ip():
    """IP desta máquina na rede local (não envia nada, só consulta a rota)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


@app.context_processor
def inject_saudacao():
    hora = datetime.now().hour
    return {"saudacao": "Bom dia" if 5 <= hora < 12 else "Boa tarde" if hora < 18 else "Boa noite"}


@app.context_processor
def inject_lan_url():
    """Endereço que os outros aparelhos usam para entrar (vai no QR code)."""
    port = request.host.rsplit(":", 1)[1] if ":" in request.host else "80"
    return {"lan_url": f"http://{lan_ip()}:{port}"}


# ---------- páginas ----------

@app.get("/")
def index():
    """Menu inicial: uma fileira com todos os jogos, os que você jogou por último primeiro."""
    jogos = catalog.scan()
    recentes = {}
    with db.ler() as con:
        perfis = db.perfis(con)
        favoritos = set(db.favoritos(con, session.get("jogador_id")))
        if session.get("jogador_id"):
            recentes = db.jogados_recentemente(con, session["jogador_id"])
    ordem = list(recentes)
    jogos.sort(key=lambda g: (ordem.index(g["game_id"]) if g["game_id"] in recentes else len(ordem)))
    for g in jogos:
        g["jogou_em"] = recentes.get(g["game_id"])
        g["favorito"] = g["game_id"] in favoritos
    # abas de console acima da fileira: só os consoles que têm jogo, em ordem alfabética
    abas = {}
    for g in jogos:
        aba = abas.setdefault(g["console"], {"console": g["console"], "rotulo": g["console_label"], "total": 0})
        aba["total"] += 1
    abas = sorted(abas.values(), key=lambda a: a["rotulo"].lower())
    tem_recentes = any(g["jogou_em"] for g in jogos)
    return render_template("index.html", jogos=jogos, perfis=perfis, abas=abas, tem_recentes=tem_recentes,
                           total_favoritos=sum(g["favorito"] for g in jogos))


@app.get("/jogo/<console>/<slug>")
@login_obrigatorio()
def play(console, slug):
    game = catalog.get(console, slug)
    if not game:
        abort(404)
    with db.ler() as con:
        perfis = [p for p in db.perfis(con) if p["id"] != session.get("jogador_id")]
        jogou = db.jogados_recentemente(con, session.get("jogador_id"))
        favorito = game["game_id"] in db.favoritos(con, session.get("jogador_id"))
    # "Trocar de jogo" no menu de pausa: os que a pessoa jogou por último, depois o resto
    ordem = list(jogou)
    outros = [g for g in catalog.scan() if g["game_id"] != game["game_id"]]
    outros.sort(key=lambda g: ordem.index(g["game_id"]) if g["game_id"] in jogou else len(ordem))
    # o emulator.min.js fica uma semana no cache do navegador: a data do arquivo vai no endereço,
    # e quando ele muda (ex.: ajuste do jogo em rede) os aparelhos baixam o novo
    ejs_versao = int(os.path.getmtime(os.path.join(EJS_DIR, "emulator.min.js")))
    return render_template("play.html", game=game, perfis=perfis, recentes=outros[:8], favorito=favorito,
                           ejs_versao=ejs_versao)


@app.post("/api/favoritos/<int:game_id>")
@login_obrigatorio(api=True)
def api_favorito(game_id):
    """Marca ou desmarca um jogo como favorito do jogador logado. Corpo: {"favorito": true|false}."""
    if not any(g["game_id"] == game_id for g in catalog.scan()):
        abort(404)
    favorito = bool((request.get_json(silent=True) or {}).get("favorito"))
    with db.conectar() as con:
        db.definir_favorito(con, request.jogador["id"], game_id, favorito)
    return jsonify(favorito=favorito)


@app.get("/controles")
def controles():
    return render_template("controles.html")


# registro dos últimos eventos de controle (para diagnosticar compatibilidade)
_eventos_controle = []


@app.post("/api/controles/eventos")
def api_controles_eventos():
    dados = request.get_json(silent=True) or {}
    for ev in (dados.get("eventos") or [])[:200]:
        if isinstance(ev, str):
            _eventos_controle.append(ev[:300])
    del _eventos_controle[:-500]
    return jsonify(ok=True)


@app.get("/api/controles/eventos")
def api_controles_eventos_ler():
    return jsonify(_eventos_controle)


# ---------- API ----------

@app.get("/api/salas")
def api_rooms():
    """Todas as salas abertas, com o jogo de cada uma (para o lobby da home)."""
    games = catalog.by_game_id()
    result = []
    for session_id, room in list_rooms().items():
        game = games.get(room["game_id"])
        if not game:
            continue
        result.append({**room, "session_id": session_id, "tipo": "video",
                       "title": game["title"], "console_label": game["console_label"],
                       "url": f"/jogo/{game['console']}/{game['slug']}"})
    # salas do "Jogar junto (rollback)" (antigo.py)
    for sala in listar_salas():
        try:
            game = games.get(int(sala["game_id"]))
        except (TypeError, ValueError):
            game = None
        if not game:
            continue
        result.append({"tipo": "rollback", "codigo": sala["codigo"], "player_name": sala["nome"],
                       "current": sala["jogadores"], "max": sala["max"], "hasPassword": False,
                       "title": game["title"], "console_label": game["console_label"],
                       "url": f"/jogo/{game['console']}/{game['slug']}"})
    return jsonify(result)


# ---------- arquivos grandes (ROMs, BIOS, emulador) ----------

@app.get("/roms/<path:filename>")
def roms(filename):
    # "achados/<n>/<arquivo>": jogo numa pasta do celular achada pela busca do app
    m = re.match(r"achados/(\d+)/([^/]+)$", filename)
    if m:
        pasta = catalog.pasta_achada(int(m.group(1)))
        if not pasta:
            abort(404)
        return send_from_directory(pasta, m.group(2), max_age=ONE_WEEK)
    return send_from_directory(catalog.roms_dir, filename, max_age=ONE_WEEK)


@app.get("/bios/<path:filename>")
def bios(filename):
    return send_from_directory(catalog.bios_dir, filename, max_age=ONE_WEEK)


@app.get("/covers/<path:filename>")
def covers(filename):
    return send_from_directory(catalog.covers_dir, filename, max_age=ONE_WEEK)


@app.get("/emulatorjs/<path:filename>")
def emulatorjs(filename):
    return send_from_directory(EJS_DIR, filename, max_age=ONE_WEEK)


if __name__ == "__main__":
    # porta: a da linha de comando, senão a escolhida em Ajustes, senão 5000
    port = int(sys.argv[1]) if len(sys.argv) > 1 else config.porta()
    _porta["atual"] = port
    print(f"\n  Fliperama de Casa  →  http://{lan_ip()}:{port}\n")
    # capas que faltam: baixa da internet em segundo plano (sem internet, só pula)
    capas.em_segundo_plano(capas.baixar_faltantes, BASE_DIR)
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)
