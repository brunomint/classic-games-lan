// Menu inicial: relógio, nome do jogo em foco, legenda dos ícones,
// "Jogar junto" (salas abertas + QR) e a dica do botão A no canto.
(function () {
  const fileira = document.getElementById("fileira");
  const legenda = document.querySelector(".legenda");
  const tituloFoco = document.getElementById("titulo-foco");
  const infoFoco = document.getElementById("info-foco");
  const dockLegenda = document.getElementById("dock-legenda");
  const dicaTexto = document.getElementById("dica-ok-texto");

  // ---------- jogo em foco: nome em cima dele ----------
  function mostrarJogo(tile) {
    tituloFoco.textContent = tile.dataset.titulo;
    infoFoco.textContent = tile.dataset.info;
    dicaTexto.textContent = "Jogar";
    document.dispatchEvent(new CustomEvent("cg:jogo-em-foco", { detail: { tile } }));
    // a legenda acompanha a capa selecionada (no celular fica parada)
    if (window.matchMedia("(min-width: 701px)").matches) {
      // posição da capa dentro da área visível da fileira
      const x = tile.getBoundingClientRect().left - fileira.getBoundingClientRect().left
        - parseFloat(getComputedStyle(fileira).paddingLeft);
      // largura do texto (nome + detalhe), para não sair pela direita
      const estrela = document.getElementById("favoritar-foco");
      const texto = tituloFoco.offsetWidth + 12 + infoFoco.offsetWidth + (estrela ? estrela.offsetWidth + 12 : 0);
      const limite = fileira.clientWidth - texto - 2 * parseFloat(getComputedStyle(legenda).paddingLeft);
      legenda.style.transform = `translateX(${Math.max(0, Math.min(x, limite))}px)`;
    }
  }

  if (fileira) {
    const tiles = Array.from(fileira.querySelectorAll(".tile"));
    tiles.forEach((t) => {
      t.addEventListener("focus", () => mostrarJogo(t));
      t.addEventListener("mouseenter", () => mostrarJogo(t));
    });
    const primeiroVisivel = () => tiles.find((t) => !t.hidden);
    fileira.addEventListener("scroll", () => {
      const ativo = document.activeElement;
      const atual = ativo.classList.contains("tile") && !ativo.hidden ? ativo : primeiroVisivel();
      if (atual) mostrarJogo(atual);
    }, { passive: true });

    // filtro-jogos.js trocou a aba ou a pesquisa: a legenda vai para o primeiro jogo que sobrou
    document.addEventListener("cg:fileira-mudou", (e) => {
      const primeiro = primeiroVisivel();
      if (!primeiro) return;
      const ativo = document.activeElement;
      const perdeuFoco = ativo && ativo.classList.contains("tile") && ativo.hidden;
      if (perdeuFoco || (e.detail && e.detail.focarPrimeiro && !document.querySelector("dialog[open]"))) {
        primeiro.focus({ preventScroll: true });
      }
      const atual = document.activeElement.classList.contains("tile") ? document.activeElement : primeiro;
      requestAnimationFrame(() => mostrarJogo(atual));
    });
    if (tiles.length) {
      mostrarJogo(tiles[0]);
      // como num console: já começa com o primeiro jogo selecionado
      if (window.matchMedia("(hover: hover)").matches) (primeiroVisivel() || tiles[0]).focus({ preventScroll: true });
    }
  }

  // ---------- legenda dos ícones de baixo ----------
  document.querySelectorAll(".dock-btn").forEach((btn) => {
    const mostrar = () => { dockLegenda.textContent = btn.dataset.rotulo; dicaTexto.textContent = "Abrir"; };
    btn.addEventListener("focus", mostrar);
    btn.addEventListener("mouseenter", mostrar);
    btn.addEventListener("blur", () => { dockLegenda.textContent = ""; });
    btn.addEventListener("mouseleave", () => { if (document.activeElement !== btn) dockLegenda.textContent = ""; });
  });

  // ---------- Jogar junto: salas abertas + QR ----------
  const dialogo = document.getElementById("dialogo-junto");
  const secao = document.getElementById("salas");
  const lista = document.getElementById("lista-salas");
  const semSalas = document.getElementById("sem-salas");
  const selo = document.getElementById("selo-salas");
  const jogando = document.getElementById("jogando");

  const qrBox = document.getElementById("qr");
  if (qrBox && window.qrcode) {
    const qr = qrcode(0, "M");
    qr.addData(qrBox.dataset.url);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
  }

  document.getElementById("abrir-junto").addEventListener("click", () => dialogo.showModal());
  document.getElementById("fechar-junto").addEventListener("click", () => dialogo.close());

  function render(salas) {
    secao.hidden = salas.length === 0;
    semSalas.hidden = salas.length > 0;
    selo.hidden = salas.length === 0;
    selo.textContent = salas.length;
    const pessoas = salas.reduce((n, s) => n + s.current, 0);
    jogando.hidden = pessoas === 0;
    jogando.textContent = pessoas === 1 ? "1 jogando agora" : `${pessoas} jogando agora`;

    lista.replaceChildren(...salas.map((sala) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `${sala.url}?${new URLSearchParams({ sala: sala.session_id })}`;
      a.className = "sala";
      const pulso = document.createElement("span");
      pulso.className = "pulso";
      const texto = document.createElement("span");
      texto.className = "sala-texto";
      const jogo = document.createElement("strong");
      jogo.textContent = sala.title;
      const quem = document.createElement("span");
      const vagas = sala.max - sala.current;
      quem.textContent = `${sala.player_name} está esperando, ${vagas === 1 ? "falta 1 jogador" : `cabem mais ${vagas}`}`;
      texto.append(jogo, quem);
      const entrar = document.createElement("span");
      entrar.className = "botao botao-peq";
      entrar.dataset.botao = "A";
      entrar.textContent = sala.hasPassword ? "Entrar (com senha)" : "Entrar";
      a.append(pulso, texto, entrar);
      li.append(a);
      return li;
    }));
  }

  function atualizar() {
    fetch("/api/salas").then((r) => r.json()).then(render).catch(() => {});
  }
  atualizar();
  setInterval(atualizar, 3000);
})();
