// Navegar pelas páginas com o controle (ou o teclado), como no menu de um console.
//   direcional / setas  → move o foco entre os itens navegáveis
//   A / Enter           → abre o item em foco
//   B / Esc             → fecha o diálogo aberto; sem diálogo, volta (data-atalho="b" ou página anterior)
//   X, Y                → atalhos marcados com data-atalho="x" / "y"
//   L1, R1              → evento cg:aba (troca a aba de consoles do menu inicial)
//   Select              → evento cg:select (favoritar o jogo em foco no menu inicial)
//
// Na tela do jogo (body.jogo) o controle é do jogo: aqui só vale dentro dos nossos
// diálogos (menu de pausa, resultado...) e para os atalhos com Select:
//   Select + Start → menu de pausa (no teclado: Esc)
//   Select + R1    → salvar agora
//   Select + L1    → carregar o último save
//   Select + R2    → acelerar (liga/desliga)
//   Select + L2    → voltar no tempo, enquanto segurar
// Os controles com numeração própria são traduzidos por perfis-controle.js.
(function () {
  const SELETOR = [
    "a.tile", ".dock-btn", "a.sala", "[data-nav]",
    "dialog[open] button", "dialog[open] a[href]", "dialog[open] .opcoes label",
    "dialog[open] input:not([type=hidden]):not([type=radio])", "dialog[open] select", "dialog[open] textarea",
  ].join(", ");
  const naTelaDoJogo = () => document.body.classList.contains("jogo");
  const dialogoAberto = () => document.querySelector("dialog[open]");

  // com um diálogo aberto, só os itens dele contam
  function itens() {
    const raiz = dialogoAberto() || document;
    return Array.from(raiz.querySelectorAll(SELETOR)).filter((el) => el.offsetParent !== null && !el.disabled);
  }

  function focar(el) {
    el.focus();
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  function mover(dx, dy) {
    const lista = itens();
    if (!lista.length) return;
    const atual = document.activeElement;
    if (!lista.includes(atual)) { focar(lista[0]); return; }

    const r0 = atual.getBoundingClientRect();
    const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
    let melhor = null;
    let melhorDist = Infinity;

    for (const el of lista) {
      if (el === atual) continue;
      const r = el.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const vx = c.x - c0.x;
      const vy = c.y - c0.y;
      // só considera itens na direção pedida
      if (dx && (Math.sign(vx) !== dx || Math.abs(vx) < 4)) continue;
      if (dy && (Math.sign(vy) !== dy || Math.abs(vy) < 4)) continue;
      // peso maior para o desvio lateral: prefere o vizinho "em linha"
      const dist = dx ? Math.abs(vx) + Math.abs(vy) * 3 : Math.abs(vy) + Math.abs(vx) * 0.6;
      if (dist < melhorDist) { melhorDist = dist; melhor = el; }
    }
    if (melhor) focar(melhor);
  }

  function atalho(letra) {
    const raiz = dialogoAberto() || document;
    const alvo = raiz.querySelector(`[data-atalho="${letra}"]`);
    if (alvo && alvo.offsetParent !== null) { alvo.click(); return true; }
    return false;
  }

  function voltar() {
    const d = dialogoAberto();
    if (d) {
      // fecha pelo botão de cancelar do diálogo (assim cada um faz o que precisa ao fechar)
      const cancelar = d.querySelector('[data-botao="B"], [data-atalho="b"]');
      if (cancelar) cancelar.click(); else d.close();
      return;
    }
    if (naTelaDoJogo()) return;
    if (!atalho("b") && history.length > 1) history.back();
  }

  function confirmar() {
    const el = document.activeElement;
    if (!itens().includes(el)) return;
    if (el.tagName === "INPUT" && el.type !== "checkbox" && el.type !== "file") return;  // texto: usa o teclado
    el.click();
  }

  // ---------- teclado ----------

  document.addEventListener("keydown", (e) => {
    const campo = ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName);
    if (naTelaDoJogo() && !dialogoAberto()) {
      if (e.key === "Escape" && !e.repeat) {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("cg:menu-pausa"));
      }
      return;
    }
    const mapa = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (mapa[e.key] && !(campo && (e.key === "ArrowLeft" || e.key === "ArrowRight"))) {
      e.preventDefault();
      document.body.classList.add("usando-controle");
      mover(...mapa[e.key]);
    } else if (e.key === "Escape" && !dialogoAberto()) {
      voltar();
    }
  });

  // mexeu o mouse ou tocou na tela: some o destaque de "usando controle"
  ["pointerdown", "mousemove"].forEach((ev) =>
    document.addEventListener(ev, () => document.body.classList.remove("usando-controle"), { passive: true }));

  // ---------- controle (Gamepad API) ----------

  const anterior = {};
  const voltando = {};   // controle segurando Select + L2 (voltar no tempo)
  let rodando = false;

  function loop() {
    const controles = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    for (const gp of controles) {
      const agora = CG.lerControle(gp);
      const antes = anterior[gp.index] || {};
      const apertou = (k) => agora[k] && !antes[k];
      anterior[gp.index] = agora;

      // atalhos com Select (só na tela do jogo); "combo" = os dois apertados agora, e não antes
      const combo = (k) => agora.select && agora[k] && !(antes.select && antes[k]);
      if (naTelaDoJogo() && combo("start")) {
        document.dispatchEvent(new CustomEvent("cg:menu-pausa"));   // abre ou fecha o menu
        continue;
      }
      // voltar no tempo: vale enquanto Select + L2 estiverem apertados
      const segurandoVoltar = agora.select && agora.l2;
      if (naTelaDoJogo() && voltando[gp.index] && !segurandoVoltar) {
        voltando[gp.index] = false;
        document.dispatchEvent(new CustomEvent("cg:voltar-tempo", { detail: { ativo: false } }));
      }
      if (naTelaDoJogo() && !dialogoAberto()) {
        if (combo("r1")) document.dispatchEvent(new CustomEvent("cg:salvar-rapido"));
        if (combo("l1")) document.dispatchEvent(new CustomEvent("cg:carregar-rapido"));
        if (combo("r2")) document.dispatchEvent(new CustomEvent("cg:acelerar"));
        if (combo("l2")) {
          voltando[gp.index] = true;
          document.dispatchEvent(new CustomEvent("cg:voltar-tempo", { detail: { ativo: true } }));
        }
        continue;   // o resto do controle é do jogo
      }

      // L1 / R1 fora do jogo: troca a aba de consoles do menu inicial
      if (!dialogoAberto()) {
        if (apertou("l1")) document.dispatchEvent(new CustomEvent("cg:aba", { detail: { passo: -1 } }));
        if (apertou("r1")) document.dispatchEvent(new CustomEvent("cg:aba", { detail: { passo: 1 } }));
        if (apertou("select")) document.dispatchEvent(new CustomEvent("cg:select"));   // favoritar
      }

      const algum = ["esq", "dir", "cima", "baixo", "a", "b", "x", "y"].some(apertou);
      if (algum) document.body.classList.add("usando-controle");
      if (apertou("esq")) mover(-1, 0);
      if (apertou("dir")) mover(1, 0);
      if (apertou("cima")) mover(0, -1);
      if (apertou("baixo")) mover(0, 1);
      if (apertou("a")) confirmar();
      if (apertou("b")) voltar();
      if (apertou("x")) atalho("x");
      if (apertou("y")) atalho("y");
    }
    if (controles.length) requestAnimationFrame(loop);
    else rodando = false;
  }

  function iniciar() {
    if (rodando) return;
    rodando = true;
    requestAnimationFrame(loop);
  }

  window.addEventListener("gamepadconnected", iniciar);
  // controles já conectados antes da página abrir aparecem no primeiro aperto
  if (navigator.getGamepads && Array.from(navigator.getGamepads()).some(Boolean)) iniciar();
})();
