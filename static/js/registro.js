// Registro das partidas: abre uma sessão quando o jogo começa, acompanha entrada/saída
// de salas do netplay, manda sinal de vida e permite registrar o resultado.
(function () {
  const gameId = Number(document.getElementById("game").dataset.gameId);
  const botaoResultado = document.getElementById("abrir-resultado");
  const PING_MS = 30000;

  const estado = {
    participacaoId: null,
    partidaId: null,
    sala: null,        // sala do netplay em que estamos (null = jogando sozinho)
    ocupado: false,
  };

  function base() {
    return { game_id: gameId };
  }

  function aplicar(r) {
    estado.participacaoId = r.participacao_id;
    estado.partidaId = r.partida_id;
    // jogadores do mesmo aparelho seguem para a nova partida (o servidor já moveu)
    if (r.locais) document.dispatchEvent(new CustomEvent("cg:locais", { detail: r.locais }));
    atualizarBotao();
    document.dispatchEvent(new CustomEvent("cg:sessao", { detail: { ...estado } }));
  }

  function iniciar() {
    CG.api("/api/sessao/iniciar", base()).then(aplicar).catch(() => {});
    setInterval(ping, PING_MS);
    setInterval(verificarSala, 2000);
  }

  function ping() {
    if (!estado.participacaoId) return;
    CG.api("/api/sessao/ping", { participacao_id: estado.participacaoId })
      .then((r) => { if (!r.ativa) reabrir(); })
      .catch(() => {});
  }

  // o servidor encerrou a participação (ex.: aparelho dormiu); abre outra.
  // Mandamos o id antigo: o servidor traz de volta os jogadores deste aparelho.
  function reabrir() {
    const netplay = window.EJS_emulator && window.EJS_emulator.netplay;
    trocarSala(estado.sala, !!(netplay && netplay.owner));
  }

  // voltou para a página (tela acendeu, voltou do outro app): confere a sessão na hora
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") ping();
  });

  function trocarSala(sala, anfitriao) {
    if (estado.ocupado) return;
    estado.ocupado = true;
    CG.api("/api/sessao/sala", {
      ...base(),
      participacao_id: estado.participacaoId,
      sala,
      anfitriao,
    })
      .then((r) => { aplicar(r); estado.sala = sala; })
      .catch(() => {})
      .finally(() => { estado.ocupado = false; atualizarBotao(); });
  }

  // O EmulatorJS não avisa quando entramos/saímos de uma sala, então olhamos o estado dele.
  function verificarSala() {
    const emu = window.EJS_emulator;
    const netplay = emu && emu.netplay;
    if (!netplay) return;
    const salaAtual = emu.isNetplay && netplay.extra ? netplay.extra.sessionid : null;
    if (salaAtual !== estado.sala) trocarSala(salaAtual, !!netplay.owner);
  }

  function atualizarBotao() {
    // resultado faz sentido em partida de grupo; no solo também dá para anotar recorde
    botaoResultado.hidden = !estado.partidaId;
  }

  // encerra ao sair da página (sendBeacon funciona mesmo com a aba fechando)
  window.addEventListener("pagehide", () => {
    if (!estado.participacaoId) return;
    const corpo = JSON.stringify({ participacao_id: estado.participacaoId });
    navigator.sendBeacon("/api/sessao/fim", new Blob([corpo], { type: "application/json" }));
  });

  // ---------- resultado (diálogo em resultado.js) ----------

  botaoResultado.addEventListener("click", () => {
    if (!estado.partidaId) return;
    CG.abrirResultado(estado.partidaId, () => {
      CG.aviso("Resultado salvo no placar ✓", "ok");
    });
  });

  CG.registro = { iniciar, estado };
  document.addEventListener("cg:jogo-iniciado", iniciar, { once: true });
})();
