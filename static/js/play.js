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
  if (d.bios) window.EJS_biosUrl = d.bios;

  // Netplay: o próprio servidor Flask faz a sinalização.
  // Sem servidores STUN/TURN: a conexão fica só na rede local.
  window.EJS_netplayServer = location.origin;
  window.EJS_netplayICEServers = [];

  window.EJS_onGameStart = function () {
    document.dispatchEvent(new CustomEvent("cg:jogo-iniciado"));   // registro.js abre a sessão

    const emu = window.EJS_emulator;
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

  const loader = document.createElement("script");
  loader.src = "/emulatorjs/loader.js";
  document.body.appendChild(loader);
})();
