// "＋ Jogador": outra pessoa jogando no mesmo aparelho (2º, 3º, 4º controle).
// Ela escolhe o perfil (ou escreve o nome) e digita o PIN no teclado da tela;
// passa a contar no histórico junto com quem está logado.
(function () {
  const botao = document.getElementById("abrir-local");
  const chips = document.getElementById("chips-locais");
  const dialogo = document.getElementById("dialogo-local");
  const form = document.getElementById("form-local");
  const erro = document.getElementById("erro-local");
  const titulo = document.getElementById("titulo-local");
  const texto = document.getElementById("texto-local");
  const perfis = document.getElementById("perfis-local");
  const campoNome = document.getElementById("campo-nome-local");
  const campoPin = document.getElementById("campo-pin-local");
  const teclado = document.getElementById("teclado-local");
  const rotuloPin = document.getElementById("rotulo-pin-local");
  const enviar = document.getElementById("enviar-local");
  let confirmando = null;   // {nome, pin} quando o nome é novo e falta repetir o PIN

  const participacao = () => CG.registro.estado.participacaoId;

  function mostrar(locais) {
    chips.replaceChildren(...locais.map((l) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = l.nome;
      const tirar = document.createElement("button");
      tirar.type = "button";
      tirar.title = `Tirar ${l.nome} desta partida`;
      tirar.textContent = "✕";
      tirar.addEventListener("click", () => remover(l.participacao_id));
      chip.append(tirar);
      return chip;
    }));
    botao.hidden = locais.length >= 3;
  }

  function remover(localId) {
    CG.api("/api/sessao/jogador/remover", { participacao_id: participacao(), local_id: localId })
      .then((r) => mostrar(r.locais))
      .catch(() => {});
  }

  function pedirPin(rotulo) {
    campoPin.hidden = false;
    teclado.hidden = false;
    rotuloPin.textContent = rotulo;
    form.pin.value = "";
    teclado.querySelector("[data-tecla='1']").focus();
  }

  function modoNormal() {
    confirmando = null;
    titulo.textContent = "Quem mais está jogando aqui?";
    texto.textContent = perfis
      ? "Escolha quem vai jogar com o outro controle e digite o PIN."
      : "Escreva o nome de quem vai jogar com o outro controle e o PIN dele (ou crie um).";
    form.reset();
    enviar.textContent = "Entrar";
    if (perfis) {
      perfis.hidden = false;
      perfis.querySelectorAll(".perfil-btn").forEach((b) => b.removeAttribute("aria-pressed"));
      campoNome.hidden = true;
      campoPin.hidden = true;
      teclado.hidden = true;
    } else {
      campoNome.hidden = false;
      campoPin.hidden = false;
      teclado.hidden = false;
      rotuloPin.textContent = "PIN";
    }
  }

  function modoConfirmar(nome) {
    titulo.textContent = "Novo jogador";
    texto.textContent = `Ainda não existe ninguém chamado ${nome}. Digite o PIN de novo para criar.`;
    if (perfis) perfis.hidden = true;
    campoNome.hidden = true;
    enviar.textContent = "Criar jogador";
    pedirPin("PIN (confirmação)");
  }

  if (perfis) {
    perfis.addEventListener("click", (e) => {
      const btn = e.target.closest(".perfil-btn");
      if (!btn) return;
      perfis.querySelectorAll(".perfil-btn").forEach((b) => b.removeAttribute("aria-pressed"));
      btn.setAttribute("aria-pressed", "true");
      form.nome.value = btn.dataset.nome;
      if (btn.dataset.nome) {
        campoNome.hidden = true;
        pedirPin(`PIN de ${btn.dataset.nome}`);
      } else {
        campoNome.hidden = false;
        pedirPin("PIN (4 a 8 números)");
        form.nome.focus();
      }
    });
  }

  function abrir() {
    modoNormal();
    erro.hidden = true;
    dialogo.showModal();
    const primeiro = perfis ? perfis.querySelector(".perfil-btn") : form.nome;
    if (primeiro) primeiro.focus();
  }

  botao.addEventListener("click", abrir);
  document.getElementById("cancelar-local").addEventListener("click", () => dialogo.close());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = { participacao_id: participacao() };
    if (confirmando) {
      Object.assign(dados, { nome: confirmando.nome, pin: confirmando.pin, pin2: form.pin.value });
    } else {
      Object.assign(dados, { nome: form.nome.value, pin: form.pin.value });
    }
    if (!dados.nome) { erro.textContent = "Escolha quem vai jogar."; erro.hidden = false; return; }
    erro.hidden = true;
    fetch("/api/sessao/jogador", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    })
      .then((r) => r.json())
      .then((r) => {
        if (r.erro) {
          erro.textContent = r.erro;
          erro.hidden = false;
          if (confirmando) modoNormal();
          else form.pin.value = "";
          return;
        }
        if (r.novo) {
          confirmando = { nome: r.nome, pin: dados.pin };
          modoConfirmar(r.nome);
          return;
        }
        mostrar(r.locais);
        dialogo.close();
      })
      .catch(() => { erro.textContent = "Sem resposta do servidor. Tente de novo."; erro.hidden = false; });
  });

  // o servidor manda a lista sempre que a sessão muda (ex.: entrou numa sala)
  document.addEventListener("cg:locais", (e) => mostrar(e.detail));
  // o botão só aparece quando a sessão de jogo já começou
  document.addEventListener("cg:sessao", () => { botao.hidden = chips.children.length >= 3; });
  CG.abrirJogadorLocal = abrir;
})();
