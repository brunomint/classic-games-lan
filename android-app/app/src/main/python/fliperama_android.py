"""Liga o servidor do Fliperama de Casa dentro do app Android (chamado pelo ServidorService).

O código do servidor fica em <pasta> (extraído dos assets do app); os dados (banco, saves,
avatares) ficam em <dados>, que sobrevive às atualizações do app. Esta função não retorna:
o servidor roda até o processo do serviço ser encerrado (botão Desligar).
"""
import os
import sys


def iniciar(pasta, dados, porta, roms=None, bios=None, achados=None, capas_dir=None):
    os.environ["CG_DADOS"] = dados
    if roms:   # pasta "Fliperama de Casa" do celular (ver PastaJogos.kt)
        os.environ["CG_ROMS"] = roms
    if bios:
        os.environ["CG_BIOS"] = bios
    if capas_dir:   # capas na pasta do celular (ver PastaJogos.kt)
        os.environ["CG_CAPAS"] = capas_dir
    if achados:   # lista de pastas da busca de jogos do app (ver BuscaJogos.kt)
        os.environ["CG_ACHADOS"] = achados
    os.environ["CG_ANDROID"] = "1"   # no app a porta é fixa (Ajustes não reinicia o processo)
    os.chdir(pasta)
    if pasta not in sys.path:
        sys.path.insert(0, pasta)
    import app
    import capas
    app._porta["atual"] = porta
    print(f"Fliperama de Casa → http://{app.lan_ip()}:{porta}", flush=True)
    capas.em_segundo_plano(_capas_de_tempos_em_tempos, capas, app.BASE_DIR)
    app.socketio.run(app.app, host="0.0.0.0", port=porta, allow_unsafe_werkzeug=True)


def _capas_de_tempos_em_tempos(capas, base_dir):
    """Ao ligar e depois a cada 10 minutos: pega as capas dos jogos achados pela busca com o
    servidor ligado e tenta de novo as que falharam por falta de internet."""
    import time
    while True:
        try:
            capas.baixar_faltantes(base_dir, avisar=lambda m: None)
        except Exception as e:
            print("capas:", e, flush=True)
        time.sleep(600)
