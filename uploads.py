"""Envio de ROMs pelo navegador: a ROM vai para roms/<console>/ e já aparece no menu."""
import os

from flask import jsonify, render_template, request

from games import CONSOLES


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
    def upload_page():
        consoles = [(key, label, sorted(exts)) for key, (label, _, exts) in CONSOLES.items()]
        return render_template("upload.html", consoles=consoles)

    @app.post("/api/roms")
    def upload_roms():
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
        return jsonify(results)
