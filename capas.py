"""Baixa as capas dos jogos do libretro-thumbnails (o mesmo acervo do RetroArch).

Uso automático: o servidor chama baixar_faltantes() ao ligar e baixar_para() após
cada envio de ROM, em segundo plano. Sem internet, simplesmente não baixa nada.

Uso manual:  python capas.py            (só as que faltam)
             python capas.py --de-novo  (tenta também as que não foram achadas antes)

A capa vai para covers/<console>/<slug>.png e o cartucho passa a mostrá-la.
"""
import difflib
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from games import Catalog, clean_title

BASE_URL = "https://thumbnails.libretro.com"
SISTEMAS = {
    "snes": ["Nintendo - Super Nintendo Entertainment System"],
    "nes": ["Nintendo - Nintendo Entertainment System"],
    "n64": ["Nintendo - Nintendo 64"],
    "gba": ["Nintendo - Game Boy Advance"],
    "gb": ["Nintendo - Game Boy", "Nintendo - Game Boy Color"],
    "megadrive": ["Sega - Mega Drive - Genesis"],
    "psx": ["Sony - PlayStation"],
}
# preferência de região quando há várias versões
REGIOES = ["USA", "World", "Europe", "Brazil", "Japan"]
DESCARTAR = re.compile(r"\((Beta|Proto|Demo|Sample|Pirate|Unl)[^)]*\)", re.I)
MAX_BYTES = 5 * 1024 * 1024
TENTAR_DE_NOVO_SEG = 7 * 24 * 3600
AGENTE = "classic-games-lan (uso doméstico)"

_listas = {}                 # cache das listagens de cada sistema
_lock = threading.Lock()
_lock_falhas = threading.Lock()   # o arquivo de "não achadas" é usado por mais de uma thread


def _base_dir():
    return os.path.dirname(os.path.abspath(__file__))


def _arquivo_falhas():
    dados = os.environ.get("CG_DADOS") or os.path.join(_base_dir(), "dados")
    os.makedirs(dados, exist_ok=True)
    return os.path.join(dados, "capas_nao_achadas.json")


def _ler_falhas():
    try:
        with open(_arquivo_falhas()) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _gravar_falhas(falhas):
    with open(_arquivo_falhas(), "w") as f:
        json.dump(falhas, f, ensure_ascii=False, indent=1)


def _baixar(url, limite=MAX_BYTES):
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    with urllib.request.urlopen(req, timeout=15) as r:
        dados = r.read(limite + 1)
        if len(dados) > limite:
            raise ValueError("arquivo grande demais")
        return dados, r.headers.get("Content-Type", "")


def _nome_libretro(nome):
    """O libretro troca estes caracteres por _ no nome do arquivo."""
    return re.sub(r'[&*/:`<>?\\|"]', "_", nome)


def _url(sistema, nome_arquivo):
    caminho = f"/{sistema}/Named_Boxarts/{nome_arquivo}"
    return BASE_URL + urllib.parse.quote(caminho)


def _lista(sistema):
    """Nomes (sem .png) de todas as capas de um sistema."""
    with _lock:
        if sistema in _listas:
            return _listas[sistema]
    html, _ = _baixar(BASE_URL + urllib.parse.quote(f"/{sistema}/Named_Boxarts/"), limite=20 * 1024 * 1024)
    nomes = [urllib.parse.unquote(h)[:-4] for h in re.findall(r'href="([^"?/][^"]*\.png)"', html.decode("utf-8", "replace"))]
    with _lock:
        _listas[sistema] = nomes
    return nomes


def _normalizar(titulo):
    return re.sub(r"[^a-z0-9]", "", titulo.lower())


def _melhor_candidato(titulo, nomes):
    """Escolhe a capa cujo título bate com o do jogo, preferindo a região dos EUA."""
    alvo = _normalizar(titulo)
    validos = [n for n in nomes if not DESCARTAR.search(n)]
    por_titulo = {}
    for n in validos:
        por_titulo.setdefault(_normalizar(clean_title(n + ".x")), []).append(n)

    iguais = por_titulo.get(alvo)
    if not iguais:
        parecidos = difflib.get_close_matches(alvo, por_titulo.keys(), n=1, cutoff=0.88)
        if not parecidos:
            return None
        iguais = por_titulo[parecidos[0]]

    def peso(n):
        for i, regiao in enumerate(REGIOES):
            if f"({regiao}" in n or f", {regiao}" in n:
                return i
        return len(REGIOES)
    return sorted(iguais, key=lambda n: (peso(n), len(n)))[0]


def baixar_para(jogo, covers_dir, falhas=None):
    """Baixa a capa de um jogo. Devolve True se baixou."""
    sistemas = SISTEMAS.get(jogo["console"])
    if not sistemas:
        return False
    nome_rom = os.path.splitext(os.path.basename(jogo["rom"]))[0]
    destino = os.path.join(covers_dir, jogo["console"], f"{jogo['slug']}.png")

    for sistema in sistemas:
        tentativas = [_nome_libretro(nome_rom)]
        try:
            candidato = _melhor_candidato(jogo["title"], _lista(sistema))
            if candidato and candidato not in tentativas:
                tentativas.append(candidato)
        except (urllib.error.URLError, OSError, ValueError):
            pass   # sem a lista, ainda tenta o nome exato
        for nome in tentativas:
            try:
                dados, tipo = _baixar(_url(sistema, nome + ".png"))
            except (urllib.error.URLError, OSError, ValueError):
                continue
            if not dados.startswith(b"\x89PNG") and "image" not in tipo:
                continue
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            with open(destino + ".tmp", "wb") as f:
                f.write(dados)
            os.replace(destino + ".tmp", destino)
            if falhas is not None:
                falhas.pop(jogo["rom"], None)
            return True

    if falhas is not None:
        falhas[jogo["rom"]] = int(time.time())
    return False


def baixar_faltantes(base_dir=None, de_novo=False, avisar=print, roms=None):
    """Baixa as capas dos jogos que ainda não têm (ou só das ROMs indicadas)."""
    catalogo = Catalog(base_dir or _base_dir())
    with _lock_falhas:
        falhas = _ler_falhas()
    agora = time.time()
    baixadas = 0
    for jogo in catalogo.scan():
        if jogo["cover"] or (roms is not None and jogo["rom"] not in roms):
            continue
        ultima = falhas.get(jogo["rom"])
        if ultima and not de_novo and agora - ultima < TENTAR_DE_NOVO_SEG:
            continue
        if baixar_para(jogo, catalogo.covers_dir, falhas):
            baixadas += 1
            avisar(f"  capa baixada: {jogo['title']}")
        else:
            avisar(f"  capa não encontrada: {jogo['title']}")
    with _lock_falhas:
        gravadas = _ler_falhas()
        gravadas.update({k: v for k, v in falhas.items()})
        for rom in [r for r in gravadas if r not in falhas]:
            if roms is None or rom in roms:
                gravadas.pop(rom)
        _gravar_falhas(gravadas)
    return baixadas


def em_segundo_plano(func, *args, **kwargs):
    threading.Thread(target=func, args=args, kwargs=kwargs, daemon=True).start()


if __name__ == "__main__":
    total = baixar_faltantes(de_novo="--de-novo" in sys.argv)
    print(f"{total} capa(s) baixada(s).")
