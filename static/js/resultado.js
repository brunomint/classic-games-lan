// Diálogo "Resultado da partida" (vencedor, empate, placar). Usado no jogo e no histórico.
window.CG = window.CG || {};

(function () {
  const dialogo = document.getElementById("dialogo-resultado");
  if (!dialogo) return;
  const form = document.getElementById("form-resultado");
  const opcoes = document.getElementById("opcoes-vencedor");
  const erro = document.getElementById("erro-resultado");
  let partidaAtual = null;
  let aoSalvar = null;

  function opcao(valor, texto, marcado) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "vencedor";
    input.value = valor;
    input.checked = marcado;
    const span = document.createElement("span");
    span.textContent = texto;
    label.append(input, span);
    return label;
  }

  CG.abrirResultado = function (partidaId, callback) {
    partidaAtual = partidaId;
    aoSalvar = callback;
    fetch(`/api/partidas/${partidaId}`)
      .then((r) => r.json())
      .then((p) => {
        const legenda = document.createElement("legend");
        legenda.textContent = p.jogadores.length > 1 ? "Quem ganhou?" : "Resultado";
        const itens = p.jogadores.map((j) => opcao(j.id, j.nome, p.vencedor_id === j.id));
        if (p.jogadores.length > 1) itens.push(opcao("empate", "Empate", !!p.empate));
        itens.push(opcao("", "Sem vencedor", !p.vencedor_id && !p.empate));
        opcoes.replaceChildren(legenda, ...itens);
        form.placar.value = p.placar || "";
        erro.hidden = true;
        dialogo.showModal();
      })
      .catch(() => {});
  };

  document.getElementById("cancelar-resultado").addEventListener("click", () => dialogo.close());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const escolha = (form.querySelector("input[name=vencedor]:checked") || {}).value || "";
    CG.api(`/api/partidas/${partidaAtual}/resultado`, {
      placar: form.placar.value,
      vencedor_id: escolha && escolha !== "empate" ? escolha : null,
      empate: escolha === "empate",
    })
      .then(() => {
        dialogo.close();
        if (aoSalvar) aoSalvar();
      })
      .catch(() => { erro.textContent = "Não consegui salvar. Tente de novo."; erro.hidden = false; });
  });
})();
