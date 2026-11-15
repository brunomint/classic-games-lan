// Avisos rápidos no canto da tela do jogo ("Salvo", "Fulano entrou na sala"...).
// Aparecem por alguns segundos e somem sozinhos; não tiram o foco do jogo.
window.CG = window.CG || {};

(function () {
  const caixa = document.getElementById("avisos");
  const DURACAO = 3500;

  /** tipo: "ok" (verde), "erro" (vermelho) ou nada (neutro) */
  CG.aviso = function (texto, tipo) {
    if (!caixa) return;
    const item = document.createElement("p");
    item.className = "aviso" + (tipo ? ` aviso-${tipo}` : "");
    item.textContent = texto;
    caixa.append(item);
    while (caixa.children.length > 3) caixa.firstElementChild.remove();
    setTimeout(() => {
      item.classList.add("saindo");
      setTimeout(() => item.remove(), 300);
    }, DURACAO);
  };
})();
