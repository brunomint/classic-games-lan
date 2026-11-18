#!/data/data/com.termux/files/usr/bin/bash
# Desliga o Fliperama de Casa no Android (ícone "Parar Fliperama" do Termux:Widget).
cd "$(dirname "$(readlink -f "$0")")" || exit 1
if pkill -f "^python app\.py"; then   # só o servidor (a linha de comando começa assim)
  msg="Fliperama de Casa desligado."
else
  msg="O Fliperama de Casa já estava desligado."
fi
termux-wake-unlock 2>/dev/null
# aviso na tela, se o Termux:API estiver instalado; senão, só no terminal
command -v termux-toast >/dev/null && termux-toast "$msg" 2>/dev/null
echo "$msg"
