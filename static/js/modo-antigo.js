// Jogo em rede com ROLLBACK: "Jogar junto (rollback)" no menu de pausa.
//
// Todos os aparelhos rodam o jogo e trocam só os botões, como no modo antigo, mas ninguém
// espera o outro a cada quadro:
//   1. Quem cria a sala manda o estado do jogo; todos começam do mesmo estado, no quadro 0.
//   2. Um botão apertado aqui vale ATRASO quadros depois (2 quadros, ~33 ms), nos dois aparelhos.
//   3. Cada aparelho roda o jogo no seu ritmo. Para os botões do outro que ainda não chegaram,
//      supõe que "nada mudou" (ele continua apertando o que apertava).
//   4. A cada FOTO_A_CADA quadros o estado é guardado ("foto"). Se chega um botão do outro para
//      um quadro que já passou, o jogo volta para a foto anterior e refaz os quadros até o
//      presente, já com o botão certo, tudo dentro de um único quadro da tela.
//   5. Se o outro sumir por mais de JANELA quadros, aí sim espera (com o aviso na tela).
//   6. Os relógios se acertam: quem está adiantado segura um quadro de vez em quando.
//   7. De tempos em tempos todos comparam uma impressão digital de uma foto já confirmada;
//      se divergiu, quem criou a sala manda o estado de novo.
// O laço do jogo é do próprio motor: o avanço rápido do RetroArch fica ligado (sem limite) e
// o motor chama um quadro por vez (MainLoop.func) no ritmo certo, pelo preMainLoop.
window.CG = window.CG || {};

(function () {
  const ATRASO = 2;            // quadros de atraso nos botões deste aparelho
  const JANELA = 30;           // no máximo 30 quadros (~500 ms) à frente dos botões confirmados do outro (era 15: o Wi-Fi 2,4 GHz tem picos de 300 ms)
  const FOTO_A_CADA = 1;       // quadros entre fotos do estado (com salvarEstado, uma foto custa ~0,2 ms)
  const CHECAR_A_CADA = 240;   // quadros (~4 s) entre comparações (múltiplo de FOTO_A_CADA)
  const BOTOES_EMULADOR = 24;  // 24 em diante são atalhos do emulador (salvar, acelerar...): bloqueados
  const REPETIR = 10;
  const AFASTAR_APOS = 350;    // ms esperando um aparelho além da JANELA: quem criou a sala o afasta          // cada mensagem rápida leva os últimos 10 quadros fechados (cobre pacote perdido)

  const emu = () => window.EJS_emulator;
  const gm = () => emu() && emu().gameManager;

  // O laço principal do Emscripten (MainLoop) fica escondido dentro do núcleo. O EmulatorJS
  // carrega o núcleo como um Blob de JavaScript; aqui ele ganha uma linha que o expõe.
  const BlobOriginal = window.Blob;
  const MARCA = 'Module["EmulatorJSGetState"]=EmulatorJSGetState;';
  window.Blob = function (partes, opcoes) {
    try {
      if (opcoes && opcoes.type === "application/javascript" && partes && partes[0] instanceof Uint8Array) {
        const texto = new TextDecoder().decode(partes[0]);
        if (texto.includes(MARCA) && !texto.includes('Module["MainLoop"]')) {
          partes = [texto
            .replace(MARCA, MARCA + 'Module["MainLoop"]=MainLoop;Module["rwa"]=()=>typeof RWA!=="undefined"?RWA:null;')
            // som (driver rwebaudio): RWA.descartar joga fora o som dos quadros refeitos numa volta,
            // que já tocou uma vez (senão a fila do alto-falante enchia e o som estalava)
            .replace("if(RWA.nonblock&&_RWebAudioWriteAvailFrames()<num_frames)return 0;",
              "if(RWA.descartar)return num_frames;if(RWA.nonblock&&_RWebAudioWriteAvailFrames()<num_frames)return 0;")];
        }
      }
    } catch (e) { /* segue com o original */ }
    return new BlobOriginal(partes, opcoes);
  };
  window.Blob.prototype = BlobOriginal.prototype;

  // O motor usa o avanço rápido só para rodar um quadro por chamada: sem o aviso
  // "Fast-Forward" na tela, sem pular quadros na imagem e sem mexer no som.
  window.EJS_retroarchExtra = (window.EJS_retroarchExtra || "") +
    "notification_show_fast_forward = false\n" +
    "fastforward_frameskip = false\n" +
    "audio_fastforward_mute = false\n" +
    "audio_fastforward_speedup = false\n";

  // ---------- gancho em cada volta do laço ----------
  let motor = null;
  let runtime;
  Object.defineProperty(window, "EJS_Runtime", {
    configurable: true,
    get: () => runtime,
    set: (f) => {
      runtime = typeof f !== "function" ? f : (cfg) => {
        cfg.preMainLoop = () => (motor && motor.ativo ? motor.antes() : undefined);
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

  // ritmo natural do jogo (60 ou 50 quadros/s), medido antes de entrar na sala
  let ritmoMedido = null;
  (function medirRitmo() {
    let antes = null;
    setInterval(() => {
      const g = gm();
      if (!g || !emu().started || (motor && motor.ativo) || emu().paused) { antes = null; return; }
      const agora = { q: g.getFrameNum(), t: performance.now() };
      if (antes) {
        const qps = (agora.q - antes.q) / ((agora.t - antes.t) / 1000);
        if (qps > 45 && qps < 56) ritmoMedido = 50.007;
        else if (qps >= 56 && qps < 65) ritmoMedido = 60.0988;
      }
      antes = agora;
    }, 2000);
  })();

  const espera = document.getElementById("espera-antigo");
  const zerarEst = () => ({ quadros: 0, iter: 0, esperas: 0, esperaMs: 0, maiorEspera: 0, voltas: 0, refeitos: 0,
    maiorVolta: 0, voltaMs: 0, fotoMs: 0, segurados: 0, acelerados: 0, semFoto: 0,
    teclasAqui: 0, teclasRecusadas: 0, botoesDeles: 0, aplicados: 0 });

  class Motor {
    // enviar: caminho garantido (servidor); rapido: conexão direta entre os aparelhos, que pode
    // perder pacote mas não espera reenvio. Os quadros vão pelos dois; vale o que chegar antes.
    constructor(enviar, rapido) {
      this.enviar = enviar;
      this.rapido = rapido;
      this.ativo = false;
      this.eu = 0;
      this.epoca = 0;
      this.outros = [];
      this.rtt = 0;
    }

    ritmo() { return ritmoMedido || 60.0988; }

    // começa (ou recomeça) do estado recebido, numa nova época; mensagens antigas são ignoradas
    iniciar(estado, epoca, eu, jogadores, ritmo) {
      const g = gm();
      this.ML = g.Module.MainLoop;
      if (!this.ML || !this.ML.func) {
        CG.aviso && CG.aviso("Não deu para ligar o rollback neste jogo.", "erro");
        return;
      }
      this.eu = eu;
      this.epoca = epoca;
      // afastado por conexão lenta: não está na lista; segue o jogo dos outros sem jogar
      this.espectador = !jogadores.includes(eu);
      this.pediuAfastar = false;
      this.outros = jogadores.filter((j) => j !== eu);
      this.jogadores = [...jogadores].sort((a, b) => a - b);
      espera.textContent = this.espectador
        ? "Sua conexão ficou lenta: os outros seguiram jogando. Você volta assim que ela melhorar…"
        : "Esperando o outro aparelho…";
      this.periodo = 1000 / (ritmo || this.ritmo());
      g.functions.setFastForwardRatio(0);
      g.functions.toggleFastForward(1);
      this.carregar(estado);
      this.botoes = [0, 1, 2, 3].map(() => new Array(BOTOES_EMULADOR).fill(0));
      for (let p = 0; p < 4; p++) for (let i = 0; i < BOTOES_EMULADOR; i++) g.functions.simulateInput(p, i, 0);
      this.f = 0;                // próximo quadro a rodar
      this.eventos = {};         // jogador -> {quadro: [[p, botão, valor], ...]}
      this.jogadores.forEach((j) => { this.eventos[j] = {}; });
      this.pendentes = [];       // botões deste aparelho ainda sem quadro
      this.confirmado = {};      // jogador -> último quadro fechado por ele sem buracos antes
      this.fora = {};            // jogador -> quadros fechados que chegaram antes de um buraco
      this.remoto = {};          // jogador -> {n: quadro dele, t: quando soube}
      this.vantagem = {};        // jogador -> quantos quadros estou à frente dele (média)
      this.vantagemDele = {};    // jogador -> quanto ele acha que está à frente de mim
      this.outros.forEach((j) => {
        this.confirmado[j] = ATRASO - 1; this.fora[j] = new Set(); this.vantagem[j] = 0;
      });
      this.historico = [];       // últimos quadros fechados por este aparelho: [[quadro, botões]]
      this.impressoes = {};      // quadro -> {jogador: impressão}
      this.fotos = [];           // [{f, estado, botoes, conferida}]
      this.livres = this.livres || [];  // espaços de memória de fotos descartadas, para reaproveitar
      this.corrigir = null;      // quadro mais antigo que precisa ser refeito
      this.esperandoDesde = 0;
      espera.hidden = true;
      this.est = zerarEst();
      this.total = { voltas: 0, refeitos: 0 };
      this.foto();
      this.t0 = performance.now();
      this.ativo = this.outros.length > 0;
      if (!this.ativo) g.functions.toggleFastForward(0);
    }

    parar() {
      this.ativo = false;
      espera.hidden = true;
      const g = gm();
      if (!g) return;
      try { g.functions.toggleFastForward(0); } catch (e) { /* ignora */ }
      if (this.botoes) for (let p = 0; p < 4; p++) for (let i = 0; i < BOTOES_EMULADOR; i++) {
        if (this.botoes[p][i]) g.functions.simulateInput(p, i, 0);
      }
    }

    quadro() { this.ML.func(); }

    som() { const M = gm().Module; return M.rwa ? M.rwa() : null; }

    // o carregamento é uma tarefa do RetroArch: só vale na próxima volta, que não roda quadro
    carregar(estado) {
      const g = gm();
      try { g.FS.unlink("/game.state"); } catch (e) { /* não existia */ }
      g.FS.writeFile("/game.state", estado);
      g.functions.loadState("game.state", 0);
      this.quadro();
    }

    // fotos nos quadros múltiplos de FOTO_A_CADA (os mesmos em todos os aparelhos, para a
    // comparação); se uma passou (quadro de volta), tira assim que der
    precisaFoto() {
      const ultima = this.fotos[this.fotos.length - 1].f;
      if (ultima === this.f) return false;
      return this.f % FOTO_A_CADA === 0 || this.f - ultima > FOTO_A_CADA + 2;
    }

    // Salva o estado direto do núcleo, num espaço de memória reaproveitado. A função do
    // EmulatorJS (EmulatorJSGetState) não devolve os ~800 KB que o núcleo reserva a cada vez:
    // a memória do jogo crescia sem parar e o navegador travava para aumentá-la.
    salvarEstado() {
      const M = gm().Module;
      if (!M.HEAPU8 || !M._save_state_info) return M.EmulatorJSGetState();
      const p = M._save_state_info();
      let info = "";
      for (let h = M.HEAPU8, k = p; h[k]; k++) info += String.fromCharCode(h[k]);
      const [tam, ini, ok] = info.split("|");
      if (ok !== "1") throw new Error("Falha ao salvar o estado: " + tam);
      const n = +tam, d = +ini;
      let buf = this.livres.pop();
      if (!buf || buf.length !== n) buf = new Uint8Array(n);
      buf.set(M.HEAPU8.subarray(d, d + n));
      M._free(d);
      return buf;
    }

    devolver(fotos) { for (const x of fotos) if (this.livres.length < 64) this.livres.push(x.estado); }

    foto() {
      const t = performance.now();
      const estado = this.salvarEstado();
      this.fotos.push({ f: this.f, estado, botoes: this.botoes.map((b) => b.slice()), conferida: false });
      this.est.fotoMs = Math.max(this.est.fotoMs, performance.now() - t);
    }

    // aplica os botões do quadro atual (de todos, sempre na mesma ordem) e roda o quadro
    rodar() {
      const fn = gm().functions;
      for (const j of this.jogadores) {
        const lista = this.eventos[j][this.f];
        if (!lista) continue;
        for (const [p, i, v] of lista) {
          if (this.botoes[p][i] !== v) { this.botoes[p][i] = v; fn.simulateInput(p, i, v); this.est.aplicados += 1; }
        }
      }
      this.quadro();
      this.f += 1;
    }

    // um quadro novo: fecha o quadro f + ATRASO com os botões deste aparelho e roda o quadro f
    passo() {
      if (this.espectador) { this.rodar(); this.est.quadros += 1; return; }
      const alvo = this.f + ATRASO;
      const ev = this.pendentes;
      this.pendentes = [];
      if (ev.length) this.eventos[this.eu][alvo] = ev;
      this.historico.push([alvo, ev]);
      if (this.historico.length > REPETIR) this.historico.shift();
      // n = quantos quadros este aparelho terá rodado ao fim deste (para o acerto de relógio)
      this.rapido({ t: "q", e: this.epoca, j: this.eu, n: this.f + 1, v: this.vantagem, s: this.historico });
      this.enviar({ t: "q", e: this.epoca, j: this.eu, n: this.f + 1, s: [[alvo, ev]] });
      this.rodar();
      this.est.quadros += 1;
    }

    // chegou botão do outro para um quadro que já passou: volta à foto e refaz até o presente
    voltar() {
      const alvo = this.corrigir;
      this.corrigir = null;
      let k = this.fotos.length - 1;
      while (k > 0 && this.fotos[k].f > alvo) k--;
      const foto = this.fotos[k];
      if (!foto || foto.f > alvo) { this.est.semFoto += 1; return; }
      this.devolver(this.fotos.splice(k + 1)); // as fotos depois do erro foram tiradas com o palpite errado
      const ate = this.f;
      const t = performance.now();
      this.carregar(foto.estado);
      const fn = gm().functions;
      for (let p = 0; p < 4; p++) for (let i = 0; i < BOTOES_EMULADOR; i++) {
        const v = foto.botoes[p][i];
        if (this.botoes[p][i] !== v) { this.botoes[p][i] = v; fn.simulateInput(p, i, v); }
      }
      this.f = foto.f;
      const som = this.som();
      if (som) som.descartar = true;
      while (this.f < ate) {
        // refaz as fotos no caminho (agora custam pouco), com os botões certos
        if (this.f > foto.f && this.f % FOTO_A_CADA === 0) this.foto();
        this.rodar();
      }
      if (som) som.descartar = false;
      if (this.f % FOTO_A_CADA === 0 && this.fotos[this.fotos.length - 1].f !== this.f) this.foto();
      this.est.voltas += 1;
      this.total.voltas += 1;
      this.total.refeitos += ate - foto.f;
      this.est.refeitos += ate - foto.f;
      this.est.maiorVolta = Math.max(this.est.maiorVolta, ate - foto.f);
      this.est.voltaMs = Math.max(this.est.voltaMs, performance.now() - t);
    }

    // a cada volta do laço: roda o próximo quadro quando chega a hora; nunca deixa o laço do
    // Emscripten rodar o seu (return false)
    antes() {
      const agora = performance.now();
      this.est.iter += 1;
      let devidos = Math.floor((agora - this.t0) / this.periodo);
      if (devidos - this.f > 4) {            // voltou de uma pausa ou a aba ficou parada: não dispara
        this.t0 = agora - this.f * this.periodo;
        devidos = this.f;
      }
      if (this.f >= devidos) return false;

      const minConf = Math.min(...this.outros.map((j) => this.confirmado[j]));
      if (this.f - minConf > JANELA) {
        if (!this.esperandoDesde) { this.esperandoDesde = agora; this.est.esperas += 1; }
        else if (agora - this.esperandoDesde > 400) espera.hidden = false;
        // quem criou a sala não deixa um aparelho lento travar os outros: afasta-o
        if (this.eu === 0 && !this.pediuAfastar && agora - this.esperandoDesde > AFASTAR_APOS) {
          const lentos = this.outros.filter((j) => this.f - this.confirmado[j] > JANELA);
          if (lentos.length) {
            this.pediuAfastar = true;
            setTimeout(() => document.dispatchEvent(new CustomEvent("cg:antigo-afastar", { detail: lentos })), 0);
          }
        }
        if (this.historico.length && agora - (this.reenviadoEm || 0) > 8) {
          this.reenviadoEm = agora;
          this.rapido({ t: "q", e: this.epoca, j: this.eu, n: this.f, s: this.historico });
        }
        this.t0 = agora - this.f * this.periodo;
        return false;
      }
      if (this.esperandoDesde) {
        const d = agora - this.esperandoDesde;
        this.est.esperaMs += d;
        this.est.maiorEspera = Math.max(this.est.maiorEspera, d);
        this.esperandoDesde = 0;
        espera.hidden = true;
      }

      // acerto de relógio (como no GGPO): cada um mede quanto está à frente do outro e conta para
      // ele; a metade da diferença é o adiantamento de verdade (o atraso da rede se cancela).
      // Adiantado em relação a alguém -> segura um quadro; atrasado -> acelera.
      const vant = this.outros.map((j) => (this.vantagem[j] - (this.vantagemDele[j] || 0)) / 2);
      if (Math.max(...vant) > 1) {
        this.outros.forEach((j) => { this.vantagem[j] -= 1; this.vantagemDele[j] = (this.vantagemDele[j] || 0) + 1; });
        this.t0 += this.periodo;
        this.est.segurados += 1;
        return false;
      }
      if (Math.min(...vant) < -1.5 && Math.max(...vant) < 0) {
        this.outros.forEach((j) => { this.vantagem[j] += 1; this.vantagemDele[j] = (this.vantagemDele[j] || 0) - 1; });
        this.t0 -= this.periodo;
        this.est.acelerados += 1;
      }

      if (this.corrigir !== null) this.voltar();
      else if (this.precisaFoto()) this.foto();
      this.passo();
      this.medirVantagem(agora);
      this.podar(minConf);
      return false;
    }

    medirVantagem(agora) {
      for (const j of this.outros) {
        const r = this.remoto[j];
        if (!r) continue;
        const dele = r.n + (agora - r.t + (this.rtt || 0) / 2) / this.periodo;
        this.vantagem[j] = this.vantagem[j] * 0.95 + (this.f - dele) * 0.05;
      }
    }

    // fotos antigas: só precisa da mais nova até o primeiro quadro ainda sem confirmação
    podar(minConf) {
      const limite = minConf + 1;
      for (const foto of this.fotos) {
        if (foto.f > limite) break;
        if (!this.espectador && !foto.conferida && foto.f > 0 && foto.f % CHECAR_A_CADA === 0) {
          foto.conferida = true;
          const h = impressao(foto.estado);
          this.anotarImpressao(foto.f, this.eu, h);
          this.enviar({ t: "h", e: this.epoca, j: this.eu, f: foto.f, h });
        }
      }
      let k = 0;
      while (k + 1 < this.fotos.length && this.fotos[k + 1].f <= limite) k++;
      if (k > 0) {
        this.devolver(this.fotos.splice(0, k));
        const primeiro = this.fotos[0].f;
        for (const j of this.jogadores) {
          for (const q in this.eventos[j]) if (+q < primeiro) delete this.eventos[j][q];
        }
      }
    }

    anotarImpressao(quadro, jogador, h) {
      const mapa = (this.impressoes[quadro] = this.impressoes[quadro] || {});
      mapa[jogador] = h;
      for (const q in this.impressoes) if (+q < quadro - 4 * CHECAR_A_CADA) delete this.impressoes[q];
      if (Object.keys(mapa).length < this.outros.length + 1) return;
      delete this.impressoes[quadro];
      const iguais = new Set(Object.values(mapa)).size === 1;
      if (!iguais && this.eu === 0) {
        CG.aviso && CG.aviso("Os aparelhos se desencontraram: sincronizando de novo…");
        document.dispatchEvent(new CustomEvent("cg:antigo-ressincronizar"));
      }
      document.dispatchEvent(new CustomEvent("cg:antigo-conferido", { detail: { quadro, iguais } }));
    }

    // um quadro fechado por outro aparelho (pode chegar repetido e fora de ordem)
    selar(j, f, ev) {
      if (!(j in this.confirmado) || f <= this.confirmado[j] || this.fora[j].has(f)) return;
      if (ev && ev.length) {
        this.est.botoesDeles += ev.length;
        this.eventos[j][f] = ev;
        // o palpite para esse quadro foi "nada mudou"; se já rodou, precisa refazer
        if (f < this.f) this.corrigir = this.corrigir === null ? f : Math.min(this.corrigir, f);
      }
      this.fora[j].add(f);
      while (this.fora[j].has(this.confirmado[j] + 1)) {
        this.confirmado[j] += 1;
        this.fora[j].delete(this.confirmado[j]);
      }
    }

    // botões apertados neste aparelho (já com o número do jogador certo)
    local(p, i, v) {
      if (this.est) this.est.teclasAqui += 1;
      if (i >= BOTOES_EMULADOR || this.espectador) { if (this.est) this.est.teclasRecusadas += 1; return; }
      this.pendentes.push([Math.min(3, this.eu + p), i, v]);
    }

    receber(m) {
      if (m.e !== this.epoca || !this.ativo) return;
      if (m.t === "q") {
        if (m.n != null && (!this.remoto[m.j] || m.n > this.remoto[m.j].n)) {
          this.remoto[m.j] = { n: m.n, t: performance.now() };
          if (m.v && m.v[this.eu] != null) this.vantagemDele[m.j] = m.v[this.eu];
        }
        (m.s || []).forEach(([f, ev]) => this.selar(m.j, f, ev));
      } else if (m.t === "h" && !this.espectador && m.j in this.confirmado) {
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
  // só quem criou a sala usa: aparelhos afastados por conexão lenta (seguem na sala, assistindo)
  const afastados = new Set();
  const afastadoEm = {}, vezesAfastado = {}, voltouEm = {}, nomes = {};
  const ouvidos = {};         // jogador -> instantes das últimas mensagens dele (6 s)

  function nome() {
    return (CG.getNome && CG.getNome()) || document.body.dataset.jogadorNome || "Jogador";
  }

  function conectar() {
    if (socket) return socket;
    socket = window.io(location.origin + "/antigo");
    socket.on("antigo-msg", (m) => {
      if (m && m.t === "rtc") { sinal(m); return; }
      if (m && m.t === "estado") {
        // sincronização vinda de quem criou a sala
        epoca = m.e;
        const fora = !m.jogadores.includes(sala.jogador);
        if (fora && !motor.espectador) CG.aviso && CG.aviso("Sua conexão ficou lenta: assistindo até ela melhorar.", "erro");
        if (!fora && motor.espectador) CG.aviso && CG.aviso("Conexão melhorou: de volta ao jogo!", "ok");
        motor.iniciar(new Uint8Array(m.estado), m.e, sala.jogador, m.jogadores, m.ritmo);
        status.textContent = fora
          ? `Na sala ${sala.codigo}: assistindo (conexão lenta), volta sozinho quando melhorar.`
          : `Na sala ${sala.codigo}: jogando junto (jogador ${sala.jogador + 1}).`;
        if (emu() && emu().paused && !document.querySelector("dialog[open]")) emu().play();
        return;
      }
      ouvir(m);
      motor.receber(m);
    });
    socket.on("antigo-entrou", (d) => {
      if (!sala || sala.jogador !== 0) return;
      nomes[d.jogador] = d.nome;
      if (!jogadores.includes(d.jogador)) jogadores.push(d.jogador);
      CG.aviso && CG.aviso(`${d.nome} entrou (jogador ${d.jogador + 1})`, "ok");
      sincronizar();
      ligarDireto(d.jogador);
    });
    socket.on("antigo-saiu", (d) => {
      CG.aviso && CG.aviso(`${d.nome} saiu da sala`, "erro");
      fecharDireto(d.jogador);
      if (sala && sala.jogador === 0) {
        jogadores = jogadores.filter((j) => j !== d.jogador);
        afastados.delete(d.jogador);
        if (jogadores.length > 1) sincronizar(); else { motor.parar(); mostrarSala(); }
      } else if (d.jogador === 0) {
        sairDaSala("Quem criou a sala saiu.");
      }
    });
    socket.on("disconnect", () => { if (sala) sairDaSala("A conexão com o servidor caiu."); });
    return socket;
  }

  const enviar = (m) => { if (socket) socket.emit("antigo-msg", m); };

  // ---------- conexão direta entre os aparelhos (WebRTC) ----------
  // Sem passar pelo servidor e sem esperar reenvio de pacote perdido (ordered: false,
  // maxRetransmits: 0): um pacote perdido no Wi-Fi não segura os seguintes. A repetição dos
  // últimos quadros em cada mensagem cobre a perda; o servidor continua como reserva.
  const diretos = {};          // jogador -> {pc, dc}
  const candidatosAntes = {};  // jogador -> candidatos que chegaram antes da oferta
  let rtt = null;              // tempo de ida e volta pela conexão direta (ms, média móvel)
  const conexao = document.createElement("p");
  conexao.className = "status-antigo conexao-antigo";
  status.after(conexao);

  function rapido(m) {
    const texto = JSON.stringify(m);
    Object.values(diretos).forEach((c) => {
      if (c.dc && c.dc.readyState === "open") { try { c.dc.send(texto); } catch (e) { /* segue pelo servidor */ } }
    });
  }

  function mostrarConexao() {
    const abertas = Object.values(diretos).filter((c) => c.dc && c.dc.readyState === "open").length;
    if (!sala || !motor.ativo) { conexao.textContent = ""; return; }
    conexao.textContent = abertas
      ? `Conexão direta entre os aparelhos${rtt != null ? `: ${Math.round(rtt)} ms de ida e volta` : ""}.`
      : "Conexão direta ainda não abriu: usando o servidor.";
  }

  function prepararCanal(dc) {
    dc.onopen = mostrarConexao;
    dc.onclose = mostrarConexao;
    dc.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === "p") { try { dc.send(JSON.stringify({ t: "pp", ts: m.ts })); } catch (e) { /* ignora */ } return; }
      if (m.t === "pp") {
        const x = performance.now() - m.ts;
        rtt = rtt == null ? x : rtt * 0.8 + x * 0.2;
        motor.rtt = rtt;
        mostrarConexao();
        return;
      }
      ouvir(m);
      motor.receber(m);
    };
  }

  function fecharDireto(j) {
    const c = diretos[j];
    if (!c) return;
    try { c.dc && c.dc.close(); } catch (e) { /* ignora */ }
    try { c.pc.close(); } catch (e) { /* ignora */ }
    delete diretos[j];
    mostrarConexao();
  }

  function novaConexao(j) {
    fecharDireto(j);
    const pc = new RTCPeerConnection({ iceServers: [] });   // só rede local
    const c = { pc, dc: null };
    diretos[j] = c;
    pc.onicecandidate = (e) => {
      if (e.candidate) enviar({ t: "rtc", de: sala.jogador, para: j, cand: e.candidate.toJSON() });
    };
    pc.ondatachannel = (e) => { c.dc = e.channel; prepararCanal(c.dc); };
    return c;
  }

  // quem criou a sala chama cada aparelho que entra
  async function ligarDireto(j) {
    try {
      const c = novaConexao(j);
      c.dc = c.pc.createDataChannel("antigo", { ordered: false, maxRetransmits: 0 });
      prepararCanal(c.dc);
      await c.pc.setLocalDescription(await c.pc.createOffer());
      enviar({ t: "rtc", de: 0, para: j, sdp: c.pc.localDescription.toJSON() });
    } catch (e) { /* fica só pelo servidor */ }
  }

  async function sinal(m) {
    if (!sala || m.para !== sala.jogador) return;
    try {
      if (m.sdp && m.sdp.type === "offer") {
        const c = novaConexao(m.de);
        await c.pc.setRemoteDescription(m.sdp);
        await c.pc.setLocalDescription(await c.pc.createAnswer());
        enviar({ t: "rtc", de: sala.jogador, para: m.de, sdp: c.pc.localDescription.toJSON() });
      } else if (m.sdp) {
        if (diretos[m.de]) await diretos[m.de].pc.setRemoteDescription(m.sdp);
      } else if (m.cand) {
        const c = diretos[m.de];
        if (c && c.pc.remoteDescription) await c.pc.addIceCandidate(m.cand);
        else (candidatosAntes[m.de] = candidatosAntes[m.de] || []).push(m.cand);
        return;
      }
      const c = diretos[m.de];
      if (c && c.pc.remoteDescription) {
        for (const cand of candidatosAntes[m.de] || []) await c.pc.addIceCandidate(cand).catch(() => {});
        delete candidatosAntes[m.de];
      }
    } catch (e) { /* fica só pelo servidor */ }
  }

  // mede a conexão direta a cada segundo
  setInterval(() => {
    if (motor.ativo) rapido({ t: "p", ts: performance.now() });
    mostrarConexao();
  }, 1000);

  motor = new Motor(enviar, rapido);
  CG.modoAntigo = motor;

  // quem criou a sala manda o estado atual para todos e recomeça junto com eles
  function sincronizar() {
    const g = gm();
    if (!g || !sala || sala.jogador !== 0) return;
    const estado = g.getState();
    const ritmo = motor.ritmo();
    epoca += 1;
    const ativos = jogadores.filter((j) => !afastados.has(j));
    socket.emit("antigo-msg", { t: "estado", e: epoca, ritmo, estado: estado.buffer.slice(estado.byteOffset, estado.byteOffset + estado.byteLength), jogadores: ativos });
    motor.iniciar(estado, epoca, 0, ativos, ritmo);
    status.textContent = `Sala ${sala.codigo}: ${ativos.length} aparelhos jogando junto` +
      (afastados.size ? `, ${afastados.size} assistindo (conexão lenta).` : ".");
  }
  document.addEventListener("cg:antigo-ressincronizar", sincronizar);

  // ---------- aparelho com conexão lenta ----------
  // Quem criou a sala afasta quem fez todos esperarem demais: os outros seguem jogando e o
  // afastado assiste. Ele manda um "sinal de vida" a cada 100 ms; quando os sinais chegam
  // sem falha por 3 s (mais tempo se ele caiu de novo há pouco), volta ao jogo. Cada saída
  // e volta é uma nova sincronização (todos recebem o estado de quem criou a sala).
  const nomeDe = (j) => nomes[j] || `Jogador ${j + 1}`;

  function ouvir(m) {
    if (!m || m.j == null) return;
    const agora = performance.now();
    const lista = (ouvidos[m.j] = ouvidos[m.j] || []);
    lista.push(agora);
    while (lista.length && lista[0] < agora - 6000) lista.shift();
  }

  document.addEventListener("cg:antigo-afastar", (ev) => {
    if (!sala || sala.jogador !== 0) return;
    const agora = performance.now();
    ev.detail.forEach((j) => {
      if (!jogadores.includes(j) || afastados.has(j)) return;
      afastados.add(j);
      afastadoEm[j] = agora;
      vezesAfastado[j] = agora - (voltouEm[j] || -1e9) < 60000 ? (vezesAfastado[j] || 0) + 1 : 1;
      CG.aviso && CG.aviso(`${nomeDe(j)} está com a conexão lenta: os outros seguem jogando.`, "erro");
    });
    sincronizar();
  });

  function prontoParaVoltar(j, agora) {
    const espera = Math.min(30000, 3000 * 2 ** ((vezesAfastado[j] || 1) - 1));
    if (agora - afastadoEm[j] < espera) return false;
    const lista = (ouvidos[j] || []).filter((t) => t >= agora - 3000);
    if (lista.length < 20 || lista[0] > agora - 2700 || lista[lista.length - 1] < agora - 300) return false;
    for (let k = 1; k < lista.length; k++) if (lista[k] - lista[k - 1] > 300) return false;
    return true;
  }

  setInterval(() => {
    if (!sala) return;
    const e = emu();
    if (sala.jogador !== 0) {
      // sinal de vida de quem está assistindo (só com o jogo aberto e rodando)
      if (motor.espectador && e && !e.paused && !document.hidden) {
        const m = { t: "vivo", e: epoca, j: sala.jogador };
        rapido(m);
        enviar(m);
      }
      return;
    }
    const agora = performance.now();
    const voltam = [...afastados].filter((j) => {
      if (!jogadores.includes(j)) { afastados.delete(j); return false; }
      return prontoParaVoltar(j, agora);
    });
    if (!voltam.length) return;
    voltam.forEach((j) => {
      afastados.delete(j);
      voltouEm[j] = agora;
      CG.aviso && CG.aviso(`${nomeDe(j)} voltou ao jogo.`, "ok");
    });
    sincronizar();
  }, 100);

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

  function entrar(codigo, doLink) {
    prenderEntradas();
    status.textContent = "Entrando…";
    conectar().emit("antigo-entrar", { codigo, nome: nome() }, (r) => {
      if (r.erro) {
        status.textContent = r.erro;
        if (doLink) CG.aviso && CG.aviso(r.erro, "erro");
        return;
      }
      if (doLink) CG.aviso && CG.aviso(`Entrou na sala de rollback ${r.codigo}. Recebendo o jogo…`, "ok");
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
    Object.keys(diretos).forEach(fecharDireto);
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
  // veio pela home (Salas abertas): entra sozinho quando o jogo começar
  const salaDoLink = new URLSearchParams(location.search).get("sala-rollback");
  if (salaDoLink) {
    document.addEventListener("cg:jogo-iniciado", () => setTimeout(() => entrar(salaDoLink, true), 300), { once: true });
  }

  botaoCriar.addEventListener("click", criar);
  botaoSair.addEventListener("click", () => { sairDaSala(); mostrarSala(); });
  $("fechar-antigo").addEventListener("click", () => dialogo.close());
  // ao fechar, se acabou de criar e ninguém entrou, o jogo continua normalmente até alguém entrar
})();
