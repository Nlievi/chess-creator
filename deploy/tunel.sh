#!/usr/bin/env bash
# Mostra a URL pública do jogo (e liga o túnel, se estiver desligado).
#   bash /opt/xadrez-ia/deploy/tunel.sh
# O túnel roda como o serviço xadrez-tunel: não morre quando a sessão SSH fecha.
# Atenção: o Quick Tunnel cria uma URL NOVA toda vez que o serviço reinicia.
set -uo pipefail

if ! systemctl is-active --quiet xadrez-tunel; then
  echo "Ligando o túnel..."
  sudo systemctl start xadrez-tunel
fi

# Lê só o log da execução atual do serviço
EXECUCAO="$(systemctl show -p InvocationID --value xadrez-tunel)"
URL=""
for _ in $(seq 1 30); do
  URL="$(sudo journalctl _SYSTEMD_INVOCATION_ID="$EXECUCAO" --no-pager -o cat 2>/dev/null \
    | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -n "$URL" ]; then
  printf '\n  URL pública do jogo:  %s\n\n' "$URL"
else
  echo "Não achei a URL ainda. Veja o log: sudo journalctl -u xadrez-tunel -n 50"
  exit 1
fi
