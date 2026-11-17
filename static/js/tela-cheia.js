// Tela cheia nos menus (a tela do jogo tem a sua, em imagem-jogo.js).
// Ligada pelo botão "Tela cheia" do menu inicial; a escolha fica lembrada no aparelho
// (separada da do jogo, que liga sozinha). Ao trocar de página o navegador sai da tela cheia,
// então ela volta no primeiro toque, clique ou tecla da página nova.
// O navegador só aceita tela cheia depois de um toque, clique ou tecla: o controle não
// conta. Para usar só com o controle, abra pelo atalho "Fliperama de Casa" (abrir-tela-cheia.sh)
// ou aperte F11, que valem para todas as páginas.
(function () {
  if (document.body.classList.contains("jogo")) return;

  const CHAVE = "cg-tela-cheia-menus";
  const emTelaCheia = () => !!document.fullscreenElement;
  // F11 ou atalho: o navegador inteiro já está em tela cheia
  const navegadorEmTelaCheia = () => !emTelaCheia() && window.innerHeight >= screen.height - 2 && window.innerWidth >= screen.width - 2;
  let ligada = false;
  try { ligada = localStorage.getItem(CHAVE) === "sim"; } catch (e) { /* desligada */ }
  let saindoPeloBotao = false;

  function guardar(v) {
    ligada = v;
    try { localStorage.setItem(CHAVE, v ? "sim" : "nao"); } catch (e) { /* vale só agora */ }
  }

  function entrar() {
    if (emTelaCheia() || navegadorEmTelaCheia()) return Promise.resolve(true);
    return document.documentElement.requestFullscreen({ navigationUI: "hide" }).then(() => true, () => false);
  }

  const botao = document.getElementById("botao-tela-cheia");
  function marcar() {
    if (!botao) return;
    const ativa = emTelaCheia() || navegadorEmTelaCheia();
    botao.setAttribute("aria-pressed", String(ativa));
    botao.dataset.rotulo = ativa ? "Sair da tela cheia" : "Tela cheia";
    const legenda = document.getElementById("dock-legenda");
    if (legenda && document.activeElement === botao) legenda.textContent = botao.dataset.rotulo;
  }

  if (botao) {
    botao.addEventListener("click", () => {
      if (navegadorEmTelaCheia()) {
        if (window.CG && CG.aviso) CG.aviso("Para sair da tela cheia, aperte F11.", "ok");
        return;
      }
      if (emTelaCheia()) {
        guardar(false);
        saindoPeloBotao = true;
        document.exitFullscreen().catch(() => {});
        return;
      }
      guardar(true);
      entrar().then((ok) => {
        if (!ok && window.CG && CG.aviso) {
          CG.aviso("Pelo controle o navegador não deixa. Toque na tela, clique ou aperte F11 (ou abra pelo atalho Fliperama de Casa).", "erro");
        }
      });
    });
  }

  document.addEventListener("fullscreenchange", () => {
    // saiu pelo Esc (ou pelo navegador): entende que a pessoa não quer mais
    if (!emTelaCheia() && !saindoPeloBotao && ligada) guardar(false);
    saindoPeloBotao = false;
    marcar();
  });
  window.addEventListener("resize", marcar);
  marcar();

  // página nova: volta à tela cheia no primeiro gesto (o Esc não conta)
  if (ligada) {
    const primeiroGesto = (e) => {
      if (e.type === "keydown" && e.key === "Escape") return;
      ["pointerdown", "keydown"].forEach((t) => document.removeEventListener(t, primeiroGesto, true));
      if (ligada) entrar();
    };
    ["pointerdown", "keydown"].forEach((t) => document.addEventListener(t, primeiroGesto, true));
  }
})();
