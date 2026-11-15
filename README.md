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

## Histórico, resultados e saves

Tudo fica num banco SQLite em `dados/classic-games.db` (fora do git), criado sozinho.

- **Jogadores:** cada aparelho ganha um ID na primeira visita; o nome vem do campo
  "Seu nome". Em outro aparelho, escolha "Já jogou? Escolha quem é você" para
  continuar como o mesmo jogador.
- **Partidas:** registradas automaticamente: solo ou em grupo (netplay), quem
  jogou, quem criou a sala, início e duração. Abrir e fechar um jogo em menos de
  20 s não conta.
- **Resultado:** botão **Registrar resultado** na tela do jogo (vencedor, empate,
  placar). Também dá para anotar ou corrigir depois na página **Histórico**.
- **Saves:** os botões de salvar/carregar estado do emulador guardam no servidor
  (`dados/saves/`), por jogador e jogo, com a captura de tela do momento.

A página **/historico** mostra tempo e vitórias por jogador, jogos mais jogados,
quem joga com quem e as partidas recentes.

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
db.py           banco SQLite (jogadores, partidas, participações, saves)
registro.py     API de partidas/resultados/saves e página de histórico
templates/      páginas
static/         css, js e qrcode.js
emulatorjs/     EmulatorJS 4.3.0-pre (pasta data/ do release, só com os núcleos usados)
roms/ bios/ covers/   seus arquivos (fora do git)
dados/          banco e saves (fora do git)
```

## EmulatorJS

Usa o **4.3.0-pre**, a primeira versão com netplay por WebRTC (licença GPL-3.0,
em `emulatorjs/LICENSE`). Já vem no repositório, com o núcleo padrão de cada
console da tabela acima: snes9x, fceumm, mupen64plus_next, mgba, gambatte,
genesis_plus_gx e pcsx_rearmed.

Para outro console: baixe `4.3.0-pre.7z` em
https://github.com/EmulatorJS/EmulatorJS/releases, copie o núcleo de
`data/cores/` (os 4 arquivos `.data` + `reports/<núcleo>.json`) para
`emulatorjs/cores/`, libere-o no `.gitignore` e adicione o console em `games.py`.

Alguns núcleos (ex.: snes9x) proíbem uso comercial.

## Observações

- Qualquer aparelho da rede pode enviar ROMs. Use só em rede de confiança.
- ROMs e BIOS têm direitos autorais e não vão para o git.
