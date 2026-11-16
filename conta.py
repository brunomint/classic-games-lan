"""Conta do jogador (na página Ajustes): trocar o PIN, excluir o próprio jogador e
liberar o PIN de quem esqueceu.

Excluir não apaga nada: o jogador some do login e aparece como "Jogador excluído" no
placar. Se criar de novo com o mesmo nome, volta tudo (ver auth.criar_conta).
"""
from flask import abort, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import db
from auth import PIN_VALIDO, _bloqueado, _errou, login_obrigatorio


def _pin_certo(con, jogador, pin):
    """Confere o PIN de quem está logado (com o mesmo limite de tentativas do login)."""
    chave = jogador["nome"].lower()
    if _bloqueado(chave):
        return "Muitas tentativas erradas. Espere 5 minutos."
    pin_hash = db.conferir_pin(con, jogador["id"])
    if pin_hash and not check_password_hash(pin_hash, pin or ""):
        _errou(chave)
        return "PIN errado."
    return None


def register_conta(app):

    @app.post("/api/conta/pin")
    @login_obrigatorio(api=True)
    def api_trocar_pin():
        dados = request.get_json(silent=True) or {}
        novo = str(dados.get("novo", "")).strip()
        if not PIN_VALIDO.match(novo):
            return jsonify(erro="O PIN novo tem de 4 a 8 números."), 400
        with db.conectar() as con:
            erro = _pin_certo(con, request.jogador, str(dados.get("atual", "")).strip())
            if not erro:
                db.definir_pin(con, request.jogador["id"], generate_password_hash(novo))
        if erro:
            return jsonify(erro=erro), 400
        return jsonify(ok=True)

    @app.post("/api/conta/excluir")
    @login_obrigatorio(api=True)
    def api_excluir_conta():
        dados = request.get_json(silent=True) or {}
        with db.conectar() as con:
            erro = _pin_certo(con, request.jogador, str(dados.get("pin", "")).strip())
            if not erro:
                db.excluir_jogador(con, request.jogador["id"])
        if erro:
            return jsonify(erro=erro), 400
        session.clear()
        return jsonify(ok=True)

    @app.post("/api/jogadores/<jogador_id>/liberar-pin")
    @login_obrigatorio(api=True)
    def api_liberar_pin(jogador_id):
        """Esqueci o PIN: o próximo PIN que a pessoa usar ao entrar passa a ser o dela."""
        if jogador_id == request.jogador["id"]:
            abort(400, "Para o seu, use Trocar PIN")
        with db.conectar() as con:
            if not db.buscar_jogador(con, jogador_id):
                abort(404)
            db.definir_pin(con, jogador_id, None)
        return jsonify(ok=True)
