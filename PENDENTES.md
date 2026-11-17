# Pendentes

Ideias e melhorias combinadas, ainda não feitas. A mais urgente fica em cima.

## Jogos de PlayStation demoram para abrir (principalmente no iPad)

Cada jogo de PS1 tem de 470 a 750 MB e o navegador baixa o arquivo inteiro antes de começar.
O servidor não é o gargalo (entrega a ~500 MB/s no próprio PC); o que limita é o Wi-Fi
(2,4 GHz: 2 a 4 minutos para 600 MB; 5 GHz: 15 a 30 segundos).

1. **Descobrir por que o iPad não guarda o jogo.** O EmulatorJS deveria guardar o jogo no
   navegador (até 4 GB, por 5 dias), mas o iPad baixou o Crash Bandicoot inteiro duas vezes
   em 5 minutos. Suspeita: o Safari recusa ou apaga arquivos desse tamanho. Diagnóstico com o
   iPad abrindo um jogo de PS1 (`navigator.storage.estimate()`, itens do cache do EmulatorJS).
   Se resolver, da segunda vez em diante o jogo abre em segundos.
2. **Converter os jogos de PS1 para CHD** (`chdman`, do pacote `mame-tools`): 40 a 60% menores,
   e as faixas de música do CD entram no mesmo arquivo (hoje só a faixa 1 é usada, sem música).
   Conferir antes se o núcleo de PS1 do EmulatorJS abre `.chd`.
3. **Usar o Wi-Fi 5 GHz** nos aparelhos que tiverem.

## Outras ideias

- Serviço do sistema (systemd) para o servidor ligar sozinho com o notebook.
- Botão "Criar jogador" em Ajustes.
- Teclado de letras na tela para a pesquisa de Ajustes (para usar só com o controle).
- Indicador da conexão do jogo em rede no menu de pausa.
- Nintendo 64: aceitar `.zip`.
- Jogo em rede com rollback: medidor opcional (`?medir` no endereço) para descobrir o que
  atrasa um aparelho; testar com 4 aparelhos; PS1 não serve (o estado salvo muda alguns bytes
  a cada vez, e a conferência entre aparelhos falharia).
- Mandar para o EmulatorJS original (fork + pull request) as correções que fizemos aqui:
  `EmulatorJSGetState` vaza a memória de cada save; o arquivo `cores/reports/*.json` nunca
  é lido (o N64 caía no núcleo antigo); o controle na tela do iPad se esconde sozinho.
