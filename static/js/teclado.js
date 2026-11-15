// Teclado numérico na tela (templates/_teclado.html): cada tecla escreve no campo
// indicado em data-alvo. Funciona com toque, mouse e controle.
document.addEventListener("click", (e) => {
  const tecla = e.target.closest(".teclado [data-tecla]");
  if (!tecla) return;
  const campo = document.querySelector(tecla.closest(".teclado").dataset.alvo);
  if (!campo) return;
  const max = Number(campo.maxLength) > 0 ? Number(campo.maxLength) : 8;
  if (tecla.dataset.tecla === "apagar") campo.value = campo.value.slice(0, -1);
  else if (campo.value.length < max) campo.value += tecla.dataset.tecla;
});

// com o foco numa tecla, números e Backspace do teclado físico também valem
document.addEventListener("keydown", (e) => {
  const teclado = e.target.closest && e.target.closest(".teclado");
  if (!teclado) return;
  const campo = document.querySelector(teclado.dataset.alvo);
  if (!campo) return;
  if (/^\d$/.test(e.key) && campo.value.length < 8) { campo.value += e.key; e.preventDefault(); }
  if (e.key === "Backspace") { campo.value = campo.value.slice(0, -1); e.preventDefault(); }
});
