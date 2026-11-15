"""Login do jogador: nome + PIN.

A identidade fica no servidor (não no navegador). Mudou o IP do servidor, trocou de
aparelho ou limpou o navegador? É só entrar de novo com o mesmo nome e PIN.
"""
import os
import re
import secrets
import threading
import time
import uuid
from datetime import timedelta
from functools import wraps
from urllib.parse import urlparse

from flask import abort, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

import db

PIN_VALIDO = re.compile(r"^\d{4,8}$")
MAX_TENTATIVAS = 5
BLOQUEIO_SEG = 5 * 60

_tentativas = {}          # nome (minúsculo) -> [horários das tentativas erradas]
_lock = threading.Lock()


def _chave_secreta():
    """Chave que assina o cookie de sessão; criada uma vez e guardada em dados/."""
    os.makedirs(db.DATA_DIR, exist_ok=True)
    caminho = os.path.join(db.DATA_DIR, "chave_secreta")
    if not os.path.exists(caminho):
        with open(caminho, "w") as f:
            f.write(secrets.token_hex(32))
        os.chmod(caminho, 0o600)
    with open(caminho) as f:
        return f.read().strip()


def jogador_atual():
    """{'id', 'nome'} de quem está logado, ou None."""
    jogador_id = session.get("jogador_id")
    if not jogador_id:
        return None
    with db.ler() as con:
        jogador = db.buscar_jogador(con, jogador_id)
    if not jogador:
        session.clear()   # jogador apagado do banco
    return jogador


def login_obrigatorio(api=False):
    """Páginas mandam para /entrar; a API responde 401."""
    def decorador(func):
        @wraps(func)
        def envolvida(*args, **kwargs):
            jogador = jogador_atual()
            if not jogador:
                if api:
                    abort(401, "Entre com seu nome e PIN")
                return redirect(url_for("entrar", proximo=request.full_path.rstrip("?")))
            request.jogador = jogador
            return func(*args, **kwargs)
        return envolvida
    return decorador


def _bloqueado(nome):
    agora = time.time()
    with _lock:
        recentes = [t for t in _tentativas.get(nome, []) if agora - t < BLOQUEIO_SEG]
        _tentativas[nome] = recentes
        return len(recentes) >= MAX_TENTATIVAS


def _errou(nome):
    with _lock:
        _tentativas.setdefault(nome, []).append(time.time())


class ErroLogin(Exception):
    pass


def limpar_nome(nome):
    return re.sub(r"\s+", " ", nome or "").strip()[:20]


def autenticar(con, nome, pin):
    """Confere nome + PIN. Devolve o id do jogador, ou None se o nome ainda não existe.

    Usado no login e no "＋ Jogador" (segundo jogador no mesmo aparelho).
    """
    if len(nome) < 2:
        raise ErroLogin("Escreva o nome (pelo menos 2 letras).")
    if not PIN_VALIDO.match(pin):
        raise ErroLogin("O PIN tem de 4 a 8 números.")
    chave = nome.lower()
    if _bloqueado(chave):
        raise ErroLogin("Muitas tentativas erradas. Espere 5 minutos.")

    existente = db.buscar_por_nome(con, nome)
    if not existente:
        return None
    if existente["pin_hash"]:
        if not check_password_hash(existente["pin_hash"], pin):
            _errou(chave)
            raise ErroLogin("PIN errado.")
        db.marcar_visto(con, existente["id"])
    else:
        # jogador de antes do login: o primeiro PIN usado passa a ser o dele
        db.definir_pin(con, existente["id"], generate_password_hash(pin))
    return existente["id"]


def criar_conta(con, nome, pin):
    jogador_id = str(uuid.uuid4())
    db.criar_jogador(con, jogador_id, nome, generate_password_hash(pin))
    return jogador_id


def _destino_seguro(proximo):
    """Só redireciona para caminhos do próprio site."""
    if not proximo:
        return "/"
    alvo = urlparse(proximo)
    if alvo.scheme or alvo.netloc or not proximo.startswith("/"):
        return "/"
    return proximo


def register_auth(app):
    app.secret_key = _chave_secreta()
    app.permanent_session_lifetime = timedelta(days=365)
    db.iniciar_banco()

    @app.context_processor
    def injetar_jogador():
        return {"jogador": jogador_atual()}

    @app.context_processor
    def injetar_perfis():
        # só a tela de entrada usa; é uma consulta pequena
        if request.endpoint != "entrar":
            return {}
        with db.ler() as con:
            return {"perfis": db.perfis(con)}

    @app.route("/entrar", methods=["GET", "POST"])
    def entrar():
        proximo = _destino_seguro(request.values.get("proximo"))
        if request.method == "GET":
            return render_template("entrar.html", proximo=proximo, nome=request.args.get("nome", ""),
                                   erro=None, criar=False)

        nome = limpar_nome(request.form.get("nome", ""))
        pin = request.form.get("pin", "").strip()
        confirmar_criacao = request.form.get("criar") == "1"

        def erro(msg):
            return render_template("entrar.html", proximo=proximo, nome=nome, erro=msg, criar=False), 400

        # decide dentro da conexão; as páginas só são montadas depois de fechá-la
        pedir_confirmacao = False
        mensagem = None
        try:
            with db.conectar() as con:
                jogador_id = autenticar(con, nome, pin)
                if jogador_id is None:
                    # nome novo: pede o PIN de novo para confirmar antes de criar
                    pendente = session.get("novo_jogador")
                    if not (confirmar_criacao and pendente and pendente["nome"].lower() == nome.lower()):
                        session["novo_jogador"] = {"nome": nome, "pin_hash": generate_password_hash(pin)}
                        pedir_confirmacao = True
                    elif not check_password_hash(pendente["pin_hash"], pin):
                        session.pop("novo_jogador", None)
                        mensagem = "Os PINs não batem. Comece de novo."
                    else:
                        jogador_id = criar_conta(con, nome, pin)
        except ErroLogin as e:
            mensagem = str(e)

        if mensagem:
            return erro(mensagem)
        if pedir_confirmacao:
            return render_template("entrar.html", proximo=proximo, nome=nome, erro=None, criar=True)

        session.clear()
        session.permanent = True
        session["jogador_id"] = jogador_id
        return redirect(proximo)

    @app.post("/sair")
    def sair():
        session.clear()
        return redirect("/")
