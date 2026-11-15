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
        const botao = proximo && proximo.querySelector("[data-excluir]");
        if (botao) botao.focus();
      })
      .catch(() => {
        erroExcluir.textContent = "Não foi possível excluir. Confira se você ainda está logado e tente de novo.";
        erroExcluir.hidden = false;
      });
  });

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
