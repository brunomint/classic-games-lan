"""Liga o servidor do Fliperama de Casa dentro do app Android (chamado pelo ServidorService).

O código do servidor fica em <pasta> (extraído dos assets do app); os dados (banco, saves,
avatares) ficam em <dados>, que sobrevive às atualizações do app. Esta função não retorna:
o servidor roda até o processo do serviço ser encerrado (botão Desligar).
"""
import os
import sys


def iniciar(pasta, dados, porta):
    os.environ["CG_DADOS"] = dados
    os.environ["CG_ANDROID"] = "1"   # no app a porta é fixa (Ajustes não reinicia o processo)
    os.chdir(pasta)
    if pasta not in sys.path:
        sys.path.insert(0, pasta)
    import app
    import capas
    app._porta["atual"] = porta
    print(f"Fliperama de Casa → http://{app.lan_ip()}:{porta}", flush=True)
    capas.em_segundo_plano(capas.baixar_faltantes, app.BASE_DIR)
    app.socketio.run(app.app, host="0.0.0.0", port=porta, allow_unsafe_werkzeug=True)
