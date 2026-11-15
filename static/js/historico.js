// Histórico: anotar/editar o resultado de qualquer partida.
document.querySelectorAll("[data-partida]").forEach((botao) => {
  botao.addEventListener("click", () => {
    CG.abrirResultado(botao.dataset.partida, () => location.reload());
  });
});
