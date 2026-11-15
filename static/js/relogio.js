// Relógio do topo (menu inicial e páginas internas): todo <time data-relogio>.
(function () {
  const relogios = document.querySelectorAll("[data-relogio]");
  if (!relogios.length) return;
  function tic() {
    const agora = new Date();
    const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    relogios.forEach((r) => { r.textContent = hora; r.dateTime = agora.toISOString(); });
  }
  tic();
  setInterval(tic, 10000);
})();
