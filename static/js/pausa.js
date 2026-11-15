// Menu de pausa do jogo (como o botão Home de um console).
// Abre com Select + Start no controle (gamepad-menu.js avisa com "cg:menu-pausa"),
// com Esc no teclado (atalhos-jogo.js) ou pelo botão redondo no canto.
// Enquanto qualquer diálogo nosso está aberto, o jogo fica pausado; ao fechar o último, volta a rodar.
(function () {
  const dialogo = document.getElementById("dialogo-pausa");
  const botaoSala = document.getElementById("pausa-sala");
  const foto = document.getElementById("pausa-foto");
  const chipSala = document.getElementById("chip-sala");
  let pausadoPorNos = false;
  let urlFoto = null;

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

  // a foto do momento em que pausou, como nos consoles.
  // Tem de ser antes de pausar: com o jogo parado, a tela do emulador vem vazia.
  function tirarFoto() {
    const e = emu();
    return new Promise((pronto) => {
      if (!e || typeof e.screenshot !== "function") return pronto();
      const limite = setTimeout(pronto, 400);   // sem foto: o menu abre igual
      try {
        e.screenshot((blob) => {
          clearTimeout(limite);
          if (blob) {
            if (urlFoto) URL.revokeObjectURL(urlFoto);
            urlFoto = URL.createObjectURL(blob);
            foto.src = urlFoto;
            foto.hidden = false;
          }
          pronto();
        }, "canvas", "png", 1);
      } catch (err) { clearTimeout(limite); pronto(); }
    });
  }

  let abrindo = false;
  function abrir() {
    if (dialogo.open) { dialogo.close(); return; }   // Select + Start de novo: volta ao jogo
    // com o painel avançado do emulador aberto, o atalho só fecha o painel
    if (document.body.classList.contains("avancado")) {
      document.dispatchEvent(new CustomEvent("cg:fechar-avancado"));
      return;
    }
    if (abrindo || document.querySelector("dialog[open]") || !emu() || !emu().started) return;
    const e = emu();
    const n = netplay();
    botaoSala.textContent = e.isNetplay ? "Sair da sala" : "Criar sala para jogar junto";
    botaoSala.hidden = !n;
    chipSala.hidden = !e.isNetplay;
    if (e.isNetplay) chipSala.textContent = n && n.owner ? "Sua sala está aberta" : "Jogando na sala de outro aparelho";
    if (CG.imagem) CG.imagem.marcarBotoes();
    abrindo = true;
    tirarFoto().then(() => {
      abrindo = false;
      if (document.querySelector("dialog[open]")) return;
      dialogo.showModal();
      document.getElementById("pausa-continuar").focus();
    });
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
      CG.aviso("Você saiu da sala.");
      return;
    }
    if (!n.isMenuCreated()) n.createNetplayMenu();
    n.openMenu();                                 // prepara o netplay (lista de salas, nome...)
    const nome = document.body.dataset.jogadorNome || "Jogador";
    n.name = n.name || nome;
    n.openRoom(`Sala de ${nome}`, 4, "");
    if (n._menuElement) n._menuElement.style.display = "none";
    CG.aviso("Sala criada. Nos outros aparelhos, abra este jogo e entre na sala pelo menu.", "ok");
  }

  // "Trocar de jogo": guarda o progresso (save automático) antes de sair
  document.querySelectorAll("[data-trocar-jogo]").forEach((link) => {
    link.addEventListener("click", (ev) => {
      ev.preventDefault();
      const destino = link.href;
      dialogo.close();
      CG.aviso("Salvando antes de trocar…");
      const salvar = CG.autosave ? CG.autosave.salvarAgora(false) : Promise.resolve();
      const limite = new Promise((ok) => setTimeout(ok, 5000));   // não fica preso se o servidor sumir
      Promise.race([salvar, limite]).finally(() => { location.href = destino; });
    });
  });

  document.addEventListener("cg:menu-pausa", abrir);
  document.getElementById("abrir-pausa").addEventListener("click", abrir);
  document.getElementById("pausa-continuar").addEventListener("click", () => dialogo.close());
  document.getElementById("pausa-salvar").addEventListener("click", eDepois(() => CG.salvarRapido()));
  document.getElementById("pausa-carregar").addEventListener("click", eDepois(() => emu().elements.bottomBar.loadState[0].click()));
  document.getElementById("pausa-controles").addEventListener("click", eDepois(() => emu().elements.bottomBar.gamepad[0].click()));
  botaoSala.addEventListener("click", eDepois(criarOuSairDaSala));

  // os botões que outros scripts controlam (aparecem quando fazem sentido) fecham o menu primeiro
  ["jogar-junto", "abrir-local", "abrir-resultado"].forEach((id) => {
    document.getElementById(id).addEventListener("click", () => dialogo.close(), { capture: true });
  });
})();
