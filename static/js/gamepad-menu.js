// Navegar no menu pelo controle (ou setas do teclado): direcional move, A/Enter abre.
(function () {
  const itens = () => Array.from(document.querySelectorAll("a.sala, a.cartucho"));

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

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const mapa = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (mapa[e.key]) { e.preventDefault(); mover(...mapa[e.key]); }
  });

  // Gamepad API: lê os botões a cada quadro
  const anterior = {};
  function loop() {
    for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
      if (!gp) continue;
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      const estado = {
        esq: b(14) || ax < -0.5, dir: b(15) || ax > 0.5,
        cima: b(12) || ay < -0.5, baixo: b(13) || ay > 0.5,
        a: b(0),
      };
      const prev = anterior[gp.index] || {};
      if (estado.esq && !prev.esq) mover(-1, 0);
      if (estado.dir && !prev.dir) mover(1, 0);
      if (estado.cima && !prev.cima) mover(0, -1);
      if (estado.baixo && !prev.baixo) mover(0, 1);
      if (estado.a && !prev.a && itens().includes(document.activeElement)) document.activeElement.click();
      anterior[gp.index] = estado;
    }
    requestAnimationFrame(loop);
  }
  window.addEventListener("gamepadconnected", () => requestAnimationFrame(loop), { once: true });
})();
