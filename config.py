"""Configurações do servidor guardadas em dados/config.json (hoje: a porta)."""
import json
import os

import db

PORTA_PADRAO = 5000


def _arquivo():
    os.makedirs(db.DATA_DIR, exist_ok=True)
    return os.path.join(db.DATA_DIR, "config.json")


def ler():
    try:
        with open(_arquivo()) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def gravar(**valores):
    dados = ler()
    dados.update(valores)
    caminho = _arquivo()
    with open(caminho + ".tmp", "w") as f:
        json.dump(dados, f, indent=1)
    os.replace(caminho + ".tmp", caminho)


def porta():
    try:
        return int(ler().get("porta", PORTA_PADRAO))
    except (TypeError, ValueError):
        return PORTA_PADRAO
