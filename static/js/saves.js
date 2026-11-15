// Saves no servidor: os botões "salvar estado" e "carregar estado" do EmulatorJS
// passam a guardar o progresso no servidor, por jogador.
// Em qualquer aparelho, entrando com o mesmo nome e PIN, os saves aparecem.
(function () {
  const gameId = document.getElementById("game").dataset.gameId;
  const dialogo = document.getElementById("dialogo-saves");
  const lista = document.getElementById("lista-saves");
  const vazio = document.getElementById("sem-saves");

  const aviso = (texto, tipo) => CG.aviso(texto, tipo === "success" ? "ok" : tipo === "error" ? "erro" : undefined);

  // Chamado pelo EmulatorJS ao clicar em "salvar estado"
  window.EJS_onSaveState = function ({ state, screenshot, format }) {
    const dados = new FormData();
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
    fetch(`/api/saves?game_id=${encodeURIComponent(gameId)}`)
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
      if (s.automatico) {
        const selo = document.createElement("em");
        selo.className = "selo-auto";
        selo.textContent = "Automático";
        quando.prepend(selo, " ");
        if (!s.imagem_url) carregar.prepend(Object.assign(document.createElement("div"), { className: "save-sem-imagem", textContent: "⟳" }));
      }
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

  function carregarSave(id, quando) {
    return fetch(`/saves/${id}/estado`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buf) => {
        window.EJS_emulator.gameManager.loadState(new Uint8Array(buf));
        if (dialogo.open) dialogo.close();
        aviso(quando ? `Save de ${quando} carregado ✓` : "Save carregado ✓", "success");
      })
      .catch(() => aviso("Não consegui carregar o save", "error"));
  }

  // ---------- atalhos rápidos (Select + R1 / Select + L1) ----------

  /** Salva o estado agora, pelo mesmo caminho do botão do emulador (com a foto da tela). */
  CG.salvarRapido = function () {
    const emu = window.EJS_emulator;
    if (!emu || !emu.started) return;
    if (emu.isNetplay && !(emu.netplay && emu.netplay.owner)) {
      aviso("Na sala de outro aparelho, quem salva é o dono da sala.", "error");
      return;
    }
    aviso("Salvando…");
    emu.elements.bottomBar.saveState[0].click();
  };

  /** Carrega o último save feito à mão (ou o automático, se não houver nenhum). */
  CG.carregarUltimo = function () {
    const emu = window.EJS_emulator;
    if (!emu || !emu.started) return;
    fetch(`/api/saves?game_id=${encodeURIComponent(gameId)}`)
      .then((r) => r.json())
      .then((saves) => {
        const escolhido = saves.find((s) => !s.automatico) || saves[0];
        if (!escolhido) { aviso("Nenhum save seu neste jogo ainda.", "error"); return; }
        carregarSave(escolhido.id, escolhido.quando);
      })
      .catch(() => aviso("Não consegui buscar os saves", "error"));
  };

  function apagarSave(id, li) {
    fetch(`/api/saves/${id}`, { method: "DELETE" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        li.remove();
        vazio.hidden = lista.children.length > 0;
      })
      .catch(() => aviso("Não consegui apagar", "error"));
  }

  document.getElementById("fechar-saves").addEventListener("click", () => dialogo.close());
})();
