// Save automático: guarda o progresso sozinho, para não perder nada se a tela apagar,
// o app for trocado ou a bateria acabar.
//
//  1. quando a página some (tela apagou, outro app, aba fechando): pausa e salva na hora
//  2. a cada 2 minutos de jogo: salva em silêncio (cobre desligamento sem aviso)
//  3. se o envio não terminar a tempo, o save fica guardado no aparelho e sobe na próxima vez
//
// Existe um só save automático por jogador e jogo (o servidor troca o anterior).
// Ao abrir o jogo, se houver um, pergunta "Continuar de onde parou?".
(function () {
  const gameId = document.getElementById("game").dataset.gameId;
  const nome = document.body.dataset.jogadorNome || "";
  const vemDeSala = new URLSearchParams(location.search).has("sala");
  const INTERVALO_MS = 2 * 60 * 1000;
  const LIMITE_RAPIDO = 60 * 1024;        // o envio "de emergência" (sendBeacon) aceita ~64 KB
  const QUADROS_MIN_PERIODICO = 60 * 30;  // ~30 s de jogo desde o último save
  const QUADROS_MIN_SAINDO = 60 * 5;      // ~5 s

  let ultimoQuadro = null;
  let pausadoPorNos = false;

  const emu = () => window.EJS_emulator;

  function quadroAtual() {
    try { return emu().gameManager.getFrameNum(); } catch (e) { return null; }
  }

  function podeSalvar() {
    const e = emu();
    if (!e || !e.gameManager || !e.started) return false;
    // em sala de netplay o jogo roda no anfitrião: só ele salva
    return !e.isNetplay || (e.netplay && e.netplay.owner);
  }

  function jogouDesde(minimo) {
    const q = quadroAtual();
    return q !== null && (ultimoQuadro === null || q - ultimoQuadro >= minimo);
  }

  // ---------- cópia guardada no aparelho (IndexedDB) ----------

  const chave = `${nome}:${gameId}`;
  function abrirBanco() {
    return new Promise((ok, falha) => {
      const req = indexedDB.open("classic-games", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("pendentes");
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  }
  function guardar(valor) {
    return abrirBanco().then((banco) => new Promise((ok) => {
      const tx = banco.transaction("pendentes", "readwrite");
      if (valor) tx.objectStore("pendentes").put(valor, chave);
      else tx.objectStore("pendentes").delete(chave);
      tx.oncomplete = ok;
      tx.onerror = ok;
    })).catch(() => {});
  }
  function lerGuardado() {
    return abrirBanco().then((banco) => new Promise((ok) => {
      const req = banco.transaction("pendentes").objectStore("pendentes").get(chave);
      req.onsuccess = () => ok(req.result || null);
      req.onerror = () => ok(null);
    })).catch(() => null);
  }

  // ---------- capturar e enviar ----------

  async function comprimir(bytes) {
    if (!window.CompressionStream) return { blob: new Blob([bytes]), gzip: false };
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return { blob: await new Response(stream).blob(), gzip: true };
  }

  function formulario(save) {
    const dados = new FormData();
    dados.append("game_id", gameId);
    dados.append("automatico", "1");
    dados.append("criado_em", String(save.ts));
    if (save.gzip) dados.append("comprimido", "gzip");
    dados.append("estado", save.blob, "auto.state");
    return dados;
  }

  function enviar(save, urgente) {
    // saindo da página: sendBeacon é o único envio que o navegador garante terminar
    if (urgente && save.blob.size <= LIMITE_RAPIDO && navigator.sendBeacon("/api/saves", formulario(save))) {
      return guardar(null);
    }
    return fetch("/api/saves", { method: "POST", body: formulario(save), keepalive: save.blob.size <= LIMITE_RAPIDO })
      .then((r) => { if (r.ok) return guardar(null); })
      .catch(() => { /* fica guardado no aparelho e sobe depois */ });
  }

  async function salvarAgora(urgente) {
    if (!podeSalvar()) return;
    const quadro = quadroAtual();
    let bytes;
    try { bytes = emu().gameManager.getState(); } catch (e) { return; }
    ultimoQuadro = quadro;
    const { blob, gzip } = await comprimir(bytes);
    const save = { blob, gzip, ts: Date.now() };
    await guardar(save);          // primeiro no aparelho (garantia), depois no servidor
    await enviar(save, urgente);
  }

  // ---------- gatilhos ----------

  document.addEventListener("visibilitychange", () => {
    const e = emu();
    if (document.visibilityState === "hidden") {
      if (podeSalvar() && jogouDesde(QUADROS_MIN_SAINDO)) salvarAgora(true);
      // pausa o jogo (fora do netplay, onde pausar afetaria os outros)
      if (e && e.started && !e.isNetplay && !e.paused) {
        e.pause();
        pausadoPorNos = true;
      }
    } else if (pausadoPorNos && e) {
      pausadoPorNos = false;
      e.play();
    }
  });

  setInterval(() => {
    if (document.visibilityState === "visible" && podeSalvar() && jogouDesde(QUADROS_MIN_PERIODICO)) {
      salvarAgora(false);
    }
  }, INTERVALO_MS);

  // ---------- ao abrir o jogo ----------

  const dialogo = document.getElementById("dialogo-continuar");
  const quando = document.getElementById("quando-continuar");

  function carregar(saveId) {
    return fetch(`/saves/${saveId}/estado`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buf) => {
        emu().gameManager.loadState(new Uint8Array(buf));
        ultimoQuadro = quadroAtual();
      });
  }

  async function aoIniciar() {
    ultimoQuadro = quadroAtual();
    // 1) sobe o que ficou guardado no aparelho da última vez
    const pendente = await lerGuardado();
    if (pendente) await enviar(pendente, false);

    // 2) oferece continuar (não para quem entra na sala de outro: lá o jogo é do anfitrião)
    if (vemDeSala || emu().isNetplay) return;
    const saves = await fetch(`/api/saves?game_id=${encodeURIComponent(gameId)}`).then((r) => r.json()).catch(() => []);
    const auto = saves.find((s) => s.automatico);
    if (!auto) return;
    quando.textContent = auto.quando;
    emu().pause();
    dialogo.showModal();
    document.getElementById("sim-continuar").onclick = () => {
      dialogo.close();
      carregar(auto.id).finally(() => emu().play());
    };
    document.getElementById("nao-continuar").onclick = () => {
      dialogo.close();
      emu().play();
    };
  }

  document.addEventListener("cg:jogo-iniciado", () => { aoIniciar(); }, { once: true });

  CG.autosave = { salvarAgora };
})();
