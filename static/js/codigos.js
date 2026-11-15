// Códigos de trapaça no menu de pausa: lista do servidor (codigos.py), liga/desliga com o A
// e adiciona novos (digitar pede teclado ou celular). Os ligados ficam lembrados no aparelho
// e voltam a valer quando o jogo abre de novo.
(function () {
  const $ = (id) => document.getElementById(id);
  const dialogo = $("dialogo-codigos");
  const lista = $("lista-codigos");
  const semCodigos = $("sem-codigos");
  const totalPilula = $("total-codigos");
  const form = $("form-codigo");
  const erro = $("erro-codigo");
  const gameId = document.getElementById("game").dataset.gameId;
  const CHAVE = `cg-codigos:${gameId}`;
  const emu = () => window.EJS_emulator;

  let codigos = [];
  let ligados = new Set();
  try { ligados = new Set(JSON.parse(localStorage.getItem(CHAVE) || "[]")); } catch (e) { /* nenhum */ }

  function guardar() {
    try { localStorage.setItem(CHAVE, JSON.stringify([...ligados])); } catch (e) { /* vale só agora */ }
  }

  // o emulador recebe sempre a lista inteira dos ligados (desligar um exige refazer todos)
  function aplicar() {
    const e = emu();
    if (!e || !e.started || !e.gameManager) return;
    e.gameManager.resetCheat();
    codigos.filter((c) => ligados.has(c.id)).forEach((c, i) => e.gameManager.setCheat(i, 1, c.codigo));
  }

  function marcarTotal() {
    const n = codigos.filter((c) => ligados.has(c.id)).length;
    totalPilula.textContent = n ? `(${n} ligado${n > 1 ? "s" : ""})` : "";
  }

  function carregar() {
    return fetch(`/api/codigos/${gameId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((lst) => {
        codigos = lst;
        // esquece os que alguém apagou
        ligados = new Set([...ligados].filter((id) => codigos.some((c) => c.id === id)));
        guardar();
        marcarTotal();
        desenhar();
      });
  }

  function desenhar() {
    semCodigos.hidden = codigos.length > 0;
    lista.replaceChildren(...codigos.map((c) => {
      const li = document.createElement("li");
      const alternar = document.createElement("button");
      alternar.type = "button";
      alternar.className = "codigo";
      alternar.setAttribute("aria-pressed", String(ligados.has(c.id)));
      const nome = document.createElement("strong");
      nome.textContent = c.nome;
      const texto = document.createElement("small");
      texto.textContent = c.codigo.replace(/\+/g, " + ");
      alternar.append(nome, texto);
      alternar.addEventListener("click", () => {
        if (emu() && emu().isNetplay) { CG.aviso("Não dá para usar códigos jogando junto.", "erro"); return; }
        if (ligados.has(c.id)) ligados.delete(c.id); else ligados.add(c.id);
        guardar();
        aplicar();
        alternar.setAttribute("aria-pressed", String(ligados.has(c.id)));
        marcarTotal();
      });

      // apagar pede um segundo aperto (o código é da casa toda)
      const apagar = document.createElement("button");
      apagar.type = "button";
      apagar.className = "apagar-codigo";
      apagar.textContent = "Apagar";
      let confirmando = null;
      apagar.addEventListener("click", () => {
        if (!confirmando) {
          apagar.textContent = "Confirmar?";
          confirmando = setTimeout(() => { apagar.textContent = "Apagar"; confirmando = null; }, 3000);
          return;
        }
        clearTimeout(confirmando);
        fetch(`/api/codigos/${gameId}/${c.id}`, { method: "DELETE" })
          .then((r) => (r.ok ? carregar() : Promise.reject(r)))
          .then(() => { aplicar(); CG.aviso("Código apagado.", "ok"); dialogo.querySelector(".codigo, summary").focus(); })
          .catch(() => CG.aviso("Não deu para apagar o código.", "erro"));
      });
      li.append(alternar, apagar);
      return li;
    }));
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    fetch(`/api/codigos/${gameId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: $("codigo-nome").value, codigo: $("codigo-texto").value }),
    })
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(j))))
      .then((novo) => {
        form.reset();
        $("novo-codigo").open = false;
        ligados.add(novo.id);   // quem acabou de adicionar quer usar
        guardar();
        return carregar().then(() => { aplicar(); CG.aviso(`“${novo.nome}” ligado ✓`, "ok"); });
      })
      .catch((j) => { erro.textContent = (j && j.erro) || "Não deu para salvar o código."; erro.hidden = false; });
  });

  $("opcao-codigos").addEventListener("click", () => {
    $("dialogo-pausa").close();
    setTimeout(() => {
      dialogo.showModal();
      carregar().catch(() => {});
      const primeiro = dialogo.querySelector(".codigo") || dialogo.querySelector("summary");
      if (primeiro) primeiro.focus();
    }, 10);
  });
  $("fechar-codigos").addEventListener("click", () => {
    dialogo.close();
    setTimeout(() => document.dispatchEvent(new CustomEvent("cg:menu-pausa")), 80);
  });

  // os códigos ligados da última vez voltam quando o jogo começa
  document.addEventListener("cg:jogo-iniciado", () => {
    setTimeout(() => carregar().then(() => { if (ligados.size) aplicar(); }).catch(() => {}), 1500);
  }, { once: true });
})();
