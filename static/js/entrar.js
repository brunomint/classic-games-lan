// "Quem está jogando?": tocar no perfil preenche o nome e abre o teclado do PIN.
(function () {
  const form = document.getElementById("form-entrar");
  const nome = form.querySelector("input[name=nome]");
  const pin = document.getElementById("pin");
  const campoNome = document.getElementById("campo-nome");
  const campoPin = document.getElementById("campo-pin");
  const teclado = document.getElementById("teclado");
  const rotulo = document.getElementById("rotulo-pin");
  const botao = document.getElementById("botao-entrar");

  function mostrarPin() {
    campoPin.hidden = false;
    teclado.hidden = false;
    botao.hidden = false;
  }

  document.querySelectorAll(".perfil-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".perfil-btn").forEach((b) => b.removeAttribute("aria-pressed"));
      btn.setAttribute("aria-pressed", "true");
      const escolhido = btn.dataset.nome;
      nome.value = escolhido;
      pin.value = "";
      mostrarPin();
      if (escolhido) {
        campoNome.hidden = true;
        rotulo.textContent = `PIN de ${escolhido}`;
        teclado.querySelector("[data-tecla='1']").focus();
      } else {
        campoNome.hidden = false;
        rotulo.textContent = "Escolha um PIN (4 a 8 números)";
        nome.focus();
      }
    });
  });

})();
