// Ajustes → Meu jogador → Trocar avatar (rotas em avatares.py).
// Cor + desenho; a foto é opcional e fica no lugar do desenho. A foto é recortada no
// meio, reduzida para 256x256 e convertida em JPEG aqui no navegador antes de enviar.
(function () {
  const $ = (id) => document.getElementById(id);
  const dialogo = $("dialogo-avatar");
  if (!dialogo) return;
  const previa = () => $("avatar-previa").querySelector(".avatar");
  const erro = $("erro-avatar");
  const arquivo = $("arquivo-foto");

  let cor, icone, fotoAtual, fotoNova, fotoNovaUrl, tirarFoto;

  function reiniciar() {
    cor = dialogo.dataset.cor;
    icone = dialogo.dataset.icone || "";
    fotoAtual = dialogo.dataset.foto || "";
    fotoNova = null;
    if (fotoNovaUrl) URL.revokeObjectURL(fotoNovaUrl);
    fotoNovaUrl = "";
    tirarFoto = false;
    erro.hidden = true;
  }

  const foto = () => (tirarFoto ? "" : fotoNovaUrl || fotoAtual);

  function desenhar() {
    const span = previa();
    const botaoCor = dialogo.querySelector(`[data-cor="${cor}"]`);
    span.style.setProperty("--cor", botaoCor.dataset.fundo);
    span.style.setProperty("--tinta", botaoCor.dataset.tinta);
    span.classList.toggle("avatar-com-foto", Boolean(foto()));
    if (foto()) {
      const img = document.createElement("img");
      img.src = foto();
      img.alt = "";
      span.replaceChildren(img);
    } else if (icone) {
      span.innerHTML = dialogo.querySelector(`[data-icone="${icone}"]`).innerHTML;
    } else {
      span.textContent = dialogo.dataset.inicial;
    }
    dialogo.querySelectorAll("[data-cor]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cor === cor)));
    dialogo.querySelectorAll("[data-icone]").forEach((b) =>
      b.setAttribute("aria-pressed", String(!foto() && b.dataset.icone === icone)));
    // os desenhos ganham a cor escolhida, para ver como fica
    dialogo.style.setProperty("--cor-escolhida", botaoCor.dataset.fundo);
    dialogo.style.setProperty("--tinta-escolhida", botaoCor.dataset.tinta);
    $("tirar-foto").hidden = !foto();
    $("escolher-foto").textContent = foto() ? "Trocar a foto" : "Escolher foto";
  }

  dialogo.querySelectorAll("[data-cor]").forEach((b) => b.addEventListener("click", () => {
    cor = b.dataset.cor;
    desenhar();
  }));
  // escolher um desenho volta a usar desenho (a foto sai)
  dialogo.querySelectorAll("[data-icone]").forEach((b) => b.addEventListener("click", () => {
    icone = b.dataset.icone;
    if (foto()) tirarFoto = true;
    desenhar();
  }));

  $("escolher-foto").addEventListener("click", () => arquivo.click());
  $("tirar-foto").addEventListener("click", () => {
    tirarFoto = true;
    desenhar();
  });

  // recorta o meio da foto num quadrado de 256x256 e devolve um JPEG
  function reduzir(arq) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(arq);
      const img = new Image();
      img.onload = () => {
        const lado = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        canvas.getContext("2d").drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2,
          lado, lado, 0, 0, 256, 256);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("sem JPEG"))), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagem inválida")); };
      img.src = url;
    });
  }

  arquivo.addEventListener("change", async () => {
    const arq = arquivo.files && arquivo.files[0];
    arquivo.value = "";
    if (!arq) return;
    try {
      fotoNova = await reduzir(arq);
    } catch (e) {
      erro.textContent = "Não deu para abrir essa imagem. Tente outra foto.";
      erro.hidden = false;
      return;
    }
    if (fotoNovaUrl) URL.revokeObjectURL(fotoNovaUrl);
    fotoNovaUrl = URL.createObjectURL(fotoNova);
    tirarFoto = false;
    erro.hidden = true;
    desenhar();
  });

  async function pedir(url, opcoes) {
    const r = await fetch(url, opcoes);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.erro || "Não deu para salvar. Tente de novo.");
    }
  }

  $("salvar-avatar").addEventListener("click", async () => {
    const botao = $("salvar-avatar");
    botao.disabled = true;
    try {
      await pedir("/api/conta/avatar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cor, icone }),
      });
      if (fotoNova && !tirarFoto) {
        await pedir("/api/conta/avatar/foto", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: fotoNova });
      } else if (tirarFoto && fotoAtual) {
        await pedir("/api/conta/avatar/foto", { method: "DELETE" });
      }
      location.reload();
    } catch (e) {
      erro.textContent = e.message;
      erro.hidden = false;
      botao.disabled = false;
    }
  });

  $("cancelar-avatar").addEventListener("click", () => dialogo.close());

  $("trocar-avatar").addEventListener("click", () => {
    reiniciar();
    desenhar();
    dialogo.showModal();
    const marcado = dialogo.querySelector('[data-cor][aria-pressed="true"]');
    if (marcado) marcado.focus();
  });
})();
