#!/data/data/com.termux/files/usr/bin/bash
# Inicia o Fliperama de Casa no Android (Termux).
# Primeira vez: instalar-android.sh (ver README). Depois é só digitar: fliperama
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null   # impede o Android de dormir com a tela apagada
python app.py "$@"   # sem número: usa a porta escolhida em Ajustes
