#!/bin/sh
# Abre o Classic Games no Chrome em tela cheia, como um aparelho de videogame:
# sem barra do navegador em nenhuma página, dá para usar tudo só com o controle.
# Usa um perfil próprio do Chrome (entre com seu jogador uma vez); F11 sai da tela cheia
# e Alt+F4 fecha.
#   ./abrir-tela-cheia.sh                      (este computador)
#   ./abrir-tela-cheia.sh http://192.168.0.7:5000/
URL="${1:-http://localhost:5000/}"
PERFIL="${XDG_CONFIG_HOME:-$HOME/.config}/classic-games-chrome"
NAVEGADOR="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
# endereço da rede tratado como seguro: assim o jogo segura o Esc (abre o menu sem sair da tela cheia)
ORIGEM="$(printf '%s' "$URL" | sed -E 's#^(https?://[^/]+).*#\1#')"
exec "$NAVEGADOR" --user-data-dir="$PERFIL" --no-first-run --no-default-browser-check \
  --unsafely-treat-insecure-origin-as-secure="$ORIGEM" \
  --start-fullscreen --autoplay-policy=no-user-gesture-required --app="$URL"
