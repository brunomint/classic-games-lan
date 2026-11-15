// Home: QR code de entrada e lista de salas abertas.
(function () {
  // QR code com o endereço local
  const qrBox = document.getElementById("qr");
  if (qrBox && window.qrcode) {
    const qr = qrcode(0, "M");
    qr.addData(qrBox.dataset.url);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
  }

  // Salas abertas (atualiza a cada 3 s)
  const secao = document.getElementById("salas");
  const lista = document.getElementById("lista-salas");

  function linkSala(sala) {
    const params = new URLSearchParams({ sala: sala.session_id });
    return `${sala.url}?${params}`;
  }

  function render(salas) {
    secao.hidden = salas.length === 0;
    lista.replaceChildren(...salas.map((sala) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = linkSala(sala);
      a.className = "sala";

      const pulso = document.createElement("span");
      pulso.className = "pulso";
      const texto = document.createElement("span");
      texto.className = "sala-texto";
      const jogo = document.createElement("strong");
      jogo.textContent = sala.title;
      const quem = document.createElement("span");
      const vagas = sala.max - sala.current;
      quem.textContent = `${sala.player_name} está esperando, ${vagas === 1 ? "falta 1 jogador" : `cabem mais ${vagas}`}`;
      texto.append(jogo, quem);
      const entrar = document.createElement("span");
      entrar.className = "botao botao-peq";
      entrar.dataset.botao = "X";
      entrar.textContent = sala.hasPassword ? "Entrar (com senha)" : "Entrar";

      a.append(pulso, texto, entrar);
      li.append(a);
      return li;
    }));
  }

  function atualizar() {
    fetch("/api/salas")
      .then((r) => r.json())
      .then(render)
      .catch(() => {});
  }

  atualizar();
  setInterval(atualizar, 3000);
})();
