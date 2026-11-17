// Tela do jogo: configura o EmulatorJS (tudo local) e entra na sala do link, se houver.
(function () {
  const el = document.getElementById("game");
  const d = el.dataset;
  const params = new URLSearchParams(location.search);
  const salaDoLink = params.get("sala");

  window.EJS_player = "#game";
  window.EJS_pathtodata = "/emulatorjs/";
  window.EJS_core = d.core;
  window.EJS_gameUrl = d.rom;
  window.EJS_gameName = d.title;
  window.EJS_gameID = Number(d.gameId);
  window.EJS_language = "pt";
  window.EJS_color = "#4d3f8c";
  window.EJS_startOnLoaded = true;
  // iPad: desde o iPadOS 13 o Safari diz que é um Mac, e o EmulatorJS deixa o controle na
  // tela desligado (só liga sozinho em celular/tablet). Avisa que é aparelho móvel.
  if (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 0) window.EJS_browserMode = 1;
  if (d.bios) window.EJS_biosUrl = d.bios;

  // Netplay: o próprio servidor Flask faz a sinalização.
  // Sem servidores STUN/TURN: a conexão fica só na rede local.
  window.EJS_netplayServer = location.origin;
  window.EJS_netplayICEServers = [];

  window.EJS_onGameStart = function () {
    document.dispatchEvent(new CustomEvent("cg:jogo-iniciado"));   // registro.js abre a sessão

    const emu = window.EJS_emulator;
    // controle na tela: o EmulatorJS só o mostra se a pessoa tocou na tela antes de o jogo
    // começar; como o jogo começa sozinho, em celular/iPad ele ficava escondido
    if (emu && emu.isMobile && typeof emu.toggleVirtualGamepad === "function"
        && emu.getSettingValue("virtual-gamepad") !== "disabled") {
      emu.toggleVirtualGamepad(true);
    }
    const netplay = emu && emu.netplay;
    if (!netplay) return;

    const nome = CG.getNome();
    if (nome) netplay.name = nome;

    if (salaDoLink) entrarNaSala(netplay, salaDoLink);

    // "Jogar junto": abre direto o menu de salas do netplay
    const botaoJunto = document.getElementById("jogar-junto");
    botaoJunto.hidden = false;
    botaoJunto.addEventListener("click", () => {
      if (!netplay.isMenuCreated()) netplay.createNetplayMenu();
      netplay.openMenu();
    });
  };

  function entrarNaSala(netplay, sessionId) {
    fetch(`/list?game_id=${encodeURIComponent(d.gameId)}`)
      .then((r) => r.json())
      .then((salas) => {
        const sala = salas[sessionId];
        if (!sala) {
          CG.aviso("Essa sala já fechou. Abra o menu e crie outra.", "erro");
          return;
        }
        if (!netplay.name) netplay.name = "Jogador";
        if (!netplay.isMenuCreated()) netplay.createNetplayMenu();
        netplay.openMenu();
        if (sala.hasPassword) {
          netplay.showJoinPasswordDialog(sessionId, sala.room_name, sala.max);
        } else {
          netplay.joinRoom(sessionId, sala.room_name, sala.max, null);
        }
        CG.aviso(`Você está na sala de ${sala.player_name}`, "ok");
      })
      .catch(() => CG.aviso("Não deu para entrar na sala. Tente de novo pelo menu.", "erro"));
  }

  // Controles com numeração própria: ajusta os botões de cada jogador no emulador.
  // O EmulatorJS guarda os controles de cada jogo separados, então o ajuste roda uma vez
  // por jogo e por controle (fica anotado), para não desfazer um remapeamento manual.
  // Só depois do jogo iniciar: antes disso o emulador ainda vai carregar a configuração
  // salva por cima e não deixa gravar a nova.
  function ajustarControles() {
    const emu = window.EJS_emulator;
    if (!emu || !emu.started || !emu.controls || !emu.gamepadSelection) return;
    const conectados = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean);
    const doJogo = typeof emu.getLocalStorageKey === "function" ? emu.getLocalStorageKey() : String(window.EJS_gameID);
    let mudou = false;
    emu.gamepadSelection.forEach((sel, jogador) => {
      const g = conectados.find((c) => `${c.id}_${c.index}` === sel);
      if (!g) return;
      const chave = `cg-controle-ajustado:${doJogo}:${g.id}:${jogador}`;
      try { if (localStorage.getItem(chave)) return; } catch (e) { /* sem localStorage: ajusta sempre */ }
      if (CG.ajustarControlesEmulador(emu.controls[jogador], g)) {
        mudou = true;
        try { localStorage.setItem(chave, "1"); } catch (e) { /* ignora */ }
      }
    });
    if (mudou && typeof emu.saveSettings === "function") emu.saveSettings();
  }
  setInterval(ajustarControles, 1000);

  // "Voltar no tempo" (opcoes-jogo.js) só pode ser ligado quando o emulador é criado:
  // assim que o loader cria o EJS_emulator, antes de o jogo carregar, ajusta a opção.
  let voltarNoTempo = false;
  try { voltarNoTempo = localStorage.getItem("cg-voltar-no-tempo") === "sim"; } catch (e) { /* desligado */ }
  let emulador;
  Object.defineProperty(window, "EJS_emulator", {
    configurable: true,
    get: () => emulador,
    set: (v) => {
      emulador = v;
      if (!v) return;
      v.rewindEnabled = voltarNoTempo;
      // N64: o núcleo precisa de WebGL2 (no modo antigo fica a ~1 quadro por segundo, tela preta).
      // O EmulatorJS 4.3.0-pre deveria ligar sozinho pelo cores/reports/*.json, mas não lê
      // o arquivo direito (e ignora EJS_defaultOptions quando o jogo já tem ajustes salvos).
      if (d.core === "n64" && v.supportsWebgl2 && v.webgl2Enabled !== false) v.webgl2Enabled = true;
    },
  });

  const loader = document.createElement("script");
  loader.src = "/emulatorjs/loader.js";
  document.body.appendChild(loader);
})();

