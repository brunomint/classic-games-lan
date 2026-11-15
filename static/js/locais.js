// "＋ Jogador": outra pessoa jogando no mesmo aparelho (2º, 3º, 4º controle).
// Ela entra com o próprio nome + PIN e passa a contar no histórico junto com quem está logado.
(function () {
  const botao = document.getElementById("abrir-local");
  const chips = document.getElementById("chips-locais");
  const dialogo = document.getElementById("dialogo-local");
  const form = document.getElementById("form-local");
  const erro = document.getElementById("erro-local");
  const titulo = document.getElementById("titulo-local");
  const texto = document.getElementById("texto-local");
  const campoNome = document.getElementById("campo-nome-local");
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

  function modoNormal() {
    confirmando = null;
    titulo.textContent = "Quem mais está jogando aqui?";
    texto.textContent = "Jogador 2 (ou 3, 4) neste aparelho, com outro controle. Entre com o nome e o PIN dele, ou crie um novo.";
    campoNome.hidden = false;
    form.nome.required = true;
    rotuloPin.textContent = "PIN";
    enviar.textContent = "Entrar";
  }

  function modoConfirmar(nome) {
    titulo.textContent = "Novo jogador";
    texto.textContent = `Ainda não existe ninguém chamado ${nome}. Digite o PIN de novo para criar.`;
    campoNome.hidden = true;
    form.nome.required = false;
    rotuloPin.textContent = "PIN (confirmação)";
    enviar.textContent = "Criar jogador";
    form.pin.value = "";
    form.pin.focus();
  }

  botao.addEventListener("click", () => {
    modoNormal();
    form.reset();
    erro.hidden = true;
    dialogo.showModal();
  });
  document.getElementById("cancelar-local").addEventListener("click", () => dialogo.close());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = { participacao_id: participacao() };
    if (confirmando) {
      Object.assign(dados, { nome: confirmando.nome, pin: confirmando.pin, pin2: form.pin.value });
    } else {
      Object.assign(dados, { nome: form.nome.value, pin: form.pin.value });
    }
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
      .catch(() => { erro.textContent = "Não consegui falar com o servidor."; erro.hidden = false; });
  });

  // o servidor manda a lista sempre que a sessão muda (ex.: entrou numa sala)
  document.addEventListener("cg:locais", (e) => mostrar(e.detail));
  // o botão só aparece quando a sessão de jogo já começou
  document.addEventListener("cg:sessao", () => { botao.hidden = chips.children.length >= 3; });
})();
