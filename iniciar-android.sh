#!/data/data/com.termux/files/usr/bin/bash
# Liga o Fliperama de Casa no Android (Termux) e mostra o endereço e um QR code para os
# outros aparelhos entrarem. Primeira vez: instalar-android.sh (ver README).
# Depois: digite "fliperama" ou toque no ícone "Fliperama de Casa" (Termux:Widget).
#
# O servidor roda em segundo plano (o registro dele vai para dados/servidor.log), assim a
# tela fica só com as informações. Se já estiver ligado, só mostra as informações de novo.
cd "$(dirname "$(readlink -f "$0")")" || exit 1
mkdir -p dados

porta="${1:-$(python - <<'EOF'
import json
try:
    print(int(json.load(open("dados/config.json")).get("porta", 5000)))
except Exception:
    print(5000)
EOF
)}"

ip_local() {
  python - <<'EOF'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("10.255.255.255", 1))
    print(s.getsockname()[0])
except OSError:
    print("127.0.0.1")
EOF
}

no_ar() { curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$porta/"; }

mostrar() {
  local endereco="http://$(ip_local):$porta"
  clear
  echo
  echo "   🎮  FLIPERAMA DE CASA  —  ligado"
  echo
  echo "   Nos outros aparelhos (mesmo Wi-Fi), abra:"
  echo
  echo "       $endereco"
  echo
  if command -v qrencode >/dev/null; then
    echo "   ou aponte a câmera para o QR code:"
    qrencode -t ansiutf8 -m 2 "$endereco" | sed 's/^/   /'
  fi
  echo "   Neste celular: http://localhost:$porta"
  echo
  echo "   O celular não vai dormir enquanto o servidor estiver ligado."
  echo "   Para desligar: CTRL+C aqui, ou o ícone \"Parar Fliperama\"."
  echo
}

if no_ar; then
  mostrar
  echo "   (já estava ligado)"
  exit 0
fi

termux-wake-lock 2>/dev/null   # impede o Android de dormir com a tela apagada
python app.py "$porta" >> dados/servidor.log 2>&1 &
servidor=$!
desligar() {
  kill "$servidor" 2>/dev/null
  termux-wake-unlock 2>/dev/null
  echo
  echo "   Fliperama desligado."
  exit 0
}
trap desligar INT TERM

echo "Ligando o Fliperama de Casa…"
for _ in $(seq 1 60); do
  no_ar && break
  if ! kill -0 "$servidor" 2>/dev/null; then
    echo "O servidor não ligou. Últimas linhas do registro (dados/servidor.log):"
    tail -n 15 dados/servidor.log
    termux-wake-unlock 2>/dev/null
    exit 1
  fi
  sleep 0.5
done
mostrar
wait "$servidor"
termux-wake-unlock 2>/dev/null
