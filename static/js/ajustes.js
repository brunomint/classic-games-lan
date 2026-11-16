// Ajustes: excluir jogos (com confirmação) e mudar a porta do servidor.
(function () {
  // ---------- excluir jogo ----------
  const dialogo = document.getElementById("dialogo-excluir");
  const nome = document.getElementById("excluir-nome");
  const erroExcluir = document.getElementById("erro-excluir");
  const confirmar = document.getElementById("confirmar-excluir");
  let alvo = null;   // { url, item }

  document.querySelectorAll("[data-excluir]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".jogo-item");
      alvo = { url: btn.dataset.excluir, item };
      nome.textContent = item.dataset.titulo;
      erroExcluir.hidden = true;
      dialogo.showModal();
      document.getElementById("cancelar-excluir").focus();   // o padrão seguro é não excluir
    });
  });

  document.getElementById("cancelar-excluir").addEventListener("click", () => dialogo.close());

  confirmar.addEventListener("click", () => {
    if (!alvo) return;
    fetch(alvo.url, { method: "DELETE" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => {
        const proximo = alvo.item.nextElementSibling || alvo.item.previousElementSibling;
        alvo.item.remove();
        dialogo.close();
        if (pesquisa) filtrar();
        const botao = proximo && proximo.querySelector("[data-excluir]");
        if (botao) botao.focus();
      })
      .catch(() => {
        erroExcluir.textContent = "Não foi possível excluir. Confira se você ainda está logado e tente de novo.";
        erroExcluir.hidden = false;
      });
  });

  // ---------- pesquisa na lista de jogos ----------
  // ignora acento e maiúsculas; vale para o nome e para o console ("snes", "ps1")
  const pesquisa = document.getElementById("pesquisa-jogos");
  const contagem = document.getElementById("contagem-jogos");
  const nenhum = document.getElementById("nenhum-jogo");
  const normalizar = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // apelidos dos consoles, para achar por "ps1", "genesis"...
  const APELIDOS = { psx: "ps1 ps psone", megadrive: "genesis md", gb: "gbc", nes: "famicom", snes: "super famicom sfc" };
  const total = (n) => (n === 1 ? "1 jogo" : `${n.toLocaleString("pt-BR")} jogos`);

  function filtrar() {
    const itens = Array.from(document.querySelectorAll(".jogo-item"));
    const partes = normalizar(pesquisa.value).split(" ").filter(Boolean);
    let visiveis = 0;
    itens.forEach((item) => {
      if (!item.dataset.busca) {
        const chave = item.dataset.console.split(" ")[0];
        item.dataset.busca = normalizar(`${item.dataset.titulo} ${item.dataset.console} ${APELIDOS[chave] || ""}`);
      }
      const mostra = partes.every((p) => item.dataset.busca.includes(p));
      item.hidden = !mostra;
      if (mostra) visiveis += 1;
    });
    contagem.textContent = partes.length ? `${total(visiveis)} de ${itens.length.toLocaleString("pt-BR")}` : total(itens.length);
    nenhum.hidden = visiveis > 0;
  }

  if (pesquisa) {
    filtrar();   // contagem com ponto de milhar (e a pesquisa que o navegador lembrou)
    pesquisa.addEventListener("input", filtrar);
    // Enter leva ao primeiro jogo achado
    pesquisa.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const primeiro = document.querySelector(".jogo-item:not([hidden]) [data-excluir]");
      if (primeiro) primeiro.focus();
    });
    // começar a digitar em qualquer lugar da página vai para a pesquisa
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "/" || /^[\p{L}]$/u.test(e.key)) {
        pesquisa.focus();
        if (e.key === "/") e.preventDefault();
      }
    });
  }

  // ---------- porta ----------
  const form = document.getElementById("form-porta");
  const campo = document.getElementById("porta");
  const erro = document.getElementById("erro-porta");
  const botao = document.getElementById("salvar-porta");

  // abre o endereço novo assim que o servidor responder nele
  function esperarEAbrir(url) {
    let tentativas = 0;
    const tentar = () => {
      tentativas += 1;
      fetch(url, { mode: "no-cors", cache: "no-store" })
        .then(() => { location.href = url; })
        .catch(() => {
          if (tentativas < 40) setTimeout(tentar, 500);
          else botao.textContent = `Abra ${url}`;
        });
    };
    setTimeout(tentar, 1500);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    erro.hidden = true;
    fetch("/api/servidor/porta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ porta: campo.value }),
    })
      .then((r) => r.json())
      .then((r) => {
        if (r.erro) { erro.textContent = r.erro; erro.hidden = false; return; }
        botao.disabled = true;
        botao.textContent = "Reiniciando…";
        esperarEAbrir(r.url);
      })
      .catch(() => { erro.textContent = "Sem resposta do servidor."; erro.hidden = false; });
  });
})();
