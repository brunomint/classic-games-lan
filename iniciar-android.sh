#!/data/data/com.termux/files/usr/bin/bash
# Inicia o Classic Games no Android (Termux).
# Primeira vez:  pkg install python && pip install -r requirements.txt
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null   # impede o Android de dormir com a tela apagada
python app.py "${1:-5000}"
