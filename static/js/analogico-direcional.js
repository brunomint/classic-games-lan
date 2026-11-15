// Analógico esquerdo como direcional dentro do jogo.
// O emulador manda o analógico como analógico de verdade, mas os consoles sem analógico
// (SNES, Mega Drive...) e o controle do PS1 no modo digital (o Crash 1 nem tem suporte a
// analógico) ignoram isso: o analógico "não funcionava". Aqui ele também aperta o direcional.
// Fica de fora nos consoles em que o analógico é usado de verdade.
(function () {
  const COM_ANALOGICO = ["n64", "psp", "nds", "3ds", "ps2", "dos"];
  const LIMITE = 0.5;
  // posições do direcional nos controles do emulador: 4 cima, 5 baixo, 6 esquerda, 7 direita
  const POSICAO = { cima: 4, baixo: 5, esq: 6, dir: 7 };
  const estado = [{}, {}, {}, {}];   // o que o analógico está apertando, por jogador

  document.addEventListener("cg:jogo-iniciado", () => {
    const emu = window.EJS_emulator;
    const core = document.getElementById("game").dataset.core;
    if (!emu || !emu.gamepad || !emu.gamepad.listeners || COM_ANALOGICO.includes(core)) return;
    const original = emu.gamepad.listeners.axischanged;
    emu.gamepad.listeners.axischanged = function (e) {
      if (original) original(e);
      if (e.axis === "LEFT_STICK_X" || e.axis === "LEFT_STICK_Y") moverPeloAnalogico(emu, e.gamepadIndex);
    };
  }, { once: true });

  function moverPeloAnalogico(emu, indice) {
    const g = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find((x) => x && x.index === indice);
    if (!g || !emu.gamepadSelection || !emu.gameManager) return;
    const jogador = emu.gamepadSelection.indexOf(`${g.id}_${g.index}`);
    if (jogador < 0 || jogador > 3) return;
    if (typeof emu.isPopupOpen === "function" && emu.isPopupOpen()) return;

    const x = g.axes[0] || 0;
    const y = g.axes[1] || 0;
    const agora = { cima: y < -LIMITE, baixo: y > LIMITE, esq: x < -LIMITE, dir: x > LIMITE };
    const direcional = CG.lerDirecional(g);   // não solta o que o direcional de verdade segura
    const antes = estado[jogador];
    for (const k of Object.keys(POSICAO)) {
      if (Boolean(antes[k]) === agora[k]) continue;
      antes[k] = agora[k];
      if (!agora[k] && direcional[k]) continue;
      emu.gameManager.simulateInput(jogador, POSICAO[k], agora[k] ? 1 : 0);
    }
  }
})();
