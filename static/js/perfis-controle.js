// Perfis de controle: faz controles com numeração própria (fora do padrão do navegador)
// funcionarem no menu e no emulador.
//
// O navegador numera os botões do controle "padrão" assim:
//   0 baixo, 1 direita, 2 esquerda, 3 cima, 4 L1, 5 R1, 6 L2, 7 R2,
//   8 select, 9 start, 10 L3, 11 R3, 12–15 direcional (cima, baixo, esq, dir)
// Cada perfil diz qual botão/eixo do aparelho corresponde a cada uma dessas posições.
window.CG = window.CG || {};

(function () {
  const PERFIS = [
    {
      // adaptador para 2 controles estilo PS2 (testado em 15/11/2026)
      nome: "Twin USB Joystick (ShanWan)",
      teste: (id) => /20bc/i.test(id) && /5500/i.test(id),
      botoes: { 0: 0, 1: 1, 2: 3, 3: 4, 4: 6, 5: 7, 6: 8, 7: 9, 8: 10, 9: 11, 10: 13, 11: 14 },
      dpad: { x: 6, y: 7 },   // o direcional vem como eixos, não como botões
    },
  ];

  const IDENTIDADE = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, i]));

  // controle desconhecido fora do padrão: botões na ordem e direcional nos dois últimos eixos
  function generico(g) {
    return {
      nome: "Genérico",
      botoes: IDENTIDADE,
      dpad: g.axes.length >= 6 ? { x: g.axes.length - 2, y: g.axes.length - 1 } : null,
    };
  }

  /** Perfil do controle; null quando ele já segue o padrão do navegador. */
  CG.perfilDoControle = function (g) {
    if (!g || g.mapping === "standard") return null;
    return PERFIS.find((p) => p.teste(g.id)) || generico(g);
  };

  /** Lê o controle já traduzido para as posições do padrão. */
  CG.lerControle = function (g) {
    const p = CG.perfilDoControle(g);
    const bt = (pos) => {
      const i = p ? p.botoes[pos] : pos;
      return i !== undefined && !!(g.buttons[i] && g.buttons[i].pressed);
    };
    const eixo = (i) => g.axes[i] || 0;
    let cima, baixo, esq, dir;
    if (!p) {
      cima = bt(12); baixo = bt(13); esq = bt(14); dir = bt(15);
    } else if (p.dpad) {
      cima = eixo(p.dpad.y) < -0.5; baixo = eixo(p.dpad.y) > 0.5;
      esq = eixo(p.dpad.x) < -0.5; dir = eixo(p.dpad.x) > 0.5;
    } else {
      cima = baixo = esq = dir = false;
    }
    // o analógico esquerdo também move
    cima = cima || eixo(1) < -0.5; baixo = baixo || eixo(1) > 0.5;
    esq = esq || eixo(0) < -0.5; dir = dir || eixo(0) > 0.5;
    return { cima, baixo, esq, dir, a: bt(0), b: bt(1), x: bt(2), y: bt(3), select: bt(8), start: bt(9) };
  };

  // nomes que o EmulatorJS usa para as posições do padrão
  const NOME_PARA_POSICAO = {
    BUTTON_1: 0, BUTTON_2: 1, BUTTON_3: 2, BUTTON_4: 3,
    LEFT_TOP_SHOULDER: 4, RIGHT_TOP_SHOULDER: 5, LEFT_BOTTOM_SHOULDER: 6, RIGHT_BOTTOM_SHOULDER: 7,
    SELECT: 8, START: 9, LEFT_STICK: 10, RIGHT_STICK: 11,
    DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15,
  };

  /**
   * Ajusta os controles de um jogador do emulador para o aparelho dele.
   * Troca os nomes padrão (ex.: "DPAD_UP") pelo botão/eixo real (ex.: "EXTRA_STICK_7:-1").
   * Devolve true se mudou algo.
   */
  CG.ajustarControlesEmulador = function (controlesJogador, g) {
    const p = CG.perfilDoControle(g);
    if (!p || !controlesJogador) return false;
    let mudou = false;
    for (const k of Object.keys(controlesJogador)) {
      const c = controlesJogador[k];
      if (!c || typeof c.value2 !== "string" || !(c.value2 in NOME_PARA_POSICAO)) continue;
      const pos = NOME_PARA_POSICAO[c.value2];
      if (pos >= 12) {
        if (!p.dpad) continue;
        const eixo = pos <= 13 ? p.dpad.y : p.dpad.x;
        const sinal = pos === 12 || pos === 14 ? -1 : 1;
        c.value2 = `${eixo >= 4 ? "EXTRA_STICK_" + eixo : ["LEFT_STICK_X", "LEFT_STICK_Y", "RIGHT_STICK_X", "RIGHT_STICK_Y"][eixo]}:${sinal}`;
      } else if (p.botoes[pos] !== undefined) {
        c.value2 = p.botoes[pos];
      } else {
        continue;
      }
      mudou = true;
    }
    return mudou;
  };
})();
