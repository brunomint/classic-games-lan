// Menu de pausa do jogo (como o botão Home de um console).
// Abre com Select + Start no controle (gamepad-menu.js avisa com "cg:menu-pausa")
// ou pelo botão Menu da barra. Enquanto qualquer diálogo nosso está aberto,
// o jogo fica pausado; ao fechar o último, volta a rodar.
(function () {
  const dialogo = document.getElementById("dialogo-pausa");
  const botaoSala = document.getElementById("pausa-sala");
  const dica = document.getElementById("dica");
  let pausadoPorNos = false;

  const emu = () => window.EJS_emulator;
  const netplay = () => emu() && emu().netplay;

  function pausar() {
    const e = emu();
    // em sala de netplay, pausar travaria os outros: o jogo segue rodando
    if (e && e.started && !e.isNetplay && !e.paused) {
      e.pause();
      pausadoPorNos = true;
    }
  }

  function retomarSeNada() {
    // espera o próximo diálogo abrir (ex.: Pausa → Carregar save) antes de decidir
    setTimeout(() => {
      if (document.querySelector("dialog[open]")) return;
      const e = emu();
      if (pausadoPorNos && e) { e.play(); }
      pausadoPorNos = false;
    }, 50);
  }

  // qualquer diálogo da página: pausa ao abrir, retoma ao fechar o último
  document.querySelectorAll("dialog").forEach((d) => {
    new MutationObserver(() => { if (d.open) pausar(); }).observe(d, { attributes: true, attributeFilter: ["open"] });
    d.addEventListener("close", retomarSeNada);
  });

  function abrir() {
    if (document.querySelector("dialog[open]") || !emu() || !emu().started) return;
    const n = netplay();
    botaoSala.textContent = emu().isNetplay ? "Sair da sala" : "Criar sala para jogar junto";
    botaoSala.hidden = !n;
    document.getElementById("pausa-jogador").hidden = document.getElementById("abrir-local").hidden;
    document.getElementById("pausa-resultado").hidden = document.getElementById("abrir-resultado").hidden;
    dialogo.showModal();
    document.getElementById("pausa-continuar").focus();
  }

  // fecha o menu e, em seguida, faz outra coisa (abre outro diálogo, clica um botão do emulador...)
  function eDepois(acao) {
    return () => {
      dialogo.close();
      setTimeout(acao, 10);
    };
  }

  function criarOuSairDaSala() {
    const n = netplay();
    if (!n) return;
    if (emu().isNetplay) {
      n.leaveRoom();
      dica.textContent = "Você saiu da sala.";
      return;
    }
    if (!n.isMenuCreated()) n.createNetplayMenu();
    n.openMenu();                                 // prepara o netplay (lista de salas, nome...)
    const nome = document.body.dataset.jogadorNome || "Jogador";
    n.name = n.name || nome;
    n.openRoom(`Sala de ${nome}`, 4, "");
    if (n._menuElement) n._menuElement.style.display = "none";
    dica.textContent = "Sala criada. Nos outros aparelhos, abra o menu e entre em Jogar junto.";
  }

  document.addEventListener("cg:menu-pausa", abrir);
  document.getElementById("abrir-pausa").addEventListener("click", abrir);
  document.getElementById("pausa-continuar").addEventListener("click", () => dialogo.close());
  document.getElementById("pausa-salvar").addEventListener("click", eDepois(() => emu().elements.bottomBar.saveState[0].click()));
  document.getElementById("pausa-carregar").addEventListener("click", eDepois(() => emu().elements.bottomBar.loadState[0].click()));
  botaoSala.addEventListener("click", eDepois(criarOuSairDaSala));
  document.getElementById("pausa-jogador").addEventListener("click", eDepois(() => CG.abrirJogadorLocal()));
  document.getElementById("pausa-resultado").addEventListener("click", eDepois(() => document.getElementById("abrir-resultado").click()));
})();
