"""Avatar de cada jogador: uma cor e um ícone (pixel art desenhado aqui) ou uma foto.

Quem não escolheu nada fica com a inicial do nome numa cor fixa (tirada do id, então
não muda quando a lista de jogadores muda). A foto, se houver, substitui o ícone; ela
é recortada e reduzida no navegador (256x256, JPEG) antes de vir para o servidor.

Nas páginas: {{ avatar(jogador_id, nome) }} (context processor abaixo).
  POST   /api/conta/avatar        {cor, icone}   (icone "" = inicial do nome)
  POST   /api/conta/avatar/foto   corpo: o JPEG
  DELETE /api/conta/avatar/foto
  GET    /avatar/<arquivo>.jpg
"""
import os
import re
import time
import zlib
from functools import lru_cache

from flask import abort, g, jsonify, request, send_from_directory
from markupsafe import Markup, escape

import db
from auth import login_obrigatorio

PASTA = os.path.join(db.DATA_DIR, "avatares")
FOTO_MAX = 400 * 1024

# cor -> (fundo, tinta do ícone/letra)
CORES = {
    "roxo": ("#4d3f8c", "#fff"),
    "vermelho": ("#c8323c", "#fff"),
    "laranja": ("#e0662b", "#fff"),
    "amarelo": ("#e2a91f", "#2b2b31"),
    "verde": ("#2b8a4c", "#fff"),
    "ciano": ("#1f8fa6", "#fff"),
    "azul": ("#2d5bb4", "#fff"),
    "rosa": ("#cf4a86", "#fff"),
    "marrom": ("#7a4e2d", "#fff"),
    "grafite": ("#2b2b31", "#fff"),
}
_ORDEM_CORES = list(CORES)

# ícones em pixel art, 12x12 ("#" = pixel aceso). Desenhos próprios, genéricos.
ICONES = {
    "controle": [
        "............",
        "............",
        "...######...",
        ".##########.",
        "##.########.",
        "#...####.#.#",
        "##.######.##",
        "############",
        "####....####",
        ".##......##.",
        "............",
        "............",
    ],
    "cogumelo": [
        "....####....",
        "..########..",
        ".###.##.###.",
        ".##......##.",
        "###.####.###",
        "############",
        "############",
        "...######...",
        "...#.##.#...",
        "...######...",
        "...######...",
        "............",
    ],
    "fantasma": [
        "....####....",
        "..########..",
        ".##########.",
        ".#..###..##.",
        ".#..###..##.",
        ".##########.",
        ".##########.",
        ".##########.",
        ".##########.",
        ".##.####.##.",
        ".#...##...#.",
        "............",
    ],
    "estrela": [
        ".....##.....",
        ".....##.....",
        "....####....",
        "############",
        ".##########.",
        "..########..",
        "...######...",
        "...######...",
        "..###..###..",
        "..##....##..",
        ".##......##.",
        "............",
    ],
    "coracao": [
        "............",
        ".###....###.",
        "#####..#####",
        "############",
        "############",
        "############",
        ".##########.",
        "..########..",
        "...######...",
        "....####....",
        ".....##.....",
        "............",
    ],
    "raio": [
        "......####..",
        ".....####...",
        "....####....",
        "...####.....",
        "..#######...",
        ".#######....",
        "....####....",
        "...####.....",
        "..####......",
        "..###.......",
        ".##.........",
        "............",
    ],
    "coroa": [
        "............",
        "#....##....#",
        "##...##...##",
        "###.####.###",
        "############",
        "############",
        "##.##..##.##",
        "############",
        "############",
        "............",
        "............",
        "............",
    ],
    "carro": [
        "............",
        "............",
        "............",
        "....####....",
        "...##..##...",
        "..##....##..",
        "############",
        "############",
        "############",
        ".###....###.",
        ".###....###.",
        "............",
    ],
    "bola": [
        "....####....",
        "..###..###..",
        ".####..####.",
        ".####..####.",
        "#####..#####",
        "............",
        "#####..#####",
        ".####..####.",
        ".####..####.",
        "..###..###..",
        "....####....",
        "............",
    ],
    "foguete": [
        ".....##.....",
        "....####....",
        "....####....",
        "...######...",
        "...##..##...",
        "...##..##...",
        "...######...",
        "...######...",
        "..########..",
        ".###.##.###.",
        ".##..##..##.",
        ".....##.....",
    ],
    "robo": [
        ".....##.....",
        "..########..",
        ".##########.",
        ".#..####..#.",
        ".#..####..#.",
        ".##########.",
        ".###....###.",
        ".##########.",
        "...######...",
        ".##########.",
        ".##.####.##.",
        ".##.####.##.",
    ],
    "gato": [
        ".#........#.",
        ".##......##.",
        ".###....###.",
        ".##########.",
        "############",
        "###..##..###",
        "###..##..###",
        "############",
        "#####..#####",
        ".####..####.",
        "..########..",
        "............",
    ],
    "espada": [
        "..........##",
        ".........###",
        "........###.",
        ".......###..",
        "......###...",
        ".....###....",
        ".#..###.....",
        ".#####......",
        "..###.......",
        ".#####......",
        "##..#.......",
        "#...........",
    ],
    "escudo": [
        "############",
        "############",
        "#####..#####",
        "#####..#####",
        "##........##",
        "##........##",
        "#####..#####",
        ".####..####.",
        ".##########.",
        "..########..",
        "...######...",
        ".....##.....",
    ],
    "moeda": [
        "...######...",
        ".##########.",
        ".###....###.",
        "###..##..###",
        "###.####.###",
        "###.####.###",
        "###.####.###",
        "###.####.###",
        "###..##..###",
        ".###....###.",
        ".##########.",
        "...######...",
    ],
    "trofeu": [
        ".##########.",
        "##.######.##",
        "#..######..#",
        "#..######..#",
        "##.######.##",
        ".##########.",
        "...######...",
        ".....##.....",
        ".....##.....",
        "....####....",
        "..########..",
        "..########..",
    ],
    "nota": [
        ".......#####",
        ".....#######",
        ".....###..##",
        ".....##...##",
        ".....##...##",
        ".....##...##",
        ".....##...##",
        "..####..####",
        ".#####.#####",
        ".#####.#####",
        "..###...###.",
        "............",
    ],
    "lua": [
        "....####....",
        "..####......",
        ".####.......",
        ".###........",
        "####........",
        "####........",
        "####........",
        "####........",
        ".####.......",
        ".#####...##.",
        "..########..",
        "....####....",
    ],
    "sol": [
        ".....##.....",
        ".#...##...#.",
        "..#......#..",
        "....####....",
        "...######...",
        "##.######.##",
        "##.######.##",
        "...######...",
        "....####....",
        "..#......#..",
        ".#...##...#.",
        ".....##.....",
    ],
    "peixe": [
        "............",
        "............",
        ".....###....",
        "..#######..#",
        ".#########.#",
        "##.#######.#",
        "##########..",
        ".#########.#",
        "..#######..#",
        ".....###....",
        "............",
        "............",
    ],
    "bomba": [
        ".........#..",
        "........#.#.",
        ".......#....",
        ".....###....",
        "...######...",
        "..########..",
        ".##.#######.",
        ".#.########.",
        ".##########.",
        ".##########.",
        "..########..",
        "...######...",
    ],
    "chave": [
        "............",
        "............",
        "............",
        ".####.......",
        "##..##......",
        "#....#######",
        "#....#######",
        "##..##..#.##",
        ".####...#.##",
        "............",
        "............",
        "............",
    ],
    "dado": [
        "............",
        ".##########.",
        "############",
        "##..####..##",
        "##..####..##",
        "#####..#####",
        "#####..#####",
        "##..####..##",
        "##..####..##",
        "############",
        ".##########.",
        "............",
    ],
    "arvore": [
        ".....##.....",
        "....####....",
        "...######...",
        "..########..",
        "....####....",
        "...######...",
        "..########..",
        ".##########.",
        "....####....",
        ".....##.....",
        ".....##.....",
        "....####....",
    ],
}


@lru_cache(maxsize=None)
def caminho_icone(nome):
    """Desenho do ícone como um único caminho SVG (um retângulo por trecho aceso)."""
    partes = []
    for y, linha in enumerate(ICONES.get(nome, [])):
        x = 0
        while x < len(linha):
            if linha[x] == "#":
                ini = x
                while x < len(linha) and linha[x] == "#":
                    x += 1
                partes.append(f"M{ini} {y}h{x - ini}v1h-{x - ini}z")
            else:
                x += 1
    return "".join(partes)


def svg_icone(nome):
    return Markup(
        '<svg class="avatar-icone" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">'
        f'<path d="{caminho_icone(nome)}"/></svg>'
    )


def cor_padrao(jogador_id):
    return _ORDEM_CORES[zlib.crc32(str(jogador_id).encode()) % len(_ORDEM_CORES)]


def estilo_cor(cor):
    fundo, tinta = CORES.get(cor, CORES["roxo"])
    return f"--cor:{fundo};--tinta:{tinta}"


def _dados():
    """Avatares de todos os jogadores, lidos uma vez por página."""
    if "avatares" not in g:
        with db.ler() as con:
            g.avatares = db.avatares(con)
    return g.avatares


def info_avatar(jogador_id):
    """Avatar de um jogador já com a cor resolvida (para o diálogo de escolha)."""
    a = _dados().get(jogador_id) or {}
    return {"cor": a.get("cor") if a.get("cor") in CORES else cor_padrao(jogador_id),
            "icone": a.get("icone") if a.get("icone") in ICONES else "",
            "foto": f"/avatar/{a['foto']}" if a.get("foto") else ""}


def html_avatar(jogador_id, nome, classe=""):
    a = _dados().get(jogador_id) or {}
    cor = a.get("cor") if a.get("cor") in CORES else cor_padrao(jogador_id)
    classes = "avatar" + (f" {classe}" if classe else "")
    if a.get("foto"):
        dentro = Markup(f'<img src="/avatar/{escape(a["foto"])}" alt="" loading="lazy">')
        classes += " avatar-com-foto"
    elif a.get("icone") in ICONES:
        dentro = svg_icone(a["icone"])
    else:
        dentro = escape((nome or "?")[:1].upper())
    return Markup(f'<span class="{classes}" style="{estilo_cor(cor)}" aria-hidden="true">{dentro}</span>')


_ARQUIVO = re.compile(r"^[0-9a-f]{8}-\d+\.jpg$")


def _apagar_foto(arquivo):
    if arquivo and _ARQUIVO.match(arquivo):
        try:
            os.remove(os.path.join(PASTA, arquivo))
        except OSError:
            pass


def register_avatares(app):

    @app.context_processor
    def injetar_avatar():
        return {"avatar": html_avatar, "info_avatar": info_avatar, "cores_avatar": CORES,
                "icones_avatar": list(ICONES), "svg_icone": svg_icone}

    @app.get("/avatar/<arquivo>")
    def foto_avatar(arquivo):
        if not _ARQUIVO.match(arquivo):
            abort(404)
        # o nome muda a cada foto nova, então pode guardar no navegador por bastante tempo
        return send_from_directory(PASTA, arquivo, max_age=30 * 24 * 3600)

    @app.post("/api/conta/avatar")
    @login_obrigatorio(api=True)
    def api_avatar():
        dados = request.get_json(silent=True) or {}
        cor = str(dados.get("cor", ""))
        icone = str(dados.get("icone", ""))
        if cor not in CORES or (icone and icone not in ICONES):
            return jsonify(erro="Cor ou ícone desconhecido."), 400
        with db.conectar() as con:
            db.definir_avatar(con, request.jogador["id"], cor, icone or None)
        return jsonify(ok=True)

    @app.post("/api/conta/avatar/foto")
    @login_obrigatorio(api=True)
    def api_avatar_foto():
        corpo = request.get_data(cache=False)
        if not corpo or len(corpo) > FOTO_MAX:
            return jsonify(erro="A foto é grande demais."), 400
        if not corpo.startswith(b"\xff\xd8\xff"):
            return jsonify(erro="A foto precisa ser JPEG."), 400
        os.makedirs(PASTA, exist_ok=True)
        base = f"{zlib.crc32(str(request.jogador['id']).encode()):08x}"
        arquivo = f"{base}-{int(time.time() * 1000)}.jpg"
        temp = os.path.join(PASTA, arquivo + ".tmp")
        with open(temp, "wb") as f:
            f.write(corpo)
        os.replace(temp, os.path.join(PASTA, arquivo))
        with db.conectar() as con:
            antiga = db.definir_foto_avatar(con, request.jogador["id"], arquivo)
        _apagar_foto(antiga)
        return jsonify(ok=True, foto=arquivo)

    @app.delete("/api/conta/avatar/foto")
    @login_obrigatorio(api=True)
    def api_avatar_tirar_foto():
        with db.conectar() as con:
            antiga = db.definir_foto_avatar(con, request.jogador["id"], None)
        _apagar_foto(antiga)
        return jsonify(ok=True)
