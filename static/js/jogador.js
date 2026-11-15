// Identidade do jogador neste aparelho: um ID fixo + o nome (aparece no netplay e no histórico).
window.CG = window.CG || {};

(function () {
  function ler(chave) {
    try { return localStorage.getItem(chave) || ""; } catch (e) { return ""; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) { /* modo privado */ }
  }

  // crypto.randomUUID só existe em HTTPS/localhost; pelo IP da rede usamos getRandomValues
  function novoId() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  let id = ler("cg-jogador-id");
  if (!id) {
    id = novoId();
    gravar("cg-jogador-id", id);
  }

  CG.getJogadorId = () => id;

  // passa a jogar como um jogador que já existe (ex.: mesmo jogador em outro aparelho)
  CG.usarJogador = function (novoIdJogador, nome) {
    id = novoIdJogador;
    gravar("cg-jogador-id", id);
    gravar("cg-nome", nome);
  };
  CG.getNome = () => ler("cg-nome");

  let timer = null;
  CG.setNome = function (nome) {
    gravar("cg-nome", nome);
    clearTimeout(timer);
    timer = setTimeout(() => CG.api("/api/jogador", { id, nome }), 600);
  };

  CG.api = function (url, dados) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    }).then((r) => (r.ok ? r.json() : Promise.reject(r)));
  };
})();
