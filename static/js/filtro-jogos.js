// Menu inicial: abas de console (Todos, Recentes, SNES, PS1...) e pesquisa por nome.
//   L1 / R1 no controle, [ e ] no teclado → aba anterior / próxima
//   começar a digitar (ou /) na home      → abre a pesquisa com a letra digitada
// A pesquisa ignora acento e maiúsculas e vale para todos os consoles; a aba escolhida
// fica lembrada no aparelho, a pesquisa não.
(function () {
  const fileira = document.getElementById("fileira");
  if (!fileira) return;

  const tiles = Array.from(fileira.querySelectorAll(".tile"));
  const abas = Array.from(document.querySelectorAll("[data-aba]"));
  const legenda = document.querySelector(".legenda");
  const semResultado = document.getElementById("sem-resultado");
  const semResultadoTexto = document.getElementById("sem-resultado-texto");
  const limparSemResultado = document.getElementById("limpar-sem-resultado");
  const botaoPesquisa = document.getElementById("abrir-pesquisa");
  const rotuloPesquisa = document.getElementById("rotulo-pesquisa");
  const limparPesquisa = document.getElementById("limpar-pesquisa");
  const dialogo = document.getElementById("dialogo-pesquisa");
  const campo = document.getElementById("campo-pesquisa");
  const contagem = document.getElementById("contagem-pesquisa");
  const resultados = document.getElementById("resultados");
  const CHAVE_ABA = "cg-aba-home";

  // "Pokémon: Edição Azul" → "pokemon edicao azul"
  const normalizar = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  tiles.forEach((t) => { t.dataset.busca = normalizar(t.dataset.titulo); });

  let aba = "todos";
  let termo = "";
  try {
    const salva = localStorage.getItem(CHAVE_ABA);
    if (salva && abas.some((b) => b.dataset.aba === salva)) aba = salva;
  } catch (e) { /* sem localStorage: começa em Todos */ }

  const naAba = (t, a) => a === "todos" || (a === "recentes" ? "recente" in t.dataset : t.dataset.console === a);
  const comTermo = (t) => normalizar(termo).split(" ").every((p) => t.dataset.busca.includes(p));
  const rotuloDaAba = (a) => {
    const b = abas.find((x) => x.dataset.aba === a);
    return b ? b.firstChild.textContent.trim() : "";
  };

  function aplicar(focarPrimeiro) {
    let visiveis = 0;
    tiles.forEach((t) => {
      const mostra = naAba(t, aba) && comTermo(t);
      t.hidden = !mostra;
      if (mostra) visiveis += 1;
    });
    abas.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.aba === aba)));
    const ativa = abas.find((b) => b.dataset.aba === aba);
    if (ativa) ativa.scrollIntoView({ block: "nearest", inline: "nearest" });

    rotuloPesquisa.textContent = termo ? `“${termo}”` : "Pesquisar";
    botaoPesquisa.classList.toggle("com-termo", Boolean(termo));
    limparPesquisa.hidden = !termo;

    const vazio = visiveis === 0;
    fileira.hidden = vazio;
    legenda.hidden = vazio;
    semResultado.hidden = !vazio;
    if (vazio) {
      const onde = aba === "todos" ? "" : ` em ${rotuloDaAba(aba)}`;
      semResultadoTexto.textContent = termo ? `Nenhum jogo com “${termo}”${onde}.` : `Nenhum jogo${onde}.`;
      limparSemResultado.textContent = termo ? "Limpar pesquisa" : "Ver todos os jogos";
    }
    fileira.scrollLeft = 0;
    document.dispatchEvent(new CustomEvent("cg:fileira-mudou", { detail: { focarPrimeiro } }));
    mostrarResultados();
  }

  function definirAba(nova, focarPrimeiro) {
    aba = nova;
    try { localStorage.setItem(CHAVE_ABA, aba); } catch (e) { /* ignora */ }
    aplicar(focarPrimeiro);
  }

  function trocarAba(passo) {
    const i = abas.findIndex((b) => b.dataset.aba === aba);
    const prox = abas[(i + passo + abas.length) % abas.length];
    if (prox) definirAba(prox.dataset.aba, true);
  }

  function definirTermo(novo) {
    termo = novo.replace(/\s+/g, " ").replace(/^ /, "");
    if (campo.value !== termo) campo.value = termo;
    // achou em outro console e nada nesta aba: mostra em Todos
    if (termo && aba !== "todos" && !tiles.some((t) => naAba(t, aba) && comTermo(t)) && tiles.some(comTermo)) {
      aba = "todos";
    }
    aplicar(false);
  }

  // ---------- abas ----------
  abas.forEach((b) => b.addEventListener("click", () => definirAba(b.dataset.aba, false)));
  document.addEventListener("cg:aba", (e) => trocarAba(e.detail.passo));

  limparPesquisa.addEventListener("click", () => { definirTermo(""); botaoPesquisa.focus(); });
  limparSemResultado.addEventListener("click", () => {
    if (termo) definirTermo(""); else definirAba("todos", false);
    const primeiro = tiles.find((t) => !t.hidden);
    if (primeiro) primeiro.focus();
  });

  // ---------- diálogo de pesquisa ----------
  function mostrarResultados() {
    if (!dialogo.open) return;
    const achados = tiles.filter((t) => !t.hidden);
    if (!termo) contagem.textContent = "Digite parte do nome.";
    else if (!achados.length) contagem.textContent = "Nenhum jogo encontrado.";
    else contagem.textContent = achados.length === 1 ? "1 jogo" : `${achados.length} jogos`;
    resultados.replaceChildren(...(termo ? achados.slice(0, 8) : []).map((t) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "resultado";
      a.href = t.href;
      const capa = t.firstElementChild.cloneNode(true);
      const texto = document.createElement("span");
      const nome = document.createElement("strong");
      nome.textContent = t.dataset.titulo;
      const cons = document.createElement("small");
      cons.textContent = t.getAttribute("aria-label").split(", ").pop();
      texto.append(nome, cons);
      a.append(capa, texto);
      li.append(a);
      return li;
    }));
  }

  function abrir(letra) {
    if (dialogo.open) return;
    dialogo.showModal();
    if (letra) definirTermo(termo + letra); else mostrarResultados();
    const toque = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (letra || toque || !document.body.classList.contains("usando-controle")) campo.focus();
    else dialogo.querySelector(".tecla-letra").focus();
  }

  botaoPesquisa.addEventListener("click", () => abrir(""));
  document.getElementById("fechar-pesquisa").addEventListener("click", () => dialogo.close());
  dialogo.addEventListener("close", () => {
    const primeiro = tiles.find((t) => !t.hidden);
    (termo && primeiro ? primeiro : botaoPesquisa).focus();
  });

  campo.addEventListener("input", () => definirTermo(campo.value));
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); dialogo.close(); }
  });

  // teclado na tela
  dialogo.querySelectorAll("[data-letra]").forEach((tecla) => {
    tecla.addEventListener("click", () => {
      const l = tecla.dataset.letra;
      if (l === "apagar") definirTermo(termo.slice(0, -1));
      else if (l === "limpar") definirTermo("");
      else if (termo.length < 40) definirTermo(termo + l.toLowerCase());
    });
  });

  // ---------- teclado físico ----------
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const emCampo = ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName);
    if (dialogo.open) {
      // foco numa tecla da tela: as letras do teclado de verdade também escrevem
      if (emCampo) return;
      if (/^[\p{L}\p{N} ]$/u.test(e.key) && e.key !== " ") { definirTermo(termo + e.key.toLowerCase()); e.preventDefault(); }
      else if (e.key === "Backspace") { definirTermo(termo.slice(0, -1)); e.preventDefault(); }
      return;
    }
    if (emCampo || document.querySelector("dialog[open]")) return;
    if (e.key === "[" || e.key === "]") { e.preventDefault(); trocarAba(e.key === "[" ? -1 : 1); return; }
    if (e.key === "/") { e.preventDefault(); abrir(""); return; }
    if (/^[\p{L}\p{N}]$/u.test(e.key)) { e.preventDefault(); abrir(e.key.toLowerCase()); }
  });

  aplicar(false);
})();
