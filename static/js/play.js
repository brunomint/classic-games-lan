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
    const dica = document.getElementById("dica");
    fetch(`/list?game_id=${encodeURIComponent(d.gameId)}`)
      .then((r) => r.json())
      .then((salas) => {
        const sala = salas[sessionId];
        if (!sala) {
          dica.textContent = "Essa sala já fechou. Crie outra em Jogar junto.";
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
        dica.textContent = `Você está na sala de ${sala.player_name}`;
      })
      .catch(() => { dica.textContent = "Não deu para entrar na sala. Tente de novo em Jogar junto."; });
  }

  const loader = document.createElement("script");
  loader.src = "/emulatorjs/loader.js";
  document.body.appendChild(loader);
})();
