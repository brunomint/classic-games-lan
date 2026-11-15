// Saves no servidor: os botões "salvar estado" e "carregar estado" do EmulatorJS
// passam a guardar o progresso no servidor, por jogador.
// Em outro aparelho, escolha o mesmo jogador na página inicial para ver os seus saves.
(function () {
  const gameId = document.getElementById("game").dataset.gameId;
  const dialogo = document.getElementById("dialogo-saves");
  const lista = document.getElementById("lista-saves");
  const vazio = document.getElementById("sem-saves");

  function aviso(texto, tipo) {
    const emu = window.EJS_emulator;
    if (emu && emu.frontend) emu.frontend.displayMessage(texto, 2500, undefined, tipo);
  }

  // Chamado pelo EmulatorJS ao clicar em "salvar estado"
  window.EJS_onSaveState = function ({ state, screenshot, format }) {
    const dados = new FormData();
    dados.append("jogador_id", CG.getJogadorId());
    dados.append("game_id", gameId);
    dados.append("estado", new Blob([state]), "estado.state");
    if (screenshot) {
      dados.append("imagem", new Blob([screenshot], { type: `image/${format}` }), `tela.${format}`);
      dados.append("formato", format || "png");
    }
    fetch("/api/saves", { method: "POST", body: dados })
      .then((r) => (r.ok ? aviso("Salvo no servidor ✓", "success") : Promise.reject()))
      .catch(() => aviso("Falhou ao salvar no servidor", "error"));
  };

  // Chamado pelo EmulatorJS ao clicar em "carregar estado"
  window.EJS_onLoadState = function () {
    const params = new URLSearchParams({ jogador_id: CG.getJogadorId(), game_id: gameId });
    fetch(`/api/saves?${params}`)
      .then((r) => r.json())
      .then(mostrar)
      .catch(() => aviso("Não consegui buscar os saves", "error"));
  };

  function mostrar(saves) {
    vazio.hidden = saves.length > 0;
    lista.replaceChildren(...saves.map((s) => {
      const li = document.createElement("li");

      const carregar = document.createElement("button");
      carregar.type = "button";
      carregar.className = "save";
      if (s.imagem_url) {
        const img = document.createElement("img");
        img.src = s.imagem_url;
        img.alt = "";
        img.loading = "lazy";
        carregar.append(img);
      }
      const quando = document.createElement("span");
      quando.textContent = s.quando;
      carregar.append(quando);
      carregar.addEventListener("click", () => carregarSave(s.id));

      const apagar = document.createElement("button");
      apagar.type = "button";
      apagar.className = "apagar-save";
      apagar.title = "Apagar este save";
      apagar.textContent = "✕";
      apagar.addEventListener("click", () => apagarSave(s.id, li));

      li.append(carregar, apagar);
      return li;
    }));
    dialogo.showModal();
  }

  function carregarSave(id) {
    fetch(`/saves/${id}/estado`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buf) => {
        window.EJS_emulator.gameManager.loadState(new Uint8Array(buf));
        dialogo.close();
        aviso("Save carregado ✓", "success");
      })
      .catch(() => aviso("Não consegui carregar o save", "error"));
  }

  function apagarSave(id, li) {
    const params = new URLSearchParams({ jogador_id: CG.getJogadorId() });
    fetch(`/api/saves/${id}?${params}`, { method: "DELETE" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        li.remove();
        vazio.hidden = lista.children.length > 0;
      })
      .catch(() => aviso("Não consegui apagar", "error"));
  }

  document.getElementById("fechar-saves").addEventListener("click", () => dialogo.close());
})();
