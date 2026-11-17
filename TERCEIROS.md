# Código de terceiros

O Classic Games LAN é distribuído sob a **GPL-3.0** (arquivo `LICENSE`), a mesma licença do
EmulatorJS, que vai junto no repositório. Cada parte abaixo continua sob a sua própria licença.

## EmulatorJS 4.3.0-pre (pasta `emulatorjs/`)

- Licença: **GPL-3.0** (`emulatorjs/LICENSE`). Projeto: https://github.com/EmulatorJS/EmulatorJS
- Inclui o cliente Socket.IO (MIT), o nipplejs (MIT), o libunrar (licença unRAR, só para
  descompactar) e os extratores de 7z/zip (ver `emulatorjs/compression/`).
- **Modificado neste projeto** (conforme a GPL-3.0, as mudanças estão no histórico do git):
  - jogo em rede por vídeo a 60 quadros/s e até 8 Mbps (`src/netplay.js` e `emulator.min.js`);
  - linhas extras no `retroarch.cfg` vindas de `window.EJS_retroarchExtra`
    (`src/GameManager.js` e `emulator.min.js`), usadas pelo jogo em rede com rollback.
  - Em tempo de execução, `static/js/modo-antigo.js` também acrescenta duas linhas ao
    JavaScript do núcleo (expõe o laço principal e controla o som dos quadros refeitos).

## Núcleos de emulação (pasta `emulatorjs/cores/`)

Compilados pelo projeto EmulatorJS a partir dos núcleos do libretro. Cada arquivo `.data` traz o
texto da licença dentro dele (`license.txt`).

| Núcleo | Consoles | Licença |
|---|---|---|
| snes9x | Super Nintendo | licença própria do Snes9x: **uso não comercial** |
| genesis_plus_gx | Mega Drive / Master System | licença própria: **uso não comercial** |
| fceumm | Nintendo (NES) | GPL-2.0 |
| gambatte | Game Boy / Game Boy Color | GPL-2.0 |
| mgba | Game Boy Advance | MPL-2.0 |
| mupen64plus_next | Nintendo 64 | GPL-2.0 |
| pcsx_rearmed | PlayStation | GPL-2.0 |

Por causa do snes9x e do genesis_plus_gx, este projeto **não pode ser usado comercialmente**
com esses núcleos.

## Outros

| Arquivo | O que é | Licença |
|---|---|---|
| `static/fonts/saira.woff2` | fonte Saira (Omnibus-Type) | SIL Open Font License 1.1 (`static/fonts/OFL.txt`) |
| `static/vendor/qrcode.js` | gerador de QR code (Kazuhiko Arase) | MIT (aviso no próprio arquivo) |

Os desenhos dos avatares (`avatares.py`) são originais deste projeto.

## Jogos, BIOS e capas

**Nenhum jogo (ROM), BIOS ou capa vai junto.** Use só cópias de jogos que você tem. As capas
são baixadas no seu servidor, quando ele roda, do projeto aberto libretro-thumbnails
(https://github.com/libretro-thumbnails), e ficam fora do git.
