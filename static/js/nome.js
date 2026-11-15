// Nome do jogador, guardado neste aparelho (aparece para os outros no netplay).
window.CG = window.CG || {};

CG.getNome = function () {
  try { return localStorage.getItem("cg-nome") || ""; } catch (e) { return ""; }
};

CG.setNome = function (nome) {
  try { localStorage.setItem("cg-nome", nome); } catch (e) { /* modo privado */ }
};
