"""Página Ajustes: excluir jogos e mudar a porta do servidor."""
import os
import socket
import sys
import threading
import time

from flask import abort, jsonify, render_template, request

import config
from auth import login_obrigatorio


def porta_livre(porta):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0", porta))
            return True
        except OSError:
            return False


def reiniciar_na_porta(porta):
    """Troca este processo por um novo servidor na porta pedida (depois de responder)."""
    def trocar():
        time.sleep(0.8)
        script = os.path.abspath(sys.argv[0])
        # fecha tudo que não é entrada/saída padrão: senão o processo novo herda a
        # porta antiga aberta e quem tenta conectar nela fica esperando para sempre
        os.closerange(3, 65536)
        os.execv(sys.executable, [sys.executable, script, str(porta)])
    threading.Thread(target=trocar, daemon=True).start()


def register_ajustes(app, catalog, porta_atual):

    @app.get("/ajustes")
    @login_obrigatorio()
    def ajustes():
        return render_template("ajustes.html", jogos=catalog.scan(), porta=porta_atual())

    @app.delete("/api/jogos/<console>/<slug>")
    @login_obrigatorio(api=True)
    def api_excluir_jogo(console, slug):
        jogo = catalog.get(console, slug)
        if not jogo:
            abort(404)
        apagados = []
        for rel in jogo["arquivos"]:
            caminho = os.path.realpath(os.path.join(catalog.roms_dir, rel))
            # só apaga dentro de roms/
            if not caminho.startswith(os.path.realpath(catalog.roms_dir) + os.sep):
                continue
            try:
                os.remove(caminho)
                apagados.append(rel)
            except FileNotFoundError:
                pass
        if jogo["cover"]:
            try:
                os.remove(os.path.join(catalog.covers_dir, jogo["cover"]))
            except FileNotFoundError:
                pass
        return jsonify(ok=True, apagados=apagados)

    @app.post("/api/servidor/porta")
    @login_obrigatorio(api=True)
    def api_mudar_porta():
        dados = request.get_json(silent=True) or {}
        try:
            porta = int(dados.get("porta"))
        except (TypeError, ValueError):
            return jsonify(erro="Digite só números."), 400
        if not 1024 <= porta <= 65535:
            return jsonify(erro="Use uma porta entre 1024 e 65535."), 400
        if porta == porta_atual():
            return jsonify(erro="O servidor já está nessa porta."), 400
        if not porta_livre(porta):
            return jsonify(erro=f"A porta {porta} já está sendo usada por outro programa."), 400
        config.gravar(porta=porta)
        reiniciar_na_porta(porta)
        host = request.host.rsplit(":", 1)[0]
        return jsonify(ok=True, url=f"http://{host}:{porta}/ajustes")
