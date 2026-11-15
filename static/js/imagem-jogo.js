// Opções de imagem do menu de pausa: tela cheia, formato e o filtro da imagem
// (Original, TV antiga ou Suave, usando os shaders do próprio emulador).
// Tudo fica lembrado neste aparelho e vale para todos os jogos.
//   Tela cheia: entra sozinha no primeiro toque/clique/tecla depois que o jogo abre
//     (o navegador só deixa entrar em tela cheia depois de um gesto da pessoa).
//   Formato "Tela toda": estica a imagem até as bordas, sem faixas pretas nos lados.
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

  const CHAVE_TELA = "cg-tela-cheia";   // "nao" = a pessoa desligou a tela cheia automática
  const emTelaCheia = () => !!document.fullscreenElement;
  let telaCheiaAuto = true;
  try { telaCheiaAuto = localStorage.getItem(CHAVE_TELA) !== "nao"; } catch (e) { /* padrão: ligada */ }

  async function entrarTelaCheia() {
    if (emTelaCheia()) return;
    await document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    // em tela cheia o Esc sai dela antes de chegar na página; com o teclado travado,
    // um toque no Esc abre o menu (segurar o Esc ainda sai da tela cheia)
    if (emTelaCheia() && navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(["Escape"]).catch(() => {});
  }

  botaoTela.addEventListener("click", async () => {
    telaCheiaAuto = !emTelaCheia();
    try { localStorage.setItem(CHAVE_TELA, telaCheiaAuto ? "sim" : "nao"); } catch (e) { /* vale só agora */ }
    if (emTelaCheia()) await document.exitFullscreen().catch(() => {});
    else await entrarTelaCheia();
    marcarBotoes();
  });

  // tela cheia automática: tenta já ao abrir; se o navegador recusar, entra no primeiro
  // toque, clique ou tecla (o Esc não conta: ele abre o menu)
  if (telaCheiaAuto) {
    entrarTelaCheia();
    const primeiroGesto = (e) => {
      if (e.type === "keydown" && e.key === "Escape") return;
      ["pointerdown", "keydown"].forEach((t) => document.removeEventListener(t, primeiroGesto, true));
      if (telaCheiaAuto) entrarTelaCheia();
    };
    ["pointerdown", "keydown"].forEach((t) => document.addEventListener(t, primeiroGesto, true));
  }

  // ---------- formato: tela toda (esticada) ou original ----------
  // O emulador desenha a imagem no formato do console (4:3) e completa o resto com preto.
  // Para esticar sem mexer no emulador: a tela do jogo (canvas) fica exatamente no formato
  // do console e é esticada na horizontal até as bordas. Só em tela deitada; em pé (celular)
  // fica como está.
  const CHAVE_FORMATO = "cg-formato-imagem";
  const botaoFormato = document.getElementById("imagem-formato");
  const nomeFormato = document.getElementById("nome-formato");
  let esticar = true;
  try { esticar = localStorage.getItem(CHAVE_FORMATO) !== "original"; } catch (e) { /* padrão: tela toda */ }
  let ultimo = "";

  function ajustarFormato() {
    const emu = window.EJS_emulator;
    const canvas = emu && emu.canvas;
    if (!canvas || !canvas.parentElement) return;
    let estilo = "";
    if (esticar && emu.started) {
      let prop = 4 / 3;
      try { prop = emu.gameManager.getVideoDimensions("aspect") || prop; } catch (e) { /* 4:3 */ }
      const caixa = canvas.parentElement.getBoundingClientRect();
      const largura = caixa.height * prop;
      if (prop > 0.5 && prop < 3 && caixa.width > largura + 2) {
        estilo = `${Math.round(largura)}|${Math.round(caixa.height)}|${caixa.width / largura}`;
      }
    }
    if (estilo === ultimo && (!estilo || canvas.style.transform)) return;
    ultimo = estilo;
    if (!estilo) {
      ["width", "height", "transform", "transformOrigin"].forEach((k) => { canvas.style[k] = ""; });
      return;
    }
    const [l, a, escala] = estilo.split("|");
    canvas.style.width = `${l}px`;
    canvas.style.height = `${a}px`;
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `scaleX(${escala})`;
  }

  botaoFormato.addEventListener("click", () => {
    esticar = !esticar;
    try { localStorage.setItem(CHAVE_FORMATO, esticar ? "tela-toda" : "original"); } catch (e) { /* vale só agora */ }
    marcarBotoes();
    ajustarFormato();
  });
  window.addEventListener("resize", ajustarFormato);
  document.addEventListener("fullscreenchange", () => setTimeout(ajustarFormato, 100));
  // alguns jogos mudam de resolução no meio (PS1), então confere de tempos em tempos
  document.addEventListener("cg:jogo-iniciado", () => { ajustarFormato(); setInterval(ajustarFormato, 1000); }, { once: true });

  function marcarBotoes() {
    botaoTela.setAttribute("aria-pressed", String(emTelaCheia()));
    nomeFiltro.textContent = FILTROS[atual].nome;
    nomeFormato.textContent = esticar ? "Tela toda" : "Original";
  }
  marcarBotoes();
  document.addEventListener("fullscreenchange", marcarBotoes);

  // o filtro escolhido vale assim que o jogo começa
  document.addEventListener("cg:jogo-iniciado", () => { if (atual) aplicarFiltro(); }, { once: true });

  CG.imagem = { marcarBotoes };
})();
