"""Envio de ROMs pelo navegador: a ROM vai para roms/<console>/ e já aparece no menu.

Cada envio tem no máximo LIMITE_ENVIO e precisa deixar RESERVA livre no disco, para um
envio grande não encher o disco do servidor.
"""
import os
import shutil

from flask import jsonify, render_template, request

import capas
from auth import login_obrigatorio
from games import CONSOLES


CONSOLES_POR_LABEL = {label: key for key, (label, _, _) in CONSOLES.items()}
GB = 1024 ** 3
LIMITE_ENVIO = 4 * GB   # por envio (dá uns 5 jogos de PlayStation de uma vez)
RESERVA = 2 * GB        # espaço que precisa sobrar no disco depois do envio


def _console_for(filename, chosen):
    """Console escolhido no formulário, ou adivinhado pela extensão."""
    ext = os.path.splitext(filename)[1].lower()
    if chosen in CONSOLES:
        return chosen if ext in CONSOLES[chosen][2] else None
    matches = [key for key, (_, _, exts) in CONSOLES.items() if ext in exts]
    return matches[0] if len(matches) == 1 else None


def _safe_name(filename):
    """Mantém espaços e parênteses (o título sai do nome), mas nada de caminhos."""
    name = os.path.basename(filename.replace("\\", "/")).strip()
    if not name or name.startswith(".") or "\x00" in name:
        return None
    return name


def register_uploads(app, catalog):

    @app.get("/enviar")
    @login_obrigatorio()
    def upload_page():
        consoles = [(key, label, sorted(exts)) for key, (label, _, exts) in CONSOLES.items()]
        return render_template("upload.html", consoles=consoles)

    def _livre():
        return shutil.disk_usage(catalog.roms_dir if os.path.isdir(catalog.roms_dir) else catalog.base_dir).free

    @app.get("/api/roms/espaco")
    @login_obrigatorio(api=True)
    def espaco_roms():
        """Quanto ainda dá para enviar (a página confere antes de mandar)."""
        return jsonify(limite=LIMITE_ENVIO, disponivel=max(0, _livre() - RESERVA))

    @app.post("/api/roms")
    @login_obrigatorio(api=True)
    def upload_roms():
        # confere o tamanho ANTES de ler o corpo (ler já grava os arquivos em disco)
        tamanho = request.content_length
        if tamanho is None:
            return jsonify(erro="Envio sem tamanho informado."), 411
        if tamanho > LIMITE_ENVIO:
            return jsonify(erro=f"Envio grande demais: no máximo {LIMITE_ENVIO // GB} GB de cada vez."), 413
        if _livre() - tamanho < RESERVA:
            return jsonify(erro="Pouco espaço livre no servidor para esse envio."), 507
        chosen = request.form.get("console", "auto")
        results = []
        for file in request.files.getlist("roms"):
            name = _safe_name(file.filename or "")
            console = _console_for(name, chosen) if name else None
            if not console:
                results.append({"arquivo": file.filename, "ok": False,
                                "erro": "Extensão não reconhecida para esse console"})
                continue
            folder = os.path.join(catalog.roms_dir, console)
            os.makedirs(folder, exist_ok=True)
            dest = os.path.join(folder, name)
            if os.path.exists(dest):
                results.append({"arquivo": name, "ok": False, "erro": "Já existe um jogo com esse nome"})
                continue
            file.save(dest)
            results.append({"arquivo": name, "ok": True, "console": CONSOLES[console][0]})
        novas = {f"{CONSOLES_POR_LABEL[r['console']]}/{r['arquivo']}" for r in results if r["ok"]}
        if novas:
            # busca a capa das ROMs novas sem fazer quem enviou esperar
            capas.em_segundo_plano(capas.baixar_faltantes, catalog.base_dir, roms=novas, avisar=lambda m: None)
        return jsonify(results)
