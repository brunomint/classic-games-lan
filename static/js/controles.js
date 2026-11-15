// Testar controles: mostra ao vivo cada controle e o que ele manda (botões e eixos),
// e envia um registro ao servidor para diagnosticar controles que fogem do padrão.
(function () {
  const lista = document.getElementById("lista-controles");
  const aviso = document.getElementById("aviso");
  const anterior = {};
  let fila = [];
  const t0 = Date.now();

  function registrar(texto) {
    fila.push(`+${((Date.now() - t0) / 1000).toFixed(1)}s ${texto}`);
  }

  setInterval(() => {
    if (!fila.length) return;
    const eventos = fila;
    fila = [];
    fetch("/api/controles/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventos }),
    }).catch(() => {});
  }, 1000);

  function cartao(g) {
    let el = document.getElementById(`controle-${g.index}`);
    if (el) return el;
    el = document.createElement("section");
    el.className = "controle";
    el.id = `controle-${g.index}`;
    el.innerHTML = `
      <h2>Controle ${g.index + 1}</h2>
      <p class="controle-id"></p>
      <p class="controle-tipo"></p>
      <p class="entende">O menu entende: <span class="leitura">nada apertado</span></p>
      <div class="botoes"></div>
      <div class="eixos"></div>`;
    el.querySelector(".controle-id").textContent = g.id;
    const perfil = CG.perfilDoControle(g);
    el.querySelector(".controle-tipo").textContent = !perfil
      ? "Numeração padrão: funciona direto."
      : perfil.nome === "Genérico"
        ? "Numeração própria e desconhecida: ajuste automático genérico (pode precisar remapear no jogo)."
        : `Reconhecido: ${perfil.nome}. Botões e direcional já ajustados.`;
    el.querySelector(".botoes").innerHTML = g.buttons.map((_, i) => `<span class="bt" data-i="${i}">${i}</span>`).join("");
    el.querySelector(".eixos").innerHTML = g.axes.map((_, i) => `<span class="ex" data-i="${i}">eixo ${i}<b>0</b></span>`).join("");
    lista.append(el);
    registrar(`controle ${g.index}: id="${g.id}" mapping="${g.mapping || "(nenhum)"}" botoes=${g.buttons.length} eixos=${g.axes.length}`);
    return el;
  }

  function loop() {
    const controles = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean);
    aviso.hidden = controles.length > 0;
    for (const g of controles) {
      const el = cartao(g);
      const ant = anterior[g.index] || { b: [], x: [] };
      g.buttons.forEach((bt, i) => {
        el.querySelector(`.bt[data-i="${i}"]`).classList.toggle("ativo", bt.pressed);
        if (bt.pressed && !ant.b[i]) registrar(`controle ${g.index} BOTAO ${i}`);
      });
      g.axes.forEach((v, i) => {
        const r = Math.abs(v) > 0.5 ? Math.sign(v) : 0;
        const box = el.querySelector(`.ex[data-i="${i}"]`);
        box.querySelector("b").textContent = v.toFixed(2);
        box.classList.toggle("ativo", r !== 0);
        if (r !== 0 && r !== ant.x[i]) registrar(`controle ${g.index} EIXO ${i} = ${r > 0 ? "+1" : "-1"} (${v.toFixed(2)})`);
      });
      const l = CG.lerControle(g);
      const nomes = [["cima", "↑"], ["baixo", "↓"], ["esq", "←"], ["dir", "→"], ["a", "A (confirmar)"], ["b", "B (voltar)"], ["x", "X"], ["y", "Y"]];
      const ativos = nomes.filter(([k]) => l[k]).map(([, n]) => n);
      el.querySelector(".leitura").textContent = ativos.length ? ativos.join("  ") : "nada apertado";
      anterior[g.index] = { b: g.buttons.map((b) => b.pressed), x: g.axes.map((v) => (Math.abs(v) > 0.5 ? Math.sign(v) : 0)) };
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener("gamepadconnected", (e) => registrar(`conectado: ${e.gamepad.index} "${e.gamepad.id}"`));
  window.addEventListener("gamepaddisconnected", (e) => registrar(`desconectado: ${e.gamepad.index}`));
  requestAnimationFrame(loop);
})();
