// Jogo em rede no "modo antigo" (EXPERIMENTAL, branch modo-antigo-rede).
//
// Todos os aparelhos rodam o jogo e trocam só os botões, quadro a quadro (lockstep):
//   1. Quem cria a sala manda o estado do jogo ("save state"); todos carregam o mesmo estado.
//   2. Um botão apertado no quadro F vale no quadro F + ATRASO, em todos os aparelhos.
//      Ao fim de cada quadro, o aparelho "fecha" o quadro F + ATRASO e manda seus botões
//      (mesmo sem botão nenhum, para os outros saberem que podem seguir).
//   3. Antes de cada quadro, se faltar o "fechamento" de algum aparelho, o quadro espera.
//   4. De tempos em tempos todos comparam uma impressão digital do estado; se divergiu,
//      quem criou a sala manda o estado de novo.
// O servidor (antigo.py) só repassa as mensagens. O gancho em cada quadro usa o preMainLoop
// / postMainLoop do Emscripten: o EJS_Runtime é envolvido antes de o núcleo carregar.
window.CG = window.CG || {};

(function () {
  const ATRASO = 3;            // quadros (~50 ms): tempo para os botões chegarem ao outro aparelho
  const CHECAR_A_CADA = 300;   // quadros (~5 s) entre comparações de estado
  const BOTOES_EMULADOR = 24;  // 24 em diante são atalhos do emulador (salvar, acelerar...): bloqueados

  const emu = () => window.EJS_emulator;
  const gm = () => emu() && emu().gameManager;

  // ---------- gancho em cada quadro ----------
  let motor = null;
  let runtime;
  Object.defineProperty(window, "EJS_Runtime", {
    configurable: true,
    get: () => runtime,
    set: (f) => {
      runtime = typeof f !== "function" ? f : (cfg) => {
        cfg.preMainLoop = () => (motor && motor.ativo ? motor.antes() : undefined);
        cfg.postMainLoop = () => { if (motor && motor.ativo) motor.depois(); };
        return f(cfg);
      };
    },
  });

  // impressão digital (FNV-1a) do estado do jogo
  function impressao(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  const espera = document.getElementById("espera-antigo");

  class Motor {
    constructor(enviar) {
      this.enviar = enviar;
      this.ativo = false;
      this.eu = 0;
      this.epoca = 0;
      this.outros = [];
    }

    // começa (ou recomeça) do estado recebido, numa nova época; mensagens antigas são ignoradas
    iniciar(estado, epoca, eu, jogadores) {
      const g = gm();
      this.eu = eu;
      this.epoca = epoca;
      this.outros = jogadores.filter((j) => j !== eu);
      g.loadState(estado);
      for (let p = 0; p < 4; p++) for (let i = 0; i < BOTOES_EMULADOR; i++) g.functions.simulateInput(p, i, 0);
      this.base = g.getFrameNum();
      this.rodados = 0;
      this.agenda = {};          // quadro -> [[jogador, botão, valor], ...]
      this.pendentes = [];       // botões deste aparelho ainda sem quadro
      this.confirmado = {};      // jogador -> último quadro "fechado" por ele
      this.outros.forEach((j) => { this.confirmado[j] = ATRASO - 1; });
      this.impressoes = {};      // quadro -> {jogador: impressão}
      this.esperandoDesde = 0;
      this.ativo = this.outros.length > 0;
    }

    parar() {
      this.ativo = false;
      espera.hidden = true;
    }

    // antes de cada quadro: só segue se todos já fecharam este quadro
    antes() {
      const g = gm();
      const f = g.getFrameNum() - this.base;
      const falta = this.outros.some((j) => this.confirmado[j] < f);
      if (falta) {
        if (!this.esperandoDesde) this.esperandoDesde = performance.now();
        else if (performance.now() - this.esperandoDesde > 400) espera.hidden = false;
        return false;
      }
      if (this.esperandoDesde) { this.esperandoDesde = 0; espera.hidden = true; }
      const lista = this.agenda[f];
      if (lista) {
        lista.forEach(([p, i, v]) => g.functions.simulateInput(p, i, v));
        delete this.agenda[f];
      }
      return undefined;
    }

    // depois de cada quadro: fecha o quadro F + ATRASO com os botões deste aparelho
    depois() {
      const g = gm();
      const agora = g.getFrameNum() - this.base;
      while (this.rodados < agora) {
        const alvo = this.rodados + ATRASO;
        const ev = this.pendentes;
        this.pendentes = [];
        if (ev.length) (this.agenda[alvo] = this.agenda[alvo] || []).push(...ev);
        this.enviar({ t: "q", e: this.epoca, j: this.eu, f: alvo, ev });
        this.rodados += 1;
        if (this.rodados % CHECAR_A_CADA === 0) this.conferir(this.rodados);
      }
    }

    conferir(quadro) {
      let h;
      try { h = impressao(gm().getState()); } catch (e) { return; }
      this.anotarImpressao(quadro, this.eu, h);
      this.enviar({ t: "h", e: this.epoca, j: this.eu, f: quadro, h });
    }

    anotarImpressao(quadro, jogador, h) {
      const mapa = (this.impressoes[quadro] = this.impressoes[quadro] || {});
      mapa[jogador] = h;
      if (Object.keys(mapa).length < this.outros.length + 1) return;
      delete this.impressoes[quadro];
      const iguais = new Set(Object.values(mapa)).size === 1;
      if (!iguais && this.eu === 0) {
        CG.aviso && CG.aviso("Os aparelhos se desencontraram: sincronizando de novo…");
        document.dispatchEvent(new CustomEvent("cg:antigo-ressincronizar"));
      }
      document.dispatchEvent(new CustomEvent("cg:antigo-conferido", { detail: { quadro, iguais } }));
    }

    // botões apertados neste aparelho (já com o número do jogador certo)
    local(p, i, v) {
      if (i >= BOTOES_EMULADOR) return;
      this.pendentes.push([Math.min(3, this.eu + p), i, v]);
    }

    receber(m) {
      if (m.e !== this.epoca || !this.ativo) return;
      if (m.t === "q") {
        if (m.ev && m.ev.length) (this.agenda[m.f] = this.agenda[m.f] || []).push(...m.ev);
        if (m.f > (this.confirmado[m.j] ?? -1)) this.confirmado[m.j] = m.f;
      } else if (m.t === "h") {
        this.anotarImpressao(m.f, m.j, m.h);
      }
    }
  }

  // ---------- sala, conexão e tela ----------
  const $ = (id) => document.getElementById(id);
  const dialogo = $("dialogo-antigo");
  const status = $("status-antigo");
  const lista = $("salas-antigo");
  const botaoCriar = $("criar-antigo");
  const botaoSair = $("sair-antigo");
  const gameId = document.getElementById("game").dataset.gameId;
  let socket = null;
  let sala = null;            // {codigo, jogador}
  let jogadores = [0];        // só quem criou a sala usa: números dos jogadores presentes
  let epoca = 0;

  function nome() {
    return (CG.getNome && CG.getNome()) || document.body.dataset.jogadorNome || "Jogador";
  }

  function conectar() {
    if (socket) return socket;
    socket = window.io(location.origin + "/antigo");
    socket.on("antigo-msg", (m) => {
      if (m && m.t === "estado") {
        // sincronização vinda de quem criou a sala
        epoca = m.e;
        motor.iniciar(new Uint8Array(m.estado), m.e, sala.jogador, m.jogadores);
        status.textContent = `Na sala ${sala.codigo}: jogando junto (jogador ${sala.jogador + 1}).`;
        if (emu() && emu().paused && !document.querySelector("dialog[open]")) emu().play();
        return;
      }
      motor.receber(m);
    });
    socket.on("antigo-entrou", (d) => {
      if (!sala || sala.jogador !== 0) return;
      if (!jogadores.includes(d.jogador)) jogadores.push(d.jogador);
      CG.aviso && CG.aviso(`${d.nome} entrou (jogador ${d.jogador + 1})`, "ok");
      sincronizar();
    });
    socket.on("antigo-saiu", (d) => {
      CG.aviso && CG.aviso(`${d.nome} saiu da sala`, "erro");
      if (sala && sala.jogador === 0) {
        jogadores = jogadores.filter((j) => j !== d.jogador);
        if (jogadores.length > 1) sincronizar(); else { motor.parar(); mostrarSala(); }
      } else if (d.jogador === 0) {
        sairDaSala("Quem criou a sala saiu.");
      }
    });
    socket.on("disconnect", () => { if (sala) sairDaSala("A conexão com o servidor caiu."); });
    return socket;
  }

  const enviar = (m) => { if (socket) socket.emit("antigo-msg", m); };
  motor = new Motor(enviar);
  CG.modoAntigo = motor;

  // quem criou a sala manda o estado atual para todos e recomeça junto com eles
  function sincronizar() {
    const g = gm();
    if (!g || !sala || sala.jogador !== 0) return;
    const estado = g.getState();
    epoca += 1;
    socket.emit("antigo-msg", { t: "estado", e: epoca, estado: estado.buffer.slice(estado.byteOffset, estado.byteOffset + estado.byteLength), jogadores });
    motor.iniciar(estado, epoca, 0, jogadores);
    status.textContent = `Sala ${sala.codigo}: ${jogadores.length} aparelhos jogando junto.`;
  }
  document.addEventListener("cg:antigo-ressincronizar", sincronizar);

  // botões deste aparelho passam pelo motor enquanto a sala está ativa
  function prenderEntradas() {
    const g = gm();
    if (!g || g.__antigo) return;
    g.__antigo = true;
    const original = g.simulateInput.bind(g);
    g.simulateInput = (p, i, v) => (motor.ativo ? motor.local(p, i, v) : original(p, i, v));
  }

  function mostrarSala() {
    lista.replaceChildren();
    botaoCriar.hidden = Boolean(sala);
    botaoSair.hidden = !sala;
    if (sala) {
      status.textContent = sala.jogador === 0
        ? (jogadores.length > 1 ? `Sala ${sala.codigo}: ${jogadores.length} aparelhos jogando junto.`
          : `Sala ${sala.codigo} criada. No outro aparelho, abra este jogo e entre pelo menu.`)
        : status.textContent;
      return;
    }
    status.textContent = "Procurando salas deste jogo…";
    conectar().emit("antigo-listar", { game_id: gameId }, (salas) => {
      if (sala) return;
      status.textContent = salas.length ? "Salas abertas neste jogo:" : "Nenhuma sala aberta neste jogo. Crie uma.";
      lista.replaceChildren(...salas.map((s) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "botao botao-claro";
        b.textContent = `Entrar na sala de ${s.nome} (${s.jogadores} jogando)`;
        b.addEventListener("click", () => entrar(s.codigo));
        li.append(b);
        return li;
      }));
      const primeiro = lista.querySelector("button") || botaoCriar;
      primeiro.focus();
    });
  }

  function criar() {
    prenderEntradas();
    conectar().emit("antigo-criar", { game_id: gameId, nome: nome() }, (r) => {
      sala = r;
      jogadores = [0];
      mostrarSala();
    });
  }

  function entrar(codigo) {
    prenderEntradas();
    status.textContent = "Entrando…";
    conectar().emit("antigo-entrar", { codigo, nome: nome() }, (r) => {
      if (r.erro) { status.textContent = r.erro; return; }
      sala = r;
      status.textContent = `Entrou na sala ${r.codigo}. Recebendo o jogo…`;
      lista.replaceChildren();
      botaoCriar.hidden = true;
      botaoSair.hidden = false;
      // fecha o menu: o jogo segue sozinho quando o estado chegar
      setTimeout(() => { if (dialogo.open) dialogo.close(); }, 600);
    });
  }

  function sairDaSala(motivo) {
    motor.parar();
    if (socket && sala) socket.emit("antigo-sair");
    sala = null;
    jogadores = [0];
    if (motivo) CG.aviso && CG.aviso(motivo, "erro");
  }

  $("pausa-antigo").addEventListener("click", () => {
    if (emu() && emu().isNetplay) { CG.aviso && CG.aviso("Saia da sala do outro modo antes.", "erro"); return; }
    $("dialogo-pausa").close();
    setTimeout(() => { dialogo.showModal(); mostrarSala(); }, 10);
  });
  botaoCriar.addEventListener("click", criar);
  botaoSair.addEventListener("click", () => { sairDaSala(); mostrarSala(); });
  $("fechar-antigo").addEventListener("click", () => dialogo.close());
  // ao fechar, se acabou de criar e ninguém entrou, o jogo continua normalmente até alguém entrar
})();
