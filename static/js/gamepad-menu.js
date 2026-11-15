// Navegar pelas páginas com o controle (ou o teclado), como no menu de um console.
//   direcional / setas  → move o foco entre os itens navegáveis
//   A / Enter           → abre o item em foco
//   B / Esc             → volta (o que estiver marcado com data-atalho="b", senão a página anterior)
//   X, Y                → atalhos marcados com data-atalho="x" / "y" (aparecem na barra de dicas)
(function () {
  const SELETOR = "a.continuar, a.sala, a.cartucho, [data-nav]";
  const itens = () => Array.from(document.querySelectorAll(SELETOR)).filter((el) => el.offsetParent !== null);

  function mover(dx, dy) {
    const lista = itens();
    if (!lista.length) return;
    const atual = document.activeElement;
    if (!lista.includes(atual)) { lista[0].focus(); return; }

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
      if (dx && Math.sign(vx) !== dx) continue;
      if (dy && Math.sign(vy) !== dy) continue;
      if (dx && Math.abs(vy) > r0.height) continue;
      const dist = Math.hypot(vx, vy * (dx ? 3 : 1));
      if (dist < melhorDist) { melhorDist = dist; melhor = el; }
    }
    if (melhor) {
      melhor.focus();
      melhor.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function atalho(letra) {
    const alvo = document.querySelector(`[data-atalho="${letra}"]`);
    if (alvo) { alvo.click(); return true; }
    return false;
  }

  function voltar() {
    if (document.querySelector("dialog[open]")) return;   // o diálogo cuida do próprio Esc
    if (!atalho("b") && history.length > 1) history.back();
  }

  document.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    const mapa = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (mapa[e.key]) { e.preventDefault(); mover(...mapa[e.key]); }
    else if (e.key === "Escape") voltar();
  });

  // Gamepad API: lê os botões a cada quadro (só enquanto há controle conectado)
  const anterior = {};
  function loop() {
    const controles = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    for (const gp of controles) {
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      const agora = {
        esq: b(14) || ax < -0.5, dir: b(15) || ax > 0.5,
        cima: b(12) || ay < -0.5, baixo: b(13) || ay > 0.5,
        a: b(0), b: b(1), x: b(2), y: b(3),
      };
      const antes = anterior[gp.index] || {};
      const apertou = (k) => agora[k] && !antes[k];
      if (apertou("esq")) mover(-1, 0);
      if (apertou("dir")) mover(1, 0);
      if (apertou("cima")) mover(0, -1);
      if (apertou("baixo")) mover(0, 1);
      if (apertou("a") && itens().includes(document.activeElement)) document.activeElement.click();
      if (apertou("b")) voltar();
      if (apertou("x")) atalho("x");
      if (apertou("y")) atalho("y");
      anterior[gp.index] = agora;
    }
    if (controles.length) requestAnimationFrame(loop);
  }
  window.addEventListener("gamepadconnected", () => requestAnimationFrame(loop));
})();
