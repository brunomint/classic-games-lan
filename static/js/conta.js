// Ajustes → Meu jogador e Outros jogadores (rotas em conta.py).
// O PIN é pedido num diálogo de um campo só, com o teclado numérico da tela, um passo
// por vez (PIN atual → novo → repetir), para funcionar com toque, teclado e controle.
(function () {
  const $ = (id) => document.getElementById(id);
  const dialogo = $("dialogo-pin");
  const campo = $("pin-passo");
  const erro = $("erro-pin-passo");
  let fluxo = null;   // { passos: [{titulo, texto, rotulo}], valores: [], fim(valores) → Promise<string|null> }

  function mostrarPasso() {
    const passo = fluxo.passos[fluxo.valores.length];
    $("pin-titulo").textContent = passo.titulo;
    $("pin-texto").textContent = passo.texto || "";
    $("pin-texto").hidden = !passo.texto;
    $("pin-rotulo").textContent = passo.rotulo;
    $("continuar-pin").textContent = passo.botao || "Continuar";
    campo.value = "";
    if (!dialogo.open) dialogo.showModal();
    // com controle o foco vai para o teclado da tela; senão, direto no campo
    const usandoControle = document.body.classList.contains("usando-controle");
    (usandoControle ? dialogo.querySelector(".tecla") : campo).focus();
  }

  function iniciar(passos, fim) {
    fluxo = { passos, valores: [], fim };
    erro.hidden = true;
    mostrarPasso();
  }

  function falhar(msg) {
    erro.textContent = msg;
    erro.hidden = false;
  }

  $("form-pin-passo").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!fluxo) return;
    const pin = campo.value.trim();
    if (!/^\d{4,8}$/.test(pin)) { falhar("O PIN tem de 4 a 8 números."); return; }
    erro.hidden = true;
    fluxo.valores.push(pin);
    if (fluxo.valores.length < fluxo.passos.length) { mostrarPasso(); return; }
    const atual = fluxo;
    atual.fim(atual.valores).then((msg) => {
      if (!msg) return;
      // deu errado: recomeça do primeiro passo mostrando o motivo
      atual.valores = [];
      mostrarPasso();
      falhar(msg);
    });
  });

  $("cancelar-pin").addEventListener("click", () => dialogo.close());
  dialogo.addEventListener("close", () => { fluxo = null; campo.value = ""; });

  function enviar(url, corpo) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo || {}),
    }).then((r) => r.json().catch(() => ({})).then((j) => (r.ok ? j : Promise.reject(j))));
  }
  const motivo = (j) => (j && j.erro) || "Sem resposta do servidor. Tente de novo.";

  // ---------- trocar PIN ----------
  $("trocar-pin").addEventListener("click", () => {
    iniciar([
      { titulo: "Trocar PIN", rotulo: "Seu PIN atual" },
      { titulo: "Trocar PIN", rotulo: "PIN novo (4 a 8 números)" },
      { titulo: "Trocar PIN", rotulo: "Repita o PIN novo", botao: "Trocar PIN" },
    ], ([atual, novo, repetido]) => {
      if (novo !== repetido) return Promise.resolve("Os PINs novos não batem. Comece de novo.");
      return enviar("/api/conta/pin", { atual, novo })
        .then(() => { dialogo.close(); CG.aviso("PIN trocado ✓", "ok"); $("trocar-pin").focus(); return null; })
        .catch(motivo);
    });
  });

  // ---------- excluir o próprio jogador ----------
  $("excluir-conta").addEventListener("click", () => {
    const nome = document.body.dataset.jogadorNome;
    iniciar([{
      titulo: `Excluir ${nome}?`,
      texto: "Você sai e seu nome some da lista. No Placar da casa suas partidas ficam como "
        + "“Jogador excluído”. Se criar de novo o jogador com o mesmo nome, volta tudo: "
        + "partidas, saves e favoritos.",
      rotulo: "Digite seu PIN para confirmar",
      botao: "Excluir",
    }], ([pin]) => enviar("/api/conta/excluir", { pin })
      .then(() => { location.href = "/entrar"; return null; })
      .catch(motivo));
  });

  // ---------- liberar o PIN de outro jogador ----------
  const dialogoLiberar = $("dialogo-liberar");
  const erroLiberar = $("erro-liberar");
  let alvo = null;
  document.querySelectorAll("[data-liberar]").forEach((botao) => {
    botao.addEventListener("click", () => {
      alvo = botao;
      $("liberar-nome").textContent = botao.dataset.nome;
      erroLiberar.hidden = true;
      dialogoLiberar.showModal();
      $("cancelar-liberar").focus();   // o padrão seguro é não mexer
    });
  });
  $("cancelar-liberar").addEventListener("click", () => dialogoLiberar.close());
  $("confirmar-liberar").addEventListener("click", () => {
    if (!alvo) return;
    enviar(`/api/jogadores/${encodeURIComponent(alvo.dataset.liberar)}/liberar-pin`)
      .then(() => {
        const marca = document.createElement("span");
        marca.className = "pin-liberado";
        marca.textContent = "PIN liberado";
        alvo.replaceWith(marca);
        dialogoLiberar.close();
        CG.aviso(`PIN de ${alvo.dataset.nome} liberado.`, "ok");
        alvo = null;
      })
      .catch((j) => { erroLiberar.textContent = motivo(j); erroLiberar.hidden = false; });
  });
})();
