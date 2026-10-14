#!/usr/bin/env bash
# Instala (ou atualiza) o CHESS CREATOR num Ubuntu Server 24.04.
# Rode de dentro da pasta do projeto que foi copiada para o servidor:
#   sudo bash deploy/instalar.sh
# Pode rodar de novo quantas vezes quiser: é assim também que se atualiza o jogo.
set -euo pipefail

DESTINO=/opt/xadrez-ia
ORIGEM="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN="${SUDO_USER:-}"

passo() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo: sudo bash deploy/instalar.sh"
  exit 1
fi

passo "Pacotes do sistema (curl, git, tmux, ufw, openssh-server)"
apt-get update -y
apt-get install -y ca-certificates curl git tmux ufw openssh-server

passo "Node.js (versão LTS)"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi
node --version

passo "cloudflared (Cloudflare Tunnel)"
if ! command -v cloudflared >/dev/null; then
  ARQUITETURA="$(dpkg --print-architecture)" # amd64 num PC comum, arm64 num Raspberry Pi
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARQUITETURA}.deb"
  dpkg -i /tmp/cloudflared.deb
fi
cloudflared --version

passo "Tailscale"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi

passo "SSH: sshd escutando direto na porta 22 (o Ubuntu 24.04 vem com 'socket activation')"
if systemctl is-enabled --quiet ssh.socket 2>/dev/null; then
  systemctl disable --now ssh.socket
fi
systemctl enable --now ssh

passo "Usuário de sistema 'xadrez' (roda o jogo) e grupo 'xadrez' (os integrantes, que podem editar)"
if ! id xadrez >/dev/null 2>&1; then
  useradd --system --shell /usr/sbin/nologin --home-dir "$DESTINO" xadrez
fi
if [ -n "$ADMIN" ]; then
  usermod -aG xadrez "$ADMIN"
fi

passo "Copiando o jogo para $DESTINO"
mkdir -p "$DESTINO"
if [ "$ORIGEM" != "$DESTINO" ]; then
  # Copia tudo menos node_modules e data: as peças já geradas no servidor continuam lá
  tar -C "$ORIGEM" --exclude=./node_modules --exclude=./data -cf - . | tar -C "$DESTINO" -xf -
fi
if [ ! -f "$DESTINO/.env" ]; then
  cp "$DESTINO/.env.example" "$DESTINO/.env"
fi

passo "Dependências do Node (npm ci)"
cd "$DESTINO"
npm ci --omit=dev --no-audit --no-fund

passo "Permissões"
mkdir -p "$DESTINO/data/pecas"
chown -R xadrez:xadrez "$DESTINO"
chmod -R g+rwX "$DESTINO"
find "$DESTINO" -type d -exec chmod g+s {} + # arquivos novos herdam o grupo xadrez
chmod 640 "$DESTINO/.env"                    # o token da IA não fica visível para outros usuários
# O repositório pertence ao usuário xadrez; sem isto o Git recusa comandos de outros usuários ("dubious ownership")
git config --system --get-all safe.directory | grep -qx "$DESTINO" || git config --system --add safe.directory "$DESTINO"
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" config core.sharedRepository group || true # o git pull de um integrante não trava o do outro
fi

passo "Serviços systemd: xadrez (o jogo) e xadrez-tunel (o Cloudflare Tunnel)"
cp "$DESTINO/deploy/xadrez.service" /etc/systemd/system/xadrez.service
cp "$DESTINO/deploy/xadrez-tunel.service" /etc/systemd/system/xadrez-tunel.service
systemctl daemon-reload
systemctl enable xadrez xadrez-tunel
systemctl restart xadrez
sleep 2

passo "Teste local"
PORTA="$(grep -E '^PORT=' "$DESTINO/.env" | cut -d= -f2 || true)"
PORTA="${PORTA:-3000}"
curl -s -o /dev/null -w "curl http://127.0.0.1:${PORTA}/  ->  HTTP %{http_code}\n" "http://127.0.0.1:${PORTA}/" || echo "o jogo não respondeu: veja journalctl -u xadrez -n 30"
ss -lntp | grep -E ":(${PORTA}|22) " || true

cat <<FIM

Pronto! Próximos passos:
  1. Tailscale (uma vez):      sudo tailscale up --hostname=xadrez-server   e abra o link (conta pessoal, não a da faculdade)
  2. Publicar na internet:     bash $DESTINO/deploy/tunel.sh     (mostra a URL pública)
  3. Ver o jogo:               systemctl status xadrez     |     journalctl -u xadrez -f
  4. Conta de cada integrante: sudo adduser NOME   e   sudo usermod -aG sudo,xadrez NOME
FIM
