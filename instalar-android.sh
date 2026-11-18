#!/data/data/com.termux/files/usr/bin/bash
# Instala (ou atualiza) o Fliperama de Casa no Android, pelo Termux. Uma linha só:
#
#   curl -fsSL https://raw.githubusercontent.com/brunomint/fliperama-de-casa/main/instalar-android.sh | bash
#
# Depois, para ligar o servidor: fliperama
#
# O que faz: atualiza os pacotes do Termux (um Python novo com o pip antigo quebra o pip),
# instala python, pip, git e qrencode, baixa o projeto em ~/fliperama-de-casa (ou atualiza,
# se já existir), instala as dependências, cria o comando "fliperama" e os ícones
# "Fliperama de Casa" e "Parar Fliperama" para a tela inicial (app Termux:Widget).
# Os comandos leem a entrada de /dev/null: com "curl | bash", a entrada é o próprio script.

# tudo dentro de uma função: se o download parar no meio, nada roda pela metade
principal() {
  set -e
  local pasta="$HOME/fliperama-de-casa"
  local repo="https://github.com/brunomint/fliperama-de-casa.git"
  local apt_opcoes=(-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

  if [ -z "$PREFIX" ] || [ ! -d "/data/data/com.termux" ]; then
    echo "Este instalador é para o Termux (Android). No PC, veja o README."
    exit 1
  fi

  echo
  echo "== 1/5 Atualizando os pacotes do Termux (pode demorar alguns minutos)…"
  if ! pkg update "${apt_opcoes[@]}" </dev/null; then
    echo
    echo "Não consegui falar com o servidor de pacotes do Termux."
    echo "Rode 'termux-change-repo', escolha outro espelho e tente de novo."
    exit 1
  fi
  pkg upgrade "${apt_opcoes[@]}" </dev/null
  pkg install "${apt_opcoes[@]}" python python-pip git libqrencode </dev/null
  # se o pip ainda estiver quebrado, reinstala
  if ! python -m pip --version >/dev/null 2>&1; then
    pkg reinstall "${apt_opcoes[@]}" python-pip </dev/null
  fi

  echo
  echo "== 2/5 Baixando o projeto…"
  if [ -d "$pasta/.git" ]; then
    git -C "$pasta" pull --ff-only </dev/null
  else
    git clone --depth 1 "$repo" "$pasta" </dev/null
  fi

  echo
  echo "== 3/5 Instalando as dependências do Python…"
  python -m pip install -r "$pasta/requirements.txt" </dev/null

  echo
  echo "== 4/5 Criando o comando 'fliperama'…"
  cat > "$PREFIX/bin/fliperama" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# Liga o Fliperama de Casa (criado pelo instalar-android.sh).
exec "$pasta/iniciar-android.sh" "\$@"
EOF
  chmod +x "$PREFIX/bin/fliperama" "$pasta/iniciar-android.sh" "$pasta/parar-android.sh"

  echo
  echo "== 5/5 Criando os ícones para a tela inicial (Termux:Widget)…"
  # ~/.shortcuts: abre um terminal; ~/.shortcuts/tasks: roda escondido
  mkdir -p "$HOME/.shortcuts/tasks" "$HOME/.shortcuts/icons"
  printf '#!/data/data/com.termux/files/usr/bin/bash\nexec "%s/iniciar-android.sh"\n' "$pasta" > "$HOME/.shortcuts/Fliperama de Casa"
  printf '#!/data/data/com.termux/files/usr/bin/bash\nexec "%s/parar-android.sh"\n' "$pasta" > "$HOME/.shortcuts/tasks/Parar Fliperama"
  chmod 700 "$HOME/.shortcuts/Fliperama de Casa" "$HOME/.shortcuts/tasks/Parar Fliperama"
  cp "$pasta/android/fliperama.png" "$HOME/.shortcuts/icons/Fliperama de Casa.png"
  cp "$pasta/android/parar.png" "$HOME/.shortcuts/icons/Parar Fliperama.png"

  echo
  echo "Pronto! Para ligar o servidor, digite:  fliperama"
  echo
  echo "Para ter um ícone na tela inicial: instale o app Termux:Widget (F-Droid), segure"
  echo "num espaço vazio da tela inicial > Widgets > Termux:Widget e arraste para a tela."
  echo "Os atalhos 'Fliperama de Casa' e 'Parar Fliperama' aparecem nele."
  echo
  echo "Os jogos você manda pela página 'Enviar ROMs' (de qualquer aparelho da rede)"
  echo "ou copia para $pasta/roms/<console>/."
}

principal
