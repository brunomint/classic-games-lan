// Opções do emulador trazidas para o menu de pausa (a barra dele fica escondida):
//   Som (−, mudo, +), Velocidade (Normal, Rápida, Lenta), Voltar no tempo, Trocar disco,
//   Tirar foto, Reiniciar o jogo e Configurações avançadas (o painel do próprio emulador).
// Atalhos no controle (gamepad-menu.js): Select + R2 acelera, segurar Select + L2 volta no tempo.
// Som, velocidade e voltar no tempo ficam lembrados neste aparelho.
window.CG = window.CG || {};

(function () {
  const emu = () => window.EJS_emulator;
  const pronto = () => emu() && emu().started && emu().gameManager;
  const $ = (id) => document.getElementById(id);
  const menu = $("dialogo-pausa");

  const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v === null ? padrao : v; } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* vale só agora */ } };

  // em sala de jogar junto, mexer no tempo do jogo dessincroniza os aparelhos
  function bloqueadoNaSala(oque) {
    if (emu() && emu().isNetplay) {
      CG.aviso(`Não dá para ${oque} jogando junto.`, "erro");
      return true;
    }
    return false;
  }

  // volta para o menu de pausa depois de um diálogo aberto a partir dele
  const voltarAoMenu = () => setTimeout(() => document.dispatchEvent(new CustomEvent("cg:menu-pausa")), 80);

  // fecha o menu e faz outra coisa logo depois
  const eDepois = (acao) => () => { menu.close(); setTimeout(acao, 10); };

  // ---------- som ----------
  const nomeSom = $("nome-som");
  const botaoMudo = $("som-mudo");
  let volume = Math.min(1, Math.max(0, parseFloat(ler("cg-volume", "0.5")) || 0));
  let mudo = ler("cg-mudo", "nao") === "sim";

  function aplicarSom() {
    nomeSom.textContent = mudo || volume === 0 ? "Mudo" : `${Math.round(volume * 100)}%`;
    botaoMudo.setAttribute("aria-pressed", String(mudo));
    const e = emu();
    if (!e || !e.started || typeof e.setVolume !== "function") return;
    if (!mudo) e.volume = volume;
    e.setVolume(mudo ? 0 : volume);
  }
  function mudarVolume(passo) {
    volume = Math.min(1, Math.max(0, Math.round((volume + passo) * 10) / 10));
    mudo = false;
    gravar("cg-volume", String(volume));
    gravar("cg-mudo", "nao");
    aplicarSom();
  }
  $("som-menos").addEventListener("click", () => mudarVolume(-0.1));
  $("som-mais").addEventListener("click", () => mudarVolume(0.1));
  botaoMudo.addEventListener("click", () => {
    mudo = !mudo;
    if (!mudo && volume === 0) volume = 0.5;
    gravar("cg-mudo", mudo ? "sim" : "nao");
    aplicarSom();
  });

  // ---------- velocidade ----------
  const VELOCIDADES = ["Normal", "Rápida", "Lenta"];
  const nomeVelocidade = $("nome-velocidade");
  let velocidade = 0;

  function aplicarVelocidade(nova, avisar) {
    const e = emu();
    if (nova !== 0 && bloqueadoNaSala("mudar a velocidade")) return;
    velocidade = nova;
    nomeVelocidade.textContent = VELOCIDADES[velocidade];
    if (!pronto()) return;
    const gm = e.gameManager;
    if (e.isFastForward) gm.toggleFastForward(0);
    if (e.isSlowMotion) gm.toggleSlowMotion(0);
    e.isFastForward = velocidade === 1;
    e.isSlowMotion = velocidade === 2;
    if (velocidade === 1) { gm.setFastForwardRatio(2); gm.toggleFastForward(1); }
    if (velocidade === 2) { gm.setSlowMotionRatio(2); gm.toggleSlowMotion(1); }
    if (avisar) CG.aviso(velocidade === 1 ? "Velocidade: rápida (2x)" : velocidade === 2 ? "Velocidade: lenta" : "Velocidade: normal");
  }
  $("opcao-velocidade").addEventListener("click", () => aplicarVelocidade((velocidade + 1) % VELOCIDADES.length, false));
  document.addEventListener("cg:acelerar", () => aplicarVelocidade(velocidade === 1 ? 0 : 1, true));

  // ---------- voltar no tempo ----------
  // ligar/desligar só vale quando o emulador abre o jogo (play.js lê esta preferência)
  const CHAVE_VOLTAR = "cg-voltar-no-tempo";
  const opcaoVoltar = $("opcao-voltar-tempo");
  const itemVoltar = $("pausa-voltar-tempo");
  const dialogoVoltar = $("dialogo-voltar-tempo");
  const querVoltar = () => ler(CHAVE_VOLTAR, "nao") === "sim";
  let avisouDesligado = false;

  function marcarVoltar() {
    opcaoVoltar.setAttribute("aria-pressed", String(querVoltar()));
    itemVoltar.hidden = !(emu() && emu().rewindEnabled);
  }

  function voltarNoTempo(ativo) {
    const e = emu();
    if (!pronto()) return;
    if (!e.rewindEnabled) {
      if (ativo && !avisouDesligado) {
        CG.aviso("Ligue “Voltar no tempo” no menu (Select + Start) para usar.", "erro");
        avisouDesligado = true;
      }
      return;
    }
    if (ativo && bloqueadoNaSala("voltar no tempo")) return;
    e.gameManager.simulateInput(0, 28, ativo ? 1 : 0);   // 28 = botão de voltar do emulador
  }
  document.addEventListener("cg:voltar-tempo", (ev) => voltarNoTempo(ev.detail.ativo));

  itemVoltar.addEventListener("click", eDepois(() => {
    // depois que o jogo volta a rodar, "segura" o voltar por quase 1 s (cerca de 5 s de jogo)
    setTimeout(() => {
      voltarNoTempo(true);
      setTimeout(() => voltarNoTempo(false), 850);
    }, 150);
  }));

  opcaoVoltar.addEventListener("click", eDepois(() => {
    $("titulo-voltar-tempo").textContent = querVoltar() ? "Desligar voltar no tempo?" : "Ligar voltar no tempo?";
    dialogoVoltar.showModal();
    $("voltar-tempo-agora").focus();
  }));
  $("voltar-tempo-depois").addEventListener("click", () => {
    gravar(CHAVE_VOLTAR, querVoltar() ? "nao" : "sim");
    dialogoVoltar.close();
    CG.aviso("Vale na próxima vez que você abrir um jogo.", "ok");
    voltarAoMenu();
  });
  $("voltar-tempo-agora").addEventListener("click", () => {
    gravar(CHAVE_VOLTAR, querVoltar() ? "nao" : "sim");
    dialogoVoltar.close();
    CG.aviso("Salvando e reabrindo o jogo…");
    const salvar = CG.autosave ? CG.autosave.salvarAgora(false) : Promise.resolve();
    Promise.race([salvar, new Promise((ok) => setTimeout(ok, 5000))]).finally(() => location.reload());
  });

  // ---------- trocar disco (jogos de PS1 com mais de um CD) ----------
  const opcaoDisco = $("opcao-disco");
  const nomeDisco = $("nome-disco");
  function marcarDisco() {
    if (!pronto()) return;
    let total = 0;
    let atual = 0;
    try { total = emu().gameManager.getDiskCount(); atual = emu().gameManager.getCurrentDisk(); } catch (e) { /* sem discos */ }
    opcaoDisco.hidden = !(total > 1);
    nomeDisco.textContent = `${atual + 1} de ${total}`;
  }
  opcaoDisco.addEventListener("click", () => {
    const gm = emu().gameManager;
    const total = gm.getDiskCount();
    const proximo = (gm.getCurrentDisk() + 1) % total;
    gm.setCurrentDisk(proximo);
    marcarDisco();
    CG.aviso(`Disco ${proximo + 1} colocado.`, "ok");
  });

  // ---------- tirar foto: baixa a foto do momento em que pausou ----------
  $("opcao-foto").addEventListener("click", () => {
    const foto = $("pausa-foto");
    if (foto.hidden || !foto.src) { CG.aviso("Não deu para tirar a foto desta vez.", "erro"); return; }
    const titulo = document.getElementById("game").dataset.title || "jogo";
    const agora = new Date();
    const dois = (n) => String(n).padStart(2, "0");
    const quando = `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())} ${dois(agora.getHours())}h${dois(agora.getMinutes())}`;
    const a = document.createElement("a");
    a.href = foto.src;
    a.download = `${titulo} ${quando}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    CG.aviso("Foto salva neste aparelho ✓", "ok");
  });

  // ---------- reiniciar ----------
  const dialogoReiniciar = $("dialogo-reiniciar");
  $("pausa-reiniciar").addEventListener("click", () => {
    if (bloqueadoNaSala("reiniciar o jogo")) return;
    menu.close();
    setTimeout(() => { dialogoReiniciar.showModal(); $("cancelar-reiniciar").focus(); }, 10);
  });
  $("cancelar-reiniciar").addEventListener("click", () => { dialogoReiniciar.close(); voltarAoMenu(); });
  $("confirmar-reiniciar").addEventListener("click", () => {
    dialogoReiniciar.close();
    if (pronto()) emu().gameManager.restart();
    CG.aviso("Jogo reiniciado.", "ok");
  });

  // ---------- configurações avançadas: o painel do próprio emulador ----------
  const fecharAvancadoBtn = $("fechar-avancado");

  function abrirAvancado() {
    const e = emu();
    if (!pronto() || !e.elements.bottomBar.settings) return;
    document.body.classList.add("avancado");
    fecharAvancadoBtn.hidden = false;
    if (!e.paused && !e.isNetplay) e.pause();
    const botao = e.elements.bottomBar.settings[0];   // este vem como [botão, ícone, texto]
    if (!e.settingsMenuOpen) (Array.isArray(botao) ? botao[0] : botao).click();
    // o emulador mediu o painel quando a barra dele estava escondida (tudo zero): mede de novo
    if (typeof e.handleSettingsResize === "function") e.handleSettingsResize();
    const caixa = e.settingsMenu.querySelector(".ejs_settings_transition");
    const inicio = caixa && caixa.firstElementChild;
    if (inicio && typeof e.getElementSize === "function") {
      const tam = e.getElementSize(inicio);
      caixa.style.width = `${tam.width + 20}px`;
      caixa.style.height = `${tam.height}px`;
    }
    CG.aviso("Este painel é do emulador: use o mouse ou o toque.");
  }

  function fecharAvancado() {
    if (!document.body.classList.contains("avancado")) return;
    const e = emu();
    document.body.classList.remove("avancado");
    fecharAvancadoBtn.hidden = true;
    if (e && typeof e.closeSettingsMenu === "function") e.closeSettingsMenu();
    // sem nenhuma janela aberta, o jogo roda (a mesma regra do menu de pausa)
    if (e && e.paused && !e.isNetplay && !document.querySelector("dialog[open]")) e.play();
  }

  // espera o menu terminar de fechar (ele solta a pausa do jogo) antes de pausar de novo
  $("opcao-avancado").addEventListener("click", eDepois(() => setTimeout(abrirAvancado, 120)));
  fecharAvancadoBtn.addEventListener("click", fecharAvancado);
  document.addEventListener("cg:fechar-avancado", fecharAvancado);

  // ---------- ao começar o jogo e a cada abertura do menu ----------
  document.addEventListener("cg:jogo-iniciado", () => {
    aplicarSom();
    marcarVoltar();
    setTimeout(marcarDisco, 1000);
    // o emulador fecha o painel sozinho quando se clica fora dele
    const painel = emu() && emu().settingsMenu;
    if (painel) {
      new MutationObserver(() => { if (painel.style.display === "none") fecharAvancado(); })
        .observe(painel, { attributes: true, attributeFilter: ["style"] });
    }
  }, { once: true });

  new MutationObserver(() => {
    if (!menu.open) return;
    nomeVelocidade.textContent = VELOCIDADES[velocidade];
    aplicarSom();
    marcarVoltar();
    marcarDisco();
  }).observe(menu, { attributes: true, attributeFilter: ["open"] });

  aplicarSom();
  marcarVoltar();
})();
