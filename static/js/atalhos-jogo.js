// Tela do jogo, sem barra fixa: o que acontece "por fora" do jogo vira aviso rápido.
//   - Select + R1 / Select + L1 (avisados por gamepad-menu.js): salvar e carregar sem abrir o menu
//   - controle conectado: aviso; controle desconectado: pausa e espera ele voltar
//   - alguém entrou ou saiu da sala: aviso
//   - o botão redondo do menu some quando ninguém mexe o mouse
(function () {
  const emu = () => window.EJS_emulator;
  const jogoRodando = () => { const e = emu(); return !!(e && e.started); };

  // ---------- salvar / carregar rápido ----------

  document.addEventListener("cg:salvar-rapido", () => CG.salvarRapido());
  document.addEventListener("cg:carregar-rapido", () => CG.carregarUltimo());

  // ---------- controle conectado / desconectado ----------

  const dialogoControle = document.getElementById("dialogo-controle");
  const nomeCurto = (g) => (g.id || "Controle").replace(/\s*\(.*$/, "").trim() || "Controle";

  window.addEventListener("gamepadconnected", (e) => {
    CG.aviso(`Controle ${e.gamepad.index + 1} conectado (${nomeCurto(e.gamepad)})`, "ok");
    // voltou o controle que tinha caído: fecha o aviso e o jogo continua
    if (dialogoControle.open) dialogoControle.close();
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    if (!jogoRodando()) return;
    const e2 = emu();
    // na sala de netplay pausar travaria os outros: só avisa
    if (e2.isNetplay) {
      CG.aviso(`Controle ${e.gamepad.index + 1} desconectado`, "erro");
      return;
    }
    if (document.querySelector("dialog[open]")) {
      CG.aviso(`Controle ${e.gamepad.index + 1} desconectado`, "erro");
      return;
    }
    dialogoControle.showModal();   // pausa.js pausa o jogo enquanto o diálogo está aberto
    document.getElementById("continuar-sem-controle").focus();
  });

  document.getElementById("continuar-sem-controle").addEventListener("click", () => dialogoControle.close());

  // ---------- quem entrou / saiu da sala ----------

  let naSala = {};
  setInterval(() => {
    const e = emu();
    const n = e && e.netplay;
    if (!e || !e.isNetplay || !n || !n.players) { naSala = {}; return; }
    const agora = {};
    for (const [id, p] of Object.entries(n.players)) agora[id] = (p && p.player_name) || "Alguém";
    const primeiraVez = !Object.keys(naSala).length;
    if (!primeiraVez) {
      for (const id of Object.keys(agora)) if (!(id in naSala) && id !== n.playerID) CG.aviso(`${agora[id]} entrou na sala`, "ok");
      for (const id of Object.keys(naSala)) if (!(id in agora)) CG.aviso(`${naSala[id]} saiu da sala`);
    }
    naSala = agora;
  }, 1000);

  // ---------- botão do menu: aparece quando o mouse mexe ----------

  let esconder = null;
  document.addEventListener("mousemove", () => {
    document.body.classList.add("mouse-ativo");
    clearTimeout(esconder);
    esconder = setTimeout(() => document.body.classList.remove("mouse-ativo"), 2500);
  }, { passive: true });

  // ---------- dica na primeira vez ----------

  document.addEventListener("cg:jogo-iniciado", () => {
    try {
      if (localStorage.getItem("cg-dica-menu")) return;
      localStorage.setItem("cg-dica-menu", "1");
    } catch (e) { /* sem localStorage: mostra sempre */ }
    setTimeout(() => CG.aviso("Menu do jogo: Select + Start no controle ou Esc no teclado"), 1500);
  }, { once: true });
})();
