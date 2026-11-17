// Tela do jogo no iPad/celular: impede o zoom na área do jogo.
// O CSS (touch-action: none, em jogo.css) cobre a maioria dos casos; o Safari do iPad
// ainda faz o zoom de pinça pelos eventos "gesture", e o toque duplo rápido em alguns casos.
// Menus e diálogos ficam de fora (podem rolar normalmente).
(function () {
  const naAreaDoJogo = (alvo) => alvo instanceof Element && !alvo.closest("dialog") && !!alvo.closest(".palco, #game");

  ["gesturestart", "gesturechange", "gestureend"].forEach((tipo) =>
    document.addEventListener(tipo, (e) => { if (naAreaDoJogo(e.target)) e.preventDefault(); }, { passive: false }));

  // pinça com dois dedos
  document.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1 && naAreaDoJogo(e.target)) e.preventDefault();
  }, { passive: false });

  // toque duplo rápido (zoom do Safari): só o segundo "fim de toque" é cancelado, o botão
  // do jogo já recebeu o toque no começo
  let ultimoFim = 0;
  document.addEventListener("touchend", (e) => {
    const agora = Date.now();
    if (agora - ultimoFim < 350 && naAreaDoJogo(e.target)) e.preventDefault();
    ultimoFim = agora;
  }, { passive: false });
})();
