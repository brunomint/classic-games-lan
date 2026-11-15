# Classic Games LAN

Jogos antigos (SNES, NES, PS1…) no navegador, com **multiplayer entre aparelhos
pela rede local**: um aparelho cria a sala e roda o jogo, os outros entram e
recebem a tela em vídeo, mandando só os comandos do controle. Não usa internet.

## Rodar

**No PC (Linux):**
```bash
pip install -r requirements.txt
python app.py            # porta 5000 (ou: python app.py 8080)
```

**No Android (Termux):**
```bash
pkg install python
pip install -r requirements.txt
./iniciar-android.sh
```
Dica: com o celular como roteador (hotspot), dá para jogar em qualquer lugar.

Abra o endereço que aparece no terminal (ex.: `http://192.168.0.7:5000`).
Nos outros aparelhos, escaneie o QR code da página inicial.

## Jogar junto

1. Um aparelho abre o jogo ▸ menu do jogo ▸ **Netplay** ▸ **Criar sala**.
2. Nos outros, a sala aparece em **Salas abertas** na página inicial: toque e pronto.

Quem cria a sala roda o emulador. Use o aparelho mais forte (de preferência o PC).

## Adicionar jogos

- Pela página **＋ Enviar ROMs**, de qualquer aparelho da rede; ou
- copiando o arquivo para `roms/<console>/`.

| pasta | console | extensões |
|---|---|---|
| `roms/snes` | Super Nintendo | .sfc .smc |
| `roms/nes` | Nintendinho | .nes |
| `roms/n64` | Nintendo 64 | .z64 .n64 .v64 |
| `roms/gba` | Game Boy Advance | .gba |
| `roms/gb` | Game Boy / Color | .gb .gbc |
| `roms/megadrive` | Mega Drive | .md .gen .smd |
| `roms/psx` | PlayStation | .bin .cue .chd .pbp .iso |

Capas (opcional): `covers/<console>/<slug>.jpg`. O slug é o final do link do jogo,
ex.: `covers/snes/top-gear.jpg`.
BIOS do PS1: `bios/scph5501.bin`.

## Estrutura

```
app.py          rotas e arquivos estáticos
games.py        catálogo automático (lê roms/)
netplay.py      servidor de salas (substitui o servidor oficial do EmulatorJS)
uploads.py      envio de ROMs pelo navegador
templates/      páginas
static/         css, js e qrcode.js
emulatorjs/     EmulatorJS 4.3.0-pre (pasta data/ do release, com os cores)
roms/ bios/ covers/   seus arquivos (fora do git)
```

## EmulatorJS

Usa o **4.3.0-pre**, a primeira versão com netplay por WebRTC.
Para reinstalar: baixe `4.3.0-pre.7z` em
https://github.com/EmulatorJS/EmulatorJS/releases e extraia a pasta `data/`
como `emulatorjs/`.

## Observações

- Qualquer aparelho da rede pode enviar ROMs. Use só em rede de confiança.
- ROMs têm direitos autorais: só o código vai para o git.
