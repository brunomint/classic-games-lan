// Jogos favoritos (guardados no servidor, por jogador).
//   Menu inicial: Select no controle, ou a estrela ao lado do nome do jogo em foco.
//   Tela do jogo: "Favoritar" no menu de pausa (#pausa-favorito).
window.CG = window.CG || {};

(function () {
  /** Marca/desmarca e devolve o estado salvo no servidor. */
  CG.favoritar = function (gameId, favorito) {
    return fetch(`/api/favoritos/${encodeURIComponent(gameId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorito }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((r) => {
        CG.aviso(r.favorito ? "Adicionado aos favoritos ★" : "Tirado dos favoritos", "ok");
        return r.favorito;
      })
      .catch((e) => {
        CG.aviso("Não deu para salvar o favorito. Confira se você está logado.", "erro");
        throw e;
      });
  };

  function marcarBotao(botao, texto, favorito) {
    botao.setAttribute("aria-pressed", String(favorito));
    if (texto) texto.textContent = favorito ? "Favorito" : "Favoritar";
  }

  // ---------- menu de pausa ----------
  const botaoPausa = document.getElementById("pausa-favorito");
  if (botaoPausa) {
    const texto = document.getElementById("pausa-favorito-texto");
    botaoPausa.addEventListener("click", () => {
      const novo = botaoPausa.getAttribute("aria-pressed") !== "true";
      CG.favoritar(botaoPausa.dataset.gameId, novo).then((f) => marcarBotao(botaoPausa, texto, f)).catch(() => {});
    });
  }

  // ---------- menu inicial ----------
  const fileira = document.getElementById("fileira");
  const botaoFoco = document.getElementById("favoritar-foco");
  if (!fileira || !botaoFoco) return;

  const textoFoco = document.getElementById("favoritar-texto");
  const dicaTexto = document.getElementById("dica-favoritar-texto");
  const total = document.getElementById("total-favoritos");
  let atual = null;   // jogo em foco (o mesmo do nome em cima da fileira)

  function mostrarEstado() {
    const fav = Boolean(atual && "favorito" in atual.dataset);
    marcarBotao(botaoFoco, textoFoco, fav);
    if (dicaTexto) dicaTexto.textContent = fav ? "Tirar dos favoritos" : "Favoritar";
  }

  document.addEventListener("cg:jogo-em-foco", (e) => { atual = e.detail.tile; mostrarEstado(); });

  function alternar(tile) {
    if (!tile) return;
    const novo = !("favorito" in tile.dataset);
    CG.favoritar(tile.dataset.gameId, novo).then((fav) => {
      if (fav) tile.dataset.favorito = ""; else delete tile.dataset.favorito;
      if (total) total.textContent = fileira.querySelectorAll(".tile[data-favorito]").length;
      mostrarEstado();
      // na aba Favoritos, o jogo tirado some da fileira
      document.dispatchEvent(new CustomEvent("cg:filtro-atualizar"));
    }).catch(() => {});
  }

  // clicar na estrela não pode tirar o foco do jogo da vez
  botaoFoco.addEventListener("mousedown", (e) => e.preventDefault());
  botaoFoco.addEventListener("click", () => alternar(atual));
  document.addEventListener("cg:select", () => {
    const ativo = document.activeElement;
    alternar(ativo && ativo.classList.contains("tile") ? ativo : atual);
  });
})();
