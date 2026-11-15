"""Classic Games LAN: jogos antigos no navegador, com multiplayer pela rede local.

Rodar:  python app.py          (porta 5000)
        python app.py 8080     (outra porta)
"""
import os
import socket
import sys

from datetime import datetime

from flask import Flask, abort, jsonify, render_template, request, send_from_directory, session
from flask_socketio import SocketIO

from auth import login_obrigatorio, register_auth
import db
import capas
from games import Catalog
from netplay import list_rooms, register_netplay
from registro import register_registro
from uploads import register_uploads

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EJS_DIR = os.path.join(BASE_DIR, "emulatorjs")   # conteúdo da pasta data/ do EmulatorJS

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
catalog = Catalog(BASE_DIR)
register_auth(app)
register_netplay(app, socketio)
register_uploads(app, catalog)
register_registro(app, catalog)

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
        if session.get("jogador_id"):
            recentes = db.jogados_recentemente(con, session["jogador_id"])
    ordem = list(recentes)
    jogos.sort(key=lambda g: (ordem.index(g["game_id"]) if g["game_id"] in recentes else len(ordem)))
    for g in jogos:
        g["jogou_em"] = recentes.get(g["game_id"])
    return render_template("index.html", jogos=jogos, perfis=perfis)


@app.get("/jogo/<console>/<slug>")
@login_obrigatorio()
def play(console, slug):
    game = catalog.get(console, slug)
    if not game:
        abort(404)
    return render_template("play.html", game=game)


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
        result.append({**room, "session_id": session_id,
                       "title": game["title"], "console_label": game["console_label"],
                       "url": f"/jogo/{game['console']}/{game['slug']}"})
    return jsonify(result)


# ---------- arquivos grandes (ROMs, BIOS, emulador) ----------

@app.get("/roms/<path:filename>")
def roms(filename):
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
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    print(f"\n  Classic Games LAN  →  http://{lan_ip()}:{port}\n")
    # capas que faltam: baixa da internet em segundo plano (sem internet, só pula)
    capas.em_segundo_plano(capas.baixar_faltantes, BASE_DIR)
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)
