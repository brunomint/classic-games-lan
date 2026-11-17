// Teste de viabilidade do rollback (EXPERIMENTAL, branch rollback-rede).
// Só roda quando a página do jogo é aberta com ?teste-rollback no endereço.
//
// Rollback precisa de três coisas rápidas e confiáveis:
//   1. salvar o estado do jogo a cada quadro;
//   2. carregar um estado antigo na hora (sem esperar o próximo quadro);
//   3. rodar quadros extras "por fora" do ritmo normal, para alcançar o presente.
// E o jogo precisa ser determinístico: do mesmo estado, com os mesmos botões, chegar
// sempre no mesmo resultado. Este arquivo mede tudo isso e mostra na tela.
(function () {
  if (!/[?&]teste?-rollback\b/.test(location.search)) return;

  // O laço principal do Emscripten (MainLoop) fica escondido dentro do núcleo.
  // O EmulatorJS carrega o núcleo como um Blob de JavaScript; aqui a gente acrescenta
  // uma linha que o expõe em Module.MainLoop, para poder rodar quadros à mão.
  const BlobOriginal = window.Blob;
  const MARCA = 'Module["EmulatorJSGetState"]=EmulatorJSGetState;';
  window.Blob = function (partes, opcoes) {
    try {
      if (opcoes && opcoes.type === "application/javascript" && partes && partes[0] instanceof Uint8Array) {
        const texto = new TextDecoder().decode(partes[0]);
        if (texto.includes(MARCA)) {
          partes = [texto.replace(MARCA, MARCA + 'Module["MainLoop"]=MainLoop;')];
        }
      }
    } catch (e) { /* segue com o original */ }
    return new BlobOriginal(partes, opcoes);
  };
  window.Blob.prototype = BlobOriginal.prototype;

  function hash(bytes) {            // FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const max = (xs) => Math.max(...xs);
  const r = (x) => Math.round(x * 100) / 100;

  function painel(texto) {
    let el = document.getElementById("teste-rollback");
    if (!el) {
      el = document.createElement("pre");
      el.id = "teste-rollback";
      el.style.cssText = "position:fixed;left:8px;top:8px;z-index:99999;margin:0;padding:10px 12px;" +
        "background:rgba(0,0,0,.82);color:#fff;font:13px/1.45 monospace;border-radius:8px;white-space:pre-wrap;max-width:94vw";
      document.body.appendChild(el);
    }
    el.textContent = texto;
  }

  function relatar(dados) {
    try { fetch("/static/diag-rollback?" + encodeURIComponent(JSON.stringify(dados))).catch(() => {}); } catch (e) {}
  }

  // tempo normal de um quadro: mede entre o pre e o post do próprio laço
  const normais = [];
  let inicioQuadro = 0;

  function esperarModulo() {
    const emu = window.EJS_emulator;
    const gm = emu && emu.gameManager;
    const M = gm && gm.Module;
    if (!M || !M.MainLoop || !M.MainLoop.func || !emu.started) return setTimeout(esperarModulo, 500);
    const ML = M.MainLoop;
    ML.preMainLoop.push(() => { inicioQuadro = performance.now(); });
    ML.postMainLoop.push(() => { if (inicioQuadro && normais.length < 600) normais.push(performance.now() - inicioQuadro); });
    painel("Teste de rollback: jogue normalmente, começo a medir em 8 s…");
    // a medição roda DENTRO de um quadro do laço (com o jogo rodando de verdade); esse
    // quadro é pulado (return false) para o ritmo normal não se misturar com a medição.
    setTimeout(() => {
      let feito = false;
      ML.preMainLoop.unshift(() => {
        if (feito) return undefined;
        feito = true;
        medir(emu, gm, M, ML);
        return false;
      });
    }, 8000);
  }

  function medir(emu, gm, M, ML) {
    const res = { core: emu.getCore ? emu.getCore() : "?", ua: navigator.userAgent };
    const f = gm.functions;
    const salvar = () => M.EmulatorJSGetState();
    const quadro = () => ML.func();   // roda um quadro direto, sem os ganchos pre/post
    // O carregamento é uma "tarefa" do RetroArch: só é aplicado na próxima volta do laço,
    // e essa volta não roda quadro. Por isso carregar = pedir + uma volta.
    const carregar = (estado) => {
      try { gm.FS.unlink("/game.state"); } catch (e) {}
      gm.FS.writeFile("/game.state", estado);
      f.loadState("game.state", 0);
      quadro();
    };
    const botoes = (q) => { f.simulateInput(0, 8, q % 20 < 10 ? 1 : 0); f.simulateInput(0, 4, q % 7 < 3 ? 1 : 0); };
    const soltar = () => { f.simulateInput(0, 8, 0); f.simulateInput(0, 4, 0); };
    const tempos = (n, fn) => { const ts = []; for (let i = 0; i < n; i++) { const t = performance.now(); fn(i); ts.push(performance.now() - t); } return { mediana: r(med(ts)), maior: r(max(ts)) }; };

    // fora do avanço rápido, o RetroArch segura os quadros pelo relógio e uma chamada extra
    // não roda nada; com ele ligado (sem limite), cada chamada roda um quadro inteiro.
    f.setFastForwardRatio(0);
    f.toggleFastForward(1);
    let S0 = null;
    try {
      S0 = salvar();
      res.tamanhoEstadoKB = Math.round(S0.length / 1024);
      res.salvarMs = tempos(30, () => salvar());
      res.quadroMs = tempos(60, () => quadro());
      res.carregarMs = tempos(20, () => carregar(S0));

      // determinismo com botões: 3 vezes "carregar S0 + 64 quadros", e uma com fotos
      // (salvar+carregar) a cada 4 quadros no meio. Todos precisam dar o mesmo resultado.
      const caminho = (fotos) => {
        carregar(S0);
        for (let q = 0; q < 64; q++) { if (fotos && q % 4 === 0) carregar(salvar()); botoes(q); quadro(); }
        soltar();
        return hash(salvar());
      };
      const hs = [caminho(false), caminho(false), caminho(false), caminho(true)];
      res.deterministico = hs.every((h) => h === hs[0]) ? "sim" : "NÃO (" + hs.join(",") + ")";

      // um rollback típico: voltar 8 quadros e refazer até o presente (sem salvar)
      res.rollback8Ms = tempos(20, () => { carregar(S0); for (let q = 0; q < 8; q++) quadro(); });
      // o pior caso: rollback + uma foto nova no mesmo quadro
      res.rollback8FotoMs = tempos(20, () => { carregar(S0); for (let q = 0; q < 8; q++) quadro(); salvar(); });
    } catch (e) {
      res.erro = String(e && e.message || e);
    }
    try { soltar(); if (S0) carregar(S0); } catch (e) {}
    try { f.toggleFastForward(0); } catch (e) {}

    setTimeout(() => {
      res.quadroNormalMs = normais.length ? { mediana: r(med(normais)), maior: r(max(normais)) } : null;
      relatar(res);
      const ms = (x) => (x ? x.mediana + " ms (pior " + x.maior + ")" : "?");
      const cabe = res.rollback8FotoMs ? (res.rollback8FotoMs.mediana < 12 ? "cabe folgado" : res.rollback8FotoMs.mediana < 16 ? "cabe apertado" : "NÃO cabe") : "?";
      painel(
        "Teste de rollback (" + res.core + ")\n" +
        (res.erro ? "ERRO: " + res.erro + "\n" : "") +
        "estado do jogo: " + res.tamanhoEstadoKB + " KB\n" +
        "salvar: " + ms(res.salvarMs) + "\n" +
        "carregar: " + ms(res.carregarMs) + "\n" +
        "1 quadro extra: " + ms(res.quadroMs) + "\n" +
        "quadro normal: " + ms(res.quadroNormalMs) + "\n" +
        "voltar 8 quadros: " + ms(res.rollback8Ms) + "\n" +
        "voltar 8 + salvar: " + ms(res.rollback8FotoMs) + "\n" +
        "sempre o mesmo resultado: " + res.deterministico + "\n" +
        "num quadro de 16,7 ms: " + cabe + "\n\n(toque aqui para fechar)"
      );
      document.getElementById("teste-rollback").onclick = (ev) => ev.currentTarget.remove();
    }, 3000);
  }

  window.addEventListener("load", esperarModulo);
})();
