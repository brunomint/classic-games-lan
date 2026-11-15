// Opções de imagem do menu de pausa: tela cheia e o filtro da imagem
// (Original, TV antiga ou Suave, usando os shaders do próprio emulador).
// O filtro escolhido fica lembrado neste aparelho e vale para todos os jogos.
window.CG = window.CG || {};

(function () {
  const CHAVE = "cg-filtro-imagem";
  const FILTROS = [
    { nome: "Original", shader: "disabled" },
    { nome: "TV antiga", shader: "crt-easymode.glslp" },
    { nome: "Suave", shader: "bicubic" },
  ];
  const botaoTela = document.getElementById("imagem-tela-cheia");
  const botaoFiltro = document.getElementById("imagem-filtro");
  const nomeFiltro = document.getElementById("nome-filtro");

  let atual = 0;
  try { atual = Math.max(0, FILTROS.findIndex((f) => f.nome === localStorage.getItem(CHAVE))); } catch (e) { /* padrão */ }

  function aplicarFiltro() {
    const emu = window.EJS_emulator;
    nomeFiltro.textContent = FILTROS[atual].nome;
    if (!emu || !emu.started || typeof emu.changeSettingOption !== "function") return;
    const shader = FILTROS[atual].shader;
    if (emu.shaders && shader !== "disabled" && !emu.shaders[shader]) return;   // este núcleo não tem o filtro
    emu.changeSettingOption("shader", shader);
    emu.menuOptionChanged("shader", shader);
  }

  botaoFiltro.addEventListener("click", () => {
    atual = (atual + 1) % FILTROS.length;
    try { localStorage.setItem(CHAVE, FILTROS[atual].nome); } catch (e) { /* vale só agora */ }
    aplicarFiltro();
  });

  // ---------- tela cheia ----------

  const emTelaCheia = () => !!document.fullscreenElement;

  botaoTela.addEventListener("click", async () => {
    if (emTelaCheia()) {
      await document.exitFullscreen().catch(() => {});
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
      // em tela cheia o Esc sai dela antes de chegar na página; com o teclado travado,
      // um toque no Esc abre o menu (segurar o Esc ainda sai da tela cheia)
      if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(["Escape"]).catch(() => {});
    }
  });

  function marcarBotoes() {
    botaoTela.setAttribute("aria-pressed", String(emTelaCheia()));
    nomeFiltro.textContent = FILTROS[atual].nome;
  }
  document.addEventListener("fullscreenchange", marcarBotoes);

  // o filtro escolhido vale assim que o jogo começa
  document.addEventListener("cg:jogo-iniciado", () => { if (atual) aplicarFiltro(); }, { once: true });

  CG.imagem = { marcarBotoes };
})();
