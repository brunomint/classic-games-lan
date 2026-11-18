"""Catálogo automático: lê roms/<console>/ e monta a lista de jogos.

Para adicionar um jogo basta colocar a ROM na pasta do console certo.
"""
import json
import os
import re
import time
import zlib

# pasta em roms/  ->  (nome exibido, core do EmulatorJS, extensões aceitas)
CONSOLES = {
    "snes":      ("Super Nintendo", "snes",   {".sfc", ".smc", ".zip"}),
    "nes":       ("Nintendinho",    "nes",    {".nes"}),
    "n64":       ("Nintendo 64",    "n64",    {".z64", ".n64", ".v64"}),
    "gba":       ("Game Boy Advance", "gba",  {".gba"}),
    "gb":        ("Game Boy / Color", "gb",   {".gb", ".gbc"}),
    "megadrive": ("Mega Drive",     "segaMD", {".md", ".gen", ".smd"}),
    "psx":       ("PlayStation",    "psx",    {".bin", ".cue", ".chd", ".pbp", ".iso"}),
}

# BIOS opcional por console (arquivo dentro de bios/)
BIOS = {
    "psx": "scph5501.bin",
}

COVER_EXTS = (".jpg", ".jpeg", ".png", ".webp")

# Jogos achados em outras pastas (busca do app de Android): sem a pasta do console para
# dizer o que é, só valem as extensões que não deixam dúvida. Um .bin solto ou um .iso pode
# ser qualquer coisa (o .bin do PlayStation entra pelo .cue); o .zip só numa pasta com
# "snes" no caminho.
EXTS_ACHADOS = {
    "snes": {".sfc", ".smc"},
    "nes": {".nes"},
    "n64": {".z64", ".n64", ".v64"},
    "gba": {".gba"},
    "gb": {".gb", ".gbc"},
    "megadrive": {".md", ".gen", ".smd"},
    "psx": {".cue", ".chd", ".pbp"},
}


def parece_jogo(caminho):
    """ROM é arquivo binário; um texto com a mesma extensão (o .md do Markdown, por exemplo)
    não tem bytes zero no começo. Usado nas pastas achadas pela busca do app."""
    try:
        if os.path.getsize(caminho) < 8 * 1024:
            return False
        with open(caminho, "rb") as f:
            return b"\0" in f.read(4096)
    except OSError:
        return False


def clean_title(filename):
    """'Mask, The (USA).sfc' -> 'The Mask'."""
    name = os.path.splitext(filename)[0]
    # tradução para português: fica no nome, para não se confundir com a versão original
    traduzido = re.search(r"[\(\[](?:PT-?BR|BR)[\)\]]", name, re.I)
    name = re.sub(r"\s*[\(\[].*?[\)\]]", "", name).strip()
    m = re.match(r"^(.*), (The|A|O|Os|As)$", name)
    if m:
        name = f"{m.group(2)} {m.group(1)}"
    return f"{name} (PT-BR)" if traduzido else name


def initials(title):
    """Sigla do cartucho sem capa: 'The Mask' -> 'MA', 'Top Gear' -> 'TG'."""
    words = [w for w in re.findall(r"[A-Za-z0-9]+", title) if w.lower() not in {"the", "a", "o", "os", "as"}]
    if not words:
        return title[:2].upper()
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[1][0]).upper()


def slugify(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


class Catalog:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        # CG_ROMS / CG_BIOS: outra pasta (no app de Android, a pasta do celular escolhida)
        self.roms_dir = os.environ.get("CG_ROMS") or os.path.join(base_dir, "roms")
        self.bios_dir = os.environ.get("CG_BIOS") or os.path.join(base_dir, "bios")
        # CG_CAPAS: no app de Android, as capas ficam na pasta do celular (sobrevivem a reinstalar)
        self.covers_dir = os.environ.get("CG_CAPAS") or os.path.join(base_dir, "covers")
        # CG_ACHADOS: arquivo JSON com a lista de pastas onde a busca do app achou jogos
        self.achados = os.environ.get("CG_ACHADOS")
        self._cache_achados = {}   # (pasta, extensões) -> (data da pasta, jogos)

    def pastas_achadas(self):
        """Pastas da busca do app (lidas a cada vez: a busca pode rodar com o servidor ligado)."""
        if not self.achados:
            return []
        try:
            with open(self.achados) as f:
                pastas = json.load(f)
        except (OSError, ValueError):
            return []
        return [p for p in pastas if isinstance(p, str)]

    def pasta_achada(self, numero):
        pastas = self.pastas_achadas()
        return pastas[numero] if 0 <= numero < len(pastas) else None

    def _cover_for(self, console, slug, existentes=None):
        """existentes: {console: nomes dos arquivos de capa}, lido uma vez por scan() (no celular,
        perguntar arquivo por arquivo, 4 formatos x mil jogos, levava dezenas de segundos)."""
        for ext in COVER_EXTS:
            if existentes is not None:
                if f"{slug}{ext}" in existentes.get(console, ()):
                    return f"{console}/{slug}{ext}"
            elif os.path.isfile(os.path.join(self.covers_dir, console, f"{slug}{ext}")):
                return f"{console}/{slug}{ext}"
        return None

    def _capas_existentes(self):
        existentes = {}
        for console in CONSOLES:
            try:
                existentes[console] = set(os.listdir(os.path.join(self.covers_dir, console)))
            except OSError:
                existentes[console] = set()
        return existentes

    @staticmethod
    def _arquivos_de_jogo(folder, exts):
        """Um item por jogo: (arquivo que o emulador abre, título, tamanho total, todos os arquivos).

        Jogos de CD vêm em vários arquivos:
          - "Jogo (Track 01).bin", "(Track 02).bin"...: viram um jogo só, aberto
            pela faixa 1 (a de dados). As outras faixas são as músicas do CD.
          - "Jogo.cue" + .bin: abre pelo .bin; um .cue sem os arquivos que ele
            cita fica de fora até o jogo estar completo.
        """
        nomes = sorted(n for n in os.listdir(folder) if os.path.splitext(n)[1].lower() in exts)
        caminho = lambda n: os.path.join(folder, n)
        usados = set()
        jogos = []

        for cue in [n for n in nomes if n.lower().endswith(".cue")]:
            usados.add(cue)
            try:
                with open(caminho(cue), errors="replace") as f:
                    citados = re.findall(r'^\s*FILE\s+"([^"]+)"', f.read(), re.M | re.I)
            except OSError:
                continue
            citados = [os.path.basename(c) for c in citados]
            if not citados or not all(os.path.isfile(caminho(c)) for c in citados):
                continue                       # incompleto: falta .bin
            usados.update(citados)
            jogos.append((citados[0], clean_title(cue), sum(os.path.getsize(caminho(c)) for c in citados), [cue] + citados))

        faixas = {}
        for n in nomes:
            m = re.match(r"^(.*?)\s*\(Track 0*(\d+)\)(\.[^.]+)$", n, re.I)
            if m and n not in usados:
                faixas.setdefault(m.group(1), []).append((int(m.group(2)), n))
        for base, lista in faixas.items():
            lista.sort()
            usados.update(n for _, n in lista)
            jogos.append((lista[0][1], clean_title(base + ".bin"), sum(os.path.getsize(caminho(n)) for _, n in lista), [n for _, n in lista]))

        for n in nomes:
            if n not in usados:
                jogos.append((n, clean_title(n), os.path.getsize(caminho(n)), [n]))
        return sorted(jogos, key=lambda j: j[1].lower())

    def _pastas_para_ler(self):
        """(console, pasta, prefixo do endereço, extensões): roms/<console> e depois as achadas."""
        for console, (_, _, exts) in CONSOLES.items():
            yield console, os.path.join(self.roms_dir, console), console, exts
        dentro = os.path.realpath(self.roms_dir) + os.sep
        for numero, pasta in enumerate(self.pastas_achadas()):
            if (os.path.realpath(pasta) + os.sep).startswith(dentro):
                continue                       # a própria pasta de jogos já foi lida
            for console, exts in EXTS_ACHADOS.items():
                if console == "snes" and "snes" in pasta.lower():
                    exts = exts | {".zip"}
                yield console, pasta, f"achados/{numero}", exts

    def _ler(self, folder, exts, achada):
        """Cada pasta fica guardada até mudar (a data da pasta muda quando entra ou sai um
        arquivo): ler a memória do celular a cada página deixava tudo lento, ainda mais com
        mil jogos. Uma pasta que acabou de mudar não é guardada (um envio pode estar gravando,
        e o tamanho do jogo ainda vai crescer)."""
        data = os.stat(folder).st_mtime_ns
        chave = (folder, frozenset(exts))
        guardado = self._cache_achados.get(chave)
        if guardado and guardado[0] == data:
            return guardado[1]
        jogos = self._arquivos_de_jogo(folder, exts)
        if achada:
            # o emulador abre o 1º arquivo (num jogo de CD, o .bin; o .cue é texto mesmo)
            jogos = [j for j in jogos if parece_jogo(os.path.join(folder, j[0]))]
        if time.time() - data / 1e9 > 10:
            self._cache_achados[chave] = (data, jogos)
        return jogos

    def scan(self):
        """Relê as pastas a cada chamada (é barato e evita reiniciar o servidor)."""
        games = []
        vistos = set()
        capas = self._capas_existentes()
        for console, folder, prefixo, exts in self._pastas_para_ler():
            label, core, _ = CONSOLES[console]
            if not os.path.isdir(folder):
                continue
            try:
                achados = self._ler(folder, exts, achada=prefixo.startswith("achados/"))
            except OSError:
                continue
            for filename, title, size, arquivos in achados:
                slug = slugify(title)
                if (console, slug) in vistos:
                    continue                   # o mesmo jogo em duas pastas: fica o primeiro
                vistos.add((console, slug))
                bios = BIOS.get(console)
                games.append({
                    "console": console,
                    "console_label": label,
                    "core": core,
                    "title": title,
                    "initials": initials(title),
                    "slug": slug,
                    "rom": f"{prefixo}/{filename}",
                    "arquivos": [f"{prefixo}/{a}" for a in arquivos],   # tudo que compõe o jogo
                    "size_mb": round(size / 1e6, 1),
                    # número estável: o netplay usa para separar as salas por jogo
                    "game_id": zlib.crc32(f"{console}/{slug}".encode()) & 0x7FFFFFFF,
                    # cor da etiqueta do cartucho: fixa para cada jogo, varia entre jogos
                    "cor": zlib.crc32(slug.encode()) % 7,
                    "bios": bios if bios and os.path.isfile(os.path.join(self.bios_dir, bios)) else None,
                    "cover": self._cover_for(console, slug, capas),
                })
        return games

    def by_console(self):
        grouped = {}
        for game in self.scan():
            grouped.setdefault(game["console_label"], []).append(game)
        return grouped

    def get(self, console, slug):
        return next((g for g in self.scan() if g["console"] == console and g["slug"] == slug), None)

    def by_game_id(self):
        return {g["game_id"]: g for g in self.scan()}
