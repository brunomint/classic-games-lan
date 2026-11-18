"""Baixa as capas dos jogos do libretro-thumbnails (o mesmo acervo do RetroArch).

Primeiro pelo repositório no GitHub (github.com/libretro-thumbnails): um clone "vazio"
traz só a lista de arquivos e depois o git baixa, de uma vez, apenas as capas que faltam.
O que não sair por ali (ou se não houver git) vai uma a uma pelo thumbnails.libretro.com.

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
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from games import Catalog, clean_title

BASE_URL = "https://thumbnails.libretro.com"
REPOSITORIO = "https://github.com/libretro-thumbnails/{}.git"   # "Sony - PlayStation" → Sony_-_PlayStation
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
AGENTE = "fliperama-de-casa (uso doméstico)"

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
    t = re.sub(r"^the\s+|,\s*the\b", "", titulo.lower().replace("_", "'"))   # "7th Saga, The" = "7th Saga"
    return re.sub(r"[^a-z0-9]", "", t)


def _melhor_candidato(titulo, nomes):
    """Escolhe a capa cujo título bate com o do jogo, preferindo a região dos EUA."""
    titulo = re.sub(r"\s*\(PT-BR\)$", "", titulo)   # tradução usa a capa do original
    titulo = re.sub(r"\s+v\d+(\.\d+)*$", "", titulo)    # "Breath of Fire v1.10" (versão da tradução)
    alvo = _normalizar(titulo)
    iguais = None
    # primeiro só versões lançadas; protótipo/demo só se não houver outra
    for grupo in ([n for n in nomes if not DESCARTAR.search(n)], list(nomes)):
        por_titulo = {}
        for n in grupo:
            por_titulo.setdefault(_normalizar(clean_title(n + ".x")), []).append(n)
        iguais = por_titulo.get(alvo)
        if not iguais:
            parecidos = difflib.get_close_matches(alvo, por_titulo.keys(), n=1, cutoff=0.88)
            iguais = por_titulo[parecidos[0]] if parecidos else None
        if iguais:
            break
    if not iguais:
        return None

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

    respondeu = False   # o site das capas respondeu alguma vez (sem internet não é "não achou")
    for sistema in sistemas:
        tentativas = [_nome_libretro(nome_rom)]
        try:
            candidato = _melhor_candidato(jogo["title"], _lista(sistema))
            respondeu = True
            if candidato and candidato not in tentativas:
                tentativas.append(candidato)
        except (urllib.error.URLError, OSError, ValueError) as e:
            respondeu = respondeu or isinstance(e, urllib.error.HTTPError)
            # sem a lista, ainda tenta o nome exato
        for nome in tentativas:
            try:
                dados, tipo = _baixar(_url(sistema, nome + ".png"))
                respondeu = True
            except (urllib.error.URLError, OSError, ValueError) as e:
                respondeu = respondeu or isinstance(e, urllib.error.HTTPError)
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

    if falhas is not None and respondeu:
        falhas[jogo["rom"]] = int(time.time())
    return False


def _git(pasta, *args, entrada=None):
    return subprocess.run(["git", "-C", pasta, *args], input=entrada, capture_output=True,
                          text=True, timeout=1800, check=True).stdout


def _repositorio(sistema):
    """Clone sem arquivos (só a lista) do repositório de capas, guardado em dados/."""
    pasta = os.path.join(os.path.dirname(_arquivo_falhas()), "capas-repositorio", sistema.replace(" ", "_"))
    if os.path.isdir(os.path.join(pasta, ".git")):
        try:
            _git(pasta, "fetch", "-q", "--depth", "1", "origin", "HEAD")
            _git(pasta, "update-ref", "HEAD", "FETCH_HEAD")
        except (subprocess.SubprocessError, OSError):
            pass   # sem internet: usa a lista que já tem
    else:
        shutil.rmtree(pasta, ignore_errors=True)
        os.makedirs(os.path.dirname(pasta), exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--filter=blob:none", "--no-checkout", "--depth", "1",
                        REPOSITORIO.format(sistema.replace(" ", "_")), pasta],
                       capture_output=True, timeout=600, check=True)
    return pasta


def baixar_do_repositorio(jogos, covers_dir, falhas=None, avisar=print):
    """Capas de vários jogos pelo GitHub, num lote só. Devolve os jogos que ganharam capa."""
    if not shutil.which("git"):
        return []
    feitos = []
    for console in sorted({j["console"] for j in jogos}):
        for sistema in SISTEMAS.get(console, []):
            faltam = [j for j in jogos if j["console"] == console and j not in feitos]
            if not faltam:
                break
            try:
                pasta = _repositorio(sistema)
                arvore = {}   # caminho → (modo, sha)
                for linha in _git(pasta, "ls-tree", "-r", "HEAD", "Named_Boxarts/").splitlines():
                    info, caminho = linha.split("\t", 1)
                    if caminho.endswith(".png"):
                        modo, _, sha = info.split()
                        arvore[caminho] = (modo, sha)
            except (subprocess.SubprocessError, OSError, ValueError):
                avisar(f"  repositório de capas indisponível: {sistema}")
                continue
            nomes = {a[len("Named_Boxarts/"):-4] for a in arvore}
            escolha = {}
            for j in faltam:
                exato = _nome_libretro(os.path.splitext(os.path.basename(j["rom"]))[0])
                nome = exato if exato in nomes else _melhor_candidato(j["title"], nomes)
                if nome:
                    escolha[j["rom"]] = f"Named_Boxarts/{nome}.png"
            if not escolha:
                continue
            # várias versões (ex.: "(Rev 1)") são atalhos para a capa principal: segue o atalho
            atalhos = sorted({c for c in escolha.values() if arvore[c][0] == "120000"})
            if atalhos:
                try:
                    saida = _git(pasta, "cat-file", "--batch", entrada="".join(arvore[c][1] + "\n" for c in atalhos))
                    alvos = re.findall(r"^\S+ blob \d+\n(.*)$", saida, re.M)
                    for c, alvo in zip(atalhos, alvos):
                        real = os.path.normpath(os.path.join(os.path.dirname(c), alvo.strip()))
                        for rom, cam in escolha.items():
                            if cam == c and real in arvore:
                                escolha[rom] = real
                except (subprocess.SubprocessError, OSError):
                    pass
            avisar(f"  baixando {len(set(escolha.values()))} capa(s) de {sistema} pelo GitHub...")
            try:
                # só os arquivos escolhidos: o git busca todos numa conexão
                _git(pasta, "sparse-checkout", "set", "--no-cone", "--stdin",
                     entrada="".join("/" + re.sub(r"([*?\[\\!#])", r"\\\1", c) + "\n" for c in set(escolha.values())))
                _git(pasta, "checkout", "-q", "HEAD")
            except (subprocess.SubprocessError, OSError):
                avisar(f"  não deu para baixar as capas de {sistema}")
                continue
            for j in faltam:
                origem = os.path.join(pasta, escolha.get(j["rom"], "-"))
                if not os.path.isfile(origem):
                    continue
                with open(origem, "rb") as f:
                    if f.read(8) != b"\x89PNG\r\n\x1a\n":
                        continue   # ponteiro do git-lfs ou arquivo estragado
                destino = os.path.join(covers_dir, console, f"{j['slug']}.png")
                os.makedirs(os.path.dirname(destino), exist_ok=True)
                shutil.copyfile(origem, destino + ".tmp")
                os.replace(destino + ".tmp", destino)
                if falhas is not None:
                    falhas.pop(j["rom"], None)
                feitos.append(j)
            # as imagens já foram copiadas: o clone volta a guardar só a lista
            try:
                _git(pasta, "sparse-checkout", "set", "--no-cone", "/.nada")
            except (subprocess.SubprocessError, OSError):
                pass
    return feitos


def baixar_faltantes(base_dir=None, de_novo=False, avisar=print, roms=None):
    """Baixa as capas dos jogos que ainda não têm (ou só das ROMs indicadas)."""
    catalogo = Catalog(base_dir or _base_dir())
    with _lock_falhas:
        falhas = _ler_falhas()
    agora = time.time()
    pendentes = []
    for jogo in catalogo.scan():
        if jogo["cover"] or (roms is not None and jogo["rom"] not in roms):
            continue
        ultima = falhas.get(jogo["rom"])
        if ultima and not de_novo and agora - ultima < TENTAR_DE_NOVO_SEG:
            continue
        pendentes.append(jogo)

    feitos = baixar_do_repositorio(pendentes, catalogo.covers_dir, falhas, avisar) if pendentes else []
    baixadas = len(feitos)
    for jogo in pendentes:
        if jogo in feitos:
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
