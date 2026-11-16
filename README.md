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

## Menu inicial: consoles e pesquisa

Acima da fileira ficam as abas **Todos**, **Favoritos** (de quem está logado), **Recentes** (quem já jogou algo) e uma por console
que tem jogo no servidor — um console novo ganha aba sozinho. A aba fica lembrada no aparelho.

| Controle | Teclado | O que faz |
|---|---|---|
| L1 / R1 | `[` / `]` | aba anterior / próxima |
| suba até **Pesquisar** e A | comece a digitar (ou `/`) | abre a pesquisa |
| Select (−) num jogo | estrela ao lado do nome | favorita / tira dos favoritos |

A pesquisa ignora acento e maiúsculas, procura em todos os consoles e mostra os jogos achados na
hora (A abre o jogo). Com o controle, use o teclado da tela; no celular aparece o teclado do
próprio aparelho. B ou "Ver na fileira" fecha e deixa a fileira filtrada; o × ao lado limpa.

Os favoritos ficam no servidor, por jogador (tabela `favoritos`): valem em qualquer aparelho em que
a pessoa entrar. Dentro do jogo, o menu de pausa também tem **Favoritar**.

## Jogar junto

1. Um aparelho abre o jogo ▸ menu do jogo ▸ **Netplay** ▸ **Criar sala**.
2. Nos outros, a sala aparece em **Salas abertas** na página inicial: toque e pronto.

Quem cria a sala roda o emulador. Use o aparelho mais forte (de preferência o PC).

## Histórico, resultados e saves

Tudo fica num banco SQLite em `dados/classic-games.db` (fora do git), criado sozinho.

- **Login:** cada jogador entra com **nome + PIN** (4 a 8 números); o primeiro
  acesso com um nome novo cria o jogador. A identidade fica no servidor: mudou o
  IP, trocou de aparelho ou limpou o navegador, é só entrar de novo.
  5 PINs errados seguidos bloqueiam aquele nome por 5 minutos.
  Para jogar e enviar ROMs é preciso estar logado; a home e o histórico são abertos.
- **Mais de um jogador no mesmo aparelho** (2º, 3º, 4º controle): botão
  **＋ Jogador** na tela do jogo; a pessoa entra com o próprio nome + PIN (ou cria
  um jogador). Ela conta no histórico junto com quem está logado e acompanha a
  sessão: se entrarem numa sala de netplay, vai junto; fechou a página, sai junto.
- **Partidas:** registradas automaticamente: solo ou em grupo (netplay), quem
  jogou, quem criou a sala, início e duração. Abrir e fechar um jogo em menos de
  20 s não conta.
- **Resultado:** botão **Registrar resultado** na tela do jogo (vencedor, empate,
  placar). Também dá para anotar ou corrigir depois na página **Histórico**.
- **Saves:** os botões de salvar/carregar estado do emulador guardam no servidor
  (`dados/saves/`), por jogador e jogo, com a captura de tela do momento.
- **Save automático:** quando a página some (tela apagou, trocou de app, aba
  fechando) o jogo pausa e salva na hora; jogando, salva a cada 2 minutos. Se o
  envio não terminar (sem rede, aparelho dormiu), fica guardado no navegador e
  sobe na próxima vez. Há um só automático por jogador e jogo; ao abrir o jogo,
  ele pergunta "Continuar de onde parou?". Em netplay, só o anfitrião salva.
- **Sessão que expirou** (aparelho sem sinal por mais de 90 s): ao voltar, a
  sessão reabre sozinha e os jogadores extras do aparelho voltam junto.

A página **/historico** mostra tempo e vitórias por jogador, jogos mais jogados,
quem joga com quem e as partidas recentes.

## Ajustes (ícone de engrenagem)

- **Excluir jogo:** apaga os arquivos do jogo (todas as faixas, no caso de CD) e a
  capa. O histórico e os saves ficam: enviando o jogo de novo, voltam a valer.
- **Porta do servidor:** salva em `dados/config.json` e reinicia o servidor na
  porta nova (a página abre o endereço novo sozinha). `python app.py 8080`
  continua forçando uma porta.

É preciso estar logado para usar os dois.

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

**Capas:** baixadas sozinhas do [libretro-thumbnails](https://github.com/libretro-thumbnails)
(o acervo do RetroArch) quando o servidor liga e a cada ROM enviada. Com `git` instalado,
vêm do repositório no GitHub num lote só (um clone sem arquivos em `dados/capas-repositorio/`
traz a lista; o git baixa só as capas que faltam); o que não sair por ali vai uma a uma
pelo thumbnails.libretro.com. Sem internet, o cartucho mostra a sigla. Para buscar na mão: `python capas.py` (ou `--de-novo`
para tentar de novo as que não foram achadas). Também dá para pôr a sua:
`covers/<console>/<slug>.png` (o slug é o final do link do jogo).
BIOS do PS1: `bios/scph5501.bin`.

## Visual

Menu no jeito de console moderno: perfis da casa e relógio no topo, uma fileira
de capas (o último jogo que você jogou vem primeiro; o nome do jogo em foco
aparece em cima dele), ícones redondos embaixo (Jogar junto, Placar da casa,
Enviar ROMs, Trocar jogador) e "A Jogar" no canto. As cores dos botões do
controle continuam como sistema de ações em todas as páginas:

| botão | cor | significa |
|---|---|---|
| A | vermelho | jogar, confirmar |
| B | amarelo | voltar, cancelar |
| X | azul | jogar junto |
| Y | verde | adicionar jogador, enviar ROMs |

Dá para navegar tudo com controle (direcional + A/B/X/Y) ou setas, Enter e Esc.
Fonte: Saira (OFL, em `static/fonts/`), sem nada de fora.

**Jogos de CD em vários arquivos:** faixas "(Track 01).bin", "(Track 02).bin"...
viram um jogo só, aberto pela faixa 1 (o jogo roda, mas sem as músicas do CD).
Um `.cue` sem os `.bin` que ele cita fica fora do menu até o jogo estar completo.

## Controles

A maioria dos controles USB/Bluetooth funciona direto. Controles com numeração
própria (adaptadores genéricos) são ajustados por `static/js/perfis-controle.js`:

- **Twin USB Joystick (ShanWan, 20bc:5500)**, adaptador para 2 controles estilo
  PS2: perfil próprio (direcional vem como eixos 6/7; botões 0/1/3/4).
- Outros fora do padrão: perfil genérico (direcional nos dois últimos eixos).

O perfil vale para o menu e para o jogo (ajusta os botões do emulador uma vez
por jogo e por controle; remapeamentos feitos em "Botões do controle" são mantidos).
**Tudo pelo controle, como num console:** direcional escolhe, A confirma, B volta
ou fecha a janela aberta. Na entrada e no "+ Jogador", o PIN é digitado num
teclado na tela.

## Tela do jogo

O jogo ocupa a tela inteira, sem barras (nem a do EmulatorJS). Atalhos:

| Controle | Teclado | O que faz |
|---|---|---|
| Select + Start | Esc | abre/fecha o menu (o jogo pausa) |
| Select + R1 | | salva agora (no servidor, com foto da tela) |
| Select + L1 | | carrega o último save feito à mão |
| Select + R2 | | acelera (2x) / volta ao normal |
| segure Select + L2 | | volta no tempo (com "Voltar no tempo" ligado no menu) |

No celular, um botão redondo no canto abre o menu (no PC ele aparece quando o mouse mexe).
O menu mostra a foto do momento em que pausou, quem está jogando e a sala; tem salvar,
carregar, criar/entrar em sala, adicionar jogador, anotar resultado, tela cheia, filtro
da imagem (Original, TV antiga, Suave: lembrado no aparelho), botões do controle e
"Trocar de jogo" (os jogados por último; salva automaticamente antes de trocar).

As opções da barra do emulador (escondida) estão no menu: **Som** (−, mudo, +), **Velocidade**
(normal, rápida, lenta), **Voltar no tempo** (liga/desliga; o jogo reabre para valer), **Disco**
(jogos de PS1 com mais de um CD), **Códigos** de trapaça (Game Genie, GameShark...: ficam no
servidor por jogo, `codigos.py`; adicionar pede teclado ou celular, ligar/desligar vai pelo
controle), **Tirar foto**, **Reiniciar o jogo** e **Configurações avançadas** (abre o painel do
próprio emulador, só com mouse/toque). Velocidade, voltar no tempo, reiniciar e códigos ficam
bloqueados jogando junto, porque dessincronizariam os aparelhos. Ver `static/js/opcoes-jogo.js`.

O jogo ocupa a tela inteira: entra em **tela cheia** sozinho (o navegador só deixa depois de um
gesto, então é no primeiro toque, clique ou tecla; o botão do controle não conta, por isso na TV
com controle vale apertar **F11** uma vez, que fica valendo para todas as páginas). E o
**formato "Tela toda"** estica a imagem até as bordas, sem faixas pretas (só com a tela deitada).
Os dois se desligam no menu de pausa e ficam lembrados no aparelho.

Nos **menus**, o botão **Tela cheia** (no rodapé do menu inicial) esconde a barra do navegador.
Ao trocar de página o navegador sai da tela cheia, e ela volta no primeiro toque, clique ou tecla.
Só com o controle isso não funciona (o navegador não aceita). Para usar só com o controle, abra pelo
**atalho "Classic Games"** do menu de aplicativos, que roda `abrir-tela-cheia.sh`: o Chrome abre em
tela cheia, num perfil só dele (entre com o jogador uma vez), sem barra em nenhuma página e com o
som liberado sem precisar de clique. F11 sai da tela cheia e Alt+F4 fecha. Para outro computador da
casa: `./abrir-tela-cheia.sh http://192.168.0.7:5000/`.

**Esc e tela cheia:** no jogo, um toque no Esc abre o menu sem sair da tela cheia (segurar o Esc
sai). Mas o Chrome só deixa a página segurar o Esc em endereço seguro (https ou localhost), e
`http://192.168.0.7:5000` não é: ali o Esc tira da tela cheia e ela volta na próxima tecla ou toque.
Para ficar como deveria, uma vez em cada aparelho: abra `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
coloque `http://192.168.0.7:5000`, escolha **Enabled** e reinicie o Chrome. O atalho "Classic Games"
já faz isso sozinho.

O que acontece por fora do jogo vira aviso rápido no canto (salvo, controle conectado,
fulano entrou na sala...). Se o controle desconecta, o jogo pausa e continua sozinho
quando ele volta (em sala de netplay só avisa, para não travar os outros).

O **analógico esquerdo** também funciona como direcional nos jogos (SNES, PS1 etc.): esses consoles
— e o controle do PS1 no modo digital, o padrão do emulador — ignoram o analógico. Fica de fora
nos consoles que usam analógico de verdade (N64, PSP...). Ver `static/js/analogico-direcional.js`.

Para ver o que um controle manda, abra **/controles** ("Testar controles").
Para incluir um controle novo, acrescente um item em `PERFIS`.

## Estrutura

```
app.py          rotas e arquivos estáticos
games.py        catálogo automático (lê roms/)
netplay.py      servidor de salas (substitui o servidor oficial do EmulatorJS)
uploads.py      envio de ROMs pelo navegador
auth.py         login (nome + PIN) e sessão
db.py           banco SQLite (jogadores, partidas, participações, saves)
registro.py     API de partidas/resultados/saves e página de histórico
templates/      páginas
static/         css (base, inicio, jogo, paginas), js, fonte e qrcode.js
emulatorjs/     EmulatorJS 4.3.0-pre (pasta data/ do release, só com os núcleos usados)
roms/ bios/ covers/   seus arquivos (fora do git)
dados/          banco, saves e chave da sessão (fora do git)
                (para usar outra pasta: variável CG_DADOS)
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
