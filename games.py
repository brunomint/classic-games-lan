"""Catálogo automático: lê roms/<console>/ e monta a lista de jogos.

Para adicionar um jogo basta colocar a ROM na pasta do console certo.
"""
import os
import re
import zlib

# pasta em roms/  ->  (nome exibido, core do EmulatorJS, extensões aceitas)
CONSOLES = {
    "snes":      ("Super Nintendo", "snes",   {".sfc", ".smc"}),
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


def clean_title(filename):
    """'Mask, The (USA).sfc' -> 'The Mask'."""
    name = os.path.splitext(filename)[0]
    name = re.sub(r"\s*[\(\[].*?[\)\]]", "", name).strip()
    m = re.match(r"^(.*), (The|A|O|Os|As)$", name)
    if m:
        name = f"{m.group(2)} {m.group(1)}"
    return name


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
        self.roms_dir = os.path.join(base_dir, "roms")
        self.bios_dir = os.path.join(base_dir, "bios")
        self.covers_dir = os.path.join(base_dir, "covers")

    def _cover_for(self, console, slug):
        for ext in COVER_EXTS:
            name = f"{console}/{slug}{ext}"
            if os.path.isfile(os.path.join(self.covers_dir, name)):
                return name
        return None

    def scan(self):
        """Relê as pastas a cada chamada (é barato e evita reiniciar o servidor)."""
        games = []
        for console, (label, core, exts) in CONSOLES.items():
            folder = os.path.join(self.roms_dir, console)
            if not os.path.isdir(folder):
                continue
            for filename in sorted(os.listdir(folder)):
                if os.path.splitext(filename)[1].lower() not in exts:
                    continue
                title = clean_title(filename)
                slug = slugify(title)
                bios = BIOS.get(console)
                games.append({
                    "console": console,
                    "console_label": label,
                    "core": core,
                    "title": title,
                    "initials": initials(title),
                    "slug": slug,
                    "rom": f"{console}/{filename}",
                    "size_mb": round(os.path.getsize(os.path.join(folder, filename)) / 1e6, 1),
                    # número estável: o netplay usa para separar as salas por jogo
                    "game_id": zlib.crc32(f"{console}/{slug}".encode()) & 0x7FFFFFFF,
                    "bios": bios if bios and os.path.isfile(os.path.join(self.bios_dir, bios)) else None,
                    "cover": self._cover_for(console, slug),
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
