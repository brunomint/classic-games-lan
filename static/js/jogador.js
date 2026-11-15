// Jogador logado (o servidor guarda quem é pela sessão) + atalho para chamar a API.
window.CG = window.CG || {};

CG.getNome = () => document.body.dataset.jogadorNome || "";

CG.api = function (url, dados) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  }).then((r) => {
    if (r.status === 401) {
      // sessão perdida (ex.: servidor apagou os dados): volta para o login
      location.href = "/entrar?proximo=" + encodeURIComponent(location.pathname + location.search);
    }
    return r.ok ? r.json() : Promise.reject(r);
  });
};
