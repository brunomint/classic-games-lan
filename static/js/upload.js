// Envio de ROMs com barra de progresso (XHR, porque fetch não informa progresso de upload).
(function () {
  const form = document.getElementById("form-envio");
  const input = document.getElementById("arquivos");
  const soltar = document.getElementById("soltar");
  const fila = document.getElementById("fila");
  const botao = document.getElementById("enviar");
  let arquivos = [];

  function mb(bytes) { return (bytes / 1e6).toFixed(1) + " MB"; }

  function mostrarFila() {
    fila.replaceChildren(...arquivos.map((f) => {
      const li = document.createElement("li");
      li.dataset.nome = f.name;
      li.innerHTML = '<span class="nome-arq"></span><span class="estado"></span>';
      li.querySelector(".nome-arq").textContent = f.name;
      li.querySelector(".estado").textContent = mb(f.size);
      return li;
    }));
    botao.disabled = arquivos.length === 0;
    botao.textContent = "Enviar ROMs";
  }

  input.addEventListener("change", () => { arquivos = Array.from(input.files); mostrarFila(); });

  ["dragenter", "dragover"].forEach((ev) => soltar.addEventListener(ev, (e) => {
    e.preventDefault(); soltar.classList.add("ativo");
  }));
  ["dragleave", "drop"].forEach((ev) => soltar.addEventListener(ev, (e) => {
    e.preventDefault(); soltar.classList.remove("ativo");
  }));
  soltar.addEventListener("drop", (e) => { arquivos = Array.from(e.dataTransfer.files); mostrarFila(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!arquivos.length) return;

    // o servidor tem limite por envio e precisa de espaço livre: confere antes de mandar
    const total = arquivos.reduce((n, f) => n + f.size, 0);
    try {
      const espaco = await (await fetch("/api/roms/espaco")).json();
      const gb = (n) => (n / 1024 ** 3).toFixed(1).replace(".", ",");
      if (total > espaco.limite) {
        botao.textContent = `Grande demais: envie até ${gb(espaco.limite)} GB de cada vez`;
        return;
      }
      if (total > espaco.disponivel) {
        botao.textContent = `Pouco espaço no servidor (cabem ${gb(espaco.disponivel)} GB)`;
        return;
      }
    } catch (err) { /* sem a conferência, o servidor ainda recusa se passar */ }

    const dados = new FormData();
    dados.append("console", document.getElementById("console").value);
    arquivos.forEach((f) => dados.append("roms", f));

    botao.disabled = true;
    botao.textContent = "Enviando… 0%";

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/roms");
    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) botao.textContent = `Enviando… ${Math.round((ev.loaded / ev.total) * 100)}%`;
    });
    xhr.addEventListener("load", () => {
      let resultados = [];
      try { resultados = JSON.parse(xhr.responseText); } catch (err) { /* resposta inválida */ }
      if (!Array.isArray(resultados)) {
        botao.textContent = (resultados && resultados.erro) || "O servidor recusou o envio";
        botao.disabled = false;
        return;
      }
      resultados.forEach((r) => {
        const li = fila.querySelector(`li[data-nome="${CSS.escape(r.arquivo)}"]`);
        if (!li) return;
        li.classList.add(r.ok ? "ok" : "erro");
        li.querySelector(".estado").textContent = r.ok ? `Na prateleira de ${r.console}` : r.erro;
      });
      if (xhr.status !== 200) { botao.textContent = "O servidor recusou o envio"; botao.disabled = false; }
      else botao.textContent = "ROMs enviadas";
      arquivos = [];
      input.value = "";
    });
    xhr.addEventListener("error", () => { botao.textContent = "A conexão caiu. Enviar de novo"; botao.disabled = false; });
    xhr.send(dados);
  });
})();
