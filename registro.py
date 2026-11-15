"""API de jogadores, partidas, resultados e saves + página de histórico."""
import os
import re
import uuid
from datetime import datetime

from flask import abort, jsonify, render_template, request, send_from_directory

import db
from auth import ErroLogin, autenticar, criar_conta, limpar_nome, login_obrigatorio

ID_VALIDO = re.compile(r"^[A-Za-z0-9-]{8,64}$")
FORMATOS_IMAGEM = {"png": "png", "jpeg": "jpg", "jpg": "jpg", "webp": "webp"}
MAX_SAVE_BYTES = 64 * 1024 * 1024   # estados de PS1 passam de 4 MB; 64 MB é folga


def _json():
    # sendBeacon manda o corpo sem Content-Type de JSON
    return request.get_json(force=True, silent=True) or {}


def _jogador_id(valor):
    if not isinstance(valor, str) or not ID_VALIDO.match(valor):
        abort(400, "jogador_id inválido")
    return valor


def duracao(segundos):
    segundos = int(segundos or 0)
    h, resto = divmod(segundos, 3600)
    m = resto // 60
    if h:
        return f"{h}h{m:02d}"
    if m:
        return f"{m} min"
    return f"{segundos} s"


def data_hora(ts):
    return datetime.fromtimestamp(ts).strftime("%d/%m %H:%M") if ts else ""


def register_registro(app, catalog):
    app.add_template_filter(duracao, "duracao")
    app.add_template_filter(data_hora, "data_hora")

    def jogo_por_id(game_id):
        try:
            jogo = catalog.by_game_id().get(int(game_id))
        except (TypeError, ValueError):
            jogo = None
        if not jogo:
            abort(404, "Jogo não encontrado")
        return jogo

    # ---------- sessões de jogo ----------

    @app.post("/api/sessao/iniciar")
    @login_obrigatorio(api=True)
    def api_sessao_iniciar():
        dados = _json()
        jogador_id = request.jogador["id"]
        jogo = jogo_por_id(dados.get("game_id"))
        with db.conectar() as con:
            db.encerrar_inativas(con)
            db.marcar_visto(con, jogador_id)
            return jsonify(db.nova_participacao(con, jogador_id, jogo))

    @app.post("/api/sessao/sala")
    @login_obrigatorio(api=True)
    def api_sessao_sala():
        """Entrou ou saiu de uma sala: fecha a participação atual e abre outra."""
        dados = _json()
        jogador_id = request.jogador["id"]
        jogo = jogo_por_id(dados.get("game_id"))
        sala = dados.get("sala") or None
        papel = "anfitriao" if dados.get("anfitriao") else "convidado"
        antiga = int(dados.get("participacao_id") or 0)
        with db.conectar() as con:
            locais = []
            if antiga and db.participacao_do_jogador(con, antiga, jogador_id):
                locais = db.jogadores_locais(con, antiga)      # lê antes de encerrar
                db.encerrar_participacao(con, antiga, jogador_id=jogador_id)
            if sala:
                nova = db.nova_participacao(con, jogador_id, jogo, sala=str(sala)[:64], papel=papel)
            else:
                nova = db.nova_participacao(con, jogador_id, jogo)
            # quem joga no mesmo aparelho vai junto para a nova partida
            for local in locais:
                db.adicionar_local(con, nova["participacao_id"], local["jogador_id"])
            nova["locais"] = db.jogadores_locais(con, nova["participacao_id"])
            return jsonify(nova)

    @app.post("/api/sessao/ping")
    @login_obrigatorio(api=True)
    def api_sessao_ping():
        dados = _json()
        with db.conectar() as con:
            ativa = db.sinal_de_vida(con, int(dados.get("participacao_id") or 0), request.jogador["id"])
        return jsonify(ativa=ativa)

    @app.post("/api/sessao/fim")
    @login_obrigatorio(api=True)
    def api_sessao_fim():
        dados = _json()
        with db.conectar() as con:
            db.encerrar_participacao(con, int(dados.get("participacao_id") or 0), jogador_id=request.jogador["id"])
        return jsonify(ok=True)

    # ---------- mais jogadores no mesmo aparelho ----------

    def _minha_participacao(con, dados):
        pid = int(dados.get("participacao_id") or 0)
        if not db.participacao_do_jogador(con, pid, request.jogador["id"]):
            abort(403, "Essa sessão de jogo não é sua")
        return pid

    @app.post("/api/sessao/jogador")
    @login_obrigatorio(api=True)
    def api_jogador_local():
        """Jogador 2 (3, 4) entra com nome + PIN; se o nome é novo, pede o PIN duas vezes."""
        dados = _json()
        nome = limpar_nome(dados.get("nome"))
        pin = str(dados.get("pin") or "").strip()
        try:
            with db.conectar() as con:
                dono = _minha_participacao(con, dados)
                jogador_id = autenticar(con, nome, pin)
                if jogador_id is None:
                    if not dados.get("pin2"):
                        return jsonify(novo=True, nome=nome)
                    if str(dados["pin2"]).strip() != pin:
                        return jsonify(erro="Os PINs não batem."), 400
                    jogador_id = criar_conta(con, nome, pin)
                db.adicionar_local(con, dono, jogador_id)
                return jsonify(locais=db.jogadores_locais(con, dono))
        except (ErroLogin, ValueError) as e:
            return jsonify(erro=str(e)), 400

    @app.post("/api/sessao/jogador/remover")
    @login_obrigatorio(api=True)
    def api_jogador_local_remover():
        dados = _json()
        with db.conectar() as con:
            dono = _minha_participacao(con, dados)
            local_id = int(dados.get("local_id") or 0)
            if any(l["participacao_id"] == local_id for l in db.jogadores_locais(con, dono)):
                db.encerrar_participacao(con, local_id)
            return jsonify(locais=db.jogadores_locais(con, dono))

    # ---------- partidas e resultado ----------

    @app.get("/api/partidas/<int:partida_id>")
    def api_partida(partida_id):
        with db.conectar() as con:
            partida = db.partida_detalhe(con, partida_id)
        if not partida:
            abort(404)
        return jsonify(partida)

    @app.post("/api/partidas/<int:partida_id>/resultado")
    @login_obrigatorio(api=True)
    def api_resultado(partida_id):
        dados = _json()
        placar = (dados.get("placar") or "").strip()[:40]
        vencedor = dados.get("vencedor_id") or None
        if vencedor:
            vencedor = _jogador_id(vencedor)
        with db.conectar() as con:
            if not db.partida_detalhe(con, partida_id):
                abort(404)
            try:
                db.salvar_resultado(con, partida_id, placar, vencedor, bool(dados.get("empate")))
            except ValueError as e:
                abort(400, str(e))
        return jsonify(ok=True)

    # ---------- saves (estados salvos) ----------

    @app.post("/api/saves")
    @login_obrigatorio(api=True)
    def api_save_novo():
        jogador_id = request.jogador["id"]
        jogo = jogo_por_id(request.form.get("game_id"))
        estado = request.files.get("estado")
        if not estado:
            abort(400, "Faltou o estado")
        if request.content_length and request.content_length > MAX_SAVE_BYTES:
            abort(413)

        pasta_rel = os.path.join(jogador_id, str(jogo["game_id"]))
        pasta = os.path.join(db.SAVES_DIR, pasta_rel)
        os.makedirs(pasta, exist_ok=True)
        base = uuid.uuid4().hex
        arquivo = os.path.join(pasta_rel, base + ".state")
        estado.save(os.path.join(db.SAVES_DIR, arquivo))

        imagem = None
        foto = request.files.get("imagem")
        ext = FORMATOS_IMAGEM.get((request.form.get("formato") or "").lower())
        if foto and ext:
            imagem = os.path.join(pasta_rel, f"{base}.{ext}")
            foto.save(os.path.join(db.SAVES_DIR, imagem))

        with db.conectar() as con:
            save_id = db.registrar_save(con, jogador_id, jogo, arquivo, imagem)
        return jsonify(id=save_id)

    @app.get("/api/saves")
    @login_obrigatorio(api=True)
    def api_saves():
        jogador_id = request.jogador["id"]
        with db.conectar() as con:
            saves = db.listar_saves(con, jogador_id, int(request.args.get("game_id") or 0))
        for s in saves:
            s["quando"] = data_hora(s["criado_em"])
            s["imagem_url"] = f"/saves/{s['id']}/imagem" if s.pop("imagem") else None
        return jsonify(saves)

    def _save_do_jogador(save_id):
        """Cada jogador só vê, carrega e apaga os próprios saves."""
        with db.conectar() as con:
            save = db.obter_save(con, save_id)
        if not save or save["jogador_id"] != request.jogador["id"]:
            abort(404)
        return save

    @app.get("/saves/<int:save_id>/estado")
    @login_obrigatorio(api=True)
    def save_estado(save_id):
        save = _save_do_jogador(save_id)
        return send_from_directory(db.SAVES_DIR, save["arquivo"], mimetype="application/octet-stream")

    @app.get("/saves/<int:save_id>/imagem")
    @login_obrigatorio(api=True)
    def save_imagem(save_id):
        save = _save_do_jogador(save_id)
        if not save["imagem"]:
            abort(404)
        return send_from_directory(db.SAVES_DIR, save["imagem"], max_age=86400)

    @app.delete("/api/saves/<int:save_id>")
    @login_obrigatorio(api=True)
    def api_save_apagar(save_id):
        save = _save_do_jogador(save_id)
        for campo in ("arquivo", "imagem"):
            if save[campo]:
                try:
                    os.remove(os.path.join(db.SAVES_DIR, save[campo]))
                except FileNotFoundError:
                    pass
        with db.conectar() as con:
            db.apagar_save(con, save_id)
        return jsonify(ok=True)

    # ---------- página de histórico ----------

    @app.get("/historico")
    def historico():
        with db.conectar() as con:
            stats = db.estatisticas(con)
            partidas = db.partidas_recentes(con)
        return render_template("historico.html", stats=stats, partidas=partidas)
