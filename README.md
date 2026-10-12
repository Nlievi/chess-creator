# Xadrez IA

Jogo de xadrez no navegador em que cada jogador escolhe o tema do seu time e coloca a própria foto nas peças: uma IA transforma a foto numa peça de xadrez estilizada. As capturas têm animações (espada, esmagamento, coice, feitiço), e o xeque-mate faz o rei explodir.

Trabalho bimestral de **Infraestrutura de Servidores** (Prof. Lucca Abbado Neres — FAG): o jogo roda num computador Linux que faz o papel de servidor e é publicado na Web com **Cloudflare Tunnel**.

## 1. Integrantes

| Nome | Função |
|---|---|
| _preencher_ | Infraestrutura (servidor, SSH, túnel, systemd) |
| _preencher_ | Jogo + animações |
| _preencher_ | Online + bot |
| _preencher_ | IA + personalização |

## 2. O serviço

- **Modos:** mesmo PC (pronto). Contra o computador e online ainda estão em construção.
- **Temas:** Clássico, Ouro e Rubi, Neon, Gelo e Fogo, Madeira. Cada lado escolhe o seu.
- **Fotos nas peças:** a pessoa envia uma foto e escolhe as peças. A IA gera a peça, o navegador remove o fundo e o servidor guarda o PNG.
- **Animações de captura** (dependem de quem captura; dá para trocar no `config.json`):

  | Quem captura | Efeito |
  |---|---|
  | Peão, Rei, Rainha | `espada`: corte na diagonal, a peça se parte em duas |
  | Torre | `esmagar`: cai em cima e achata a vítima |
  | Cavalo | `coice`: arremessa a vítima para fora do tabuleiro |
  | Bispo | `desintegrar`: feitiço que transforma a vítima em cinzas |

- **Página de teste:** `/teste-animacoes.html` roda cada efeito com controle de velocidade.

## 3–6. Servidor, tecnologias, comando e porta

| Item | Valor |
|---|---|
| Sistema operacional | Ubuntu Server 24.04 LTS _(confirmar)_ |
| Tecnologias | Node.js + Express, Socket.IO, chess.js, HTML/CSS/JS puro, Web Animations API, Web Audio API, Cloudflare Workers AI |
| Comando para iniciar | `sudo systemctl start xadrez` (que executa `node server.js`) |
| Porta | **3000** (variável `PORT` no `.env`) |

Caminho de uma requisição:

```
navegador (celular no 4G) → Cloudflare → cloudflared (no servidor) → http://localhost:3000 → node server.js
```

## Rodar no seu computador (desenvolvimento)

```bash
npm install
cp .env.example .env     # opcional: sem ele roda na porta 3000 com a IA simulada
npm run dev              # reinicia sozinho quando um arquivo .js do servidor muda
```

Abra `http://localhost:3000`.

## Estrutura

```
server.js            Express: site, /api/config, /api/status, /api/gerar, /api/pecas
ia.js                Geração das peças (Cloudflare Workers AI ou modo simulado)
salas.js             Modo online (Socket.IO) — a fazer
config.json          Textos, cores e animações; lido a cada acesso (edite via SSH!)
.env                 Porta, host e chaves da IA (fora do Git)
deploy/xadrez.service  Serviço do systemd
data/pecas/          Peças geradas (fora do Git)
public/
  index.html, css/style.css
  js/main.js          Telas e menus
  js/partida.js       Regras e turnos (chess.js) + chama as animações
  js/tabuleiro.js     Desenho do tabuleiro e das peças
  js/controladores.js Quem joga cada lado (local; bot e online entram aqui)
  js/animacoes.js     Efeitos de captura e de xeque-mate
  js/particulas.js    Faíscas, poeira, cinzas
  js/sons.js          Sons sintetizados (sem arquivos de áudio)
  js/pecas.js         Peças em SVG e temas
  js/personalizar.js  Janela "Colocar fotos nas peças"
  js/recorte.js       Reduz a foto e remove o fundo da peça gerada
  js/personagem.js    Modo Personagem: busto do personagem num pedestal de xadrez com medalhão
  teste-animacoes.html
```

## IA gratuita (Cloudflare Workers AI)

Sem configuração nenhuma, o modo **Personagem** funciona normalmente (não usa IA) e o modo **Foto de pessoa** fica desativado.

Para ativar a IA:

1. Crie uma conta gratuita no Cloudflare.
2. No painel, vá em **AI → Workers AI → Use REST API**. Ali você copia o **Account ID** e cria um **API Token**.
3. Coloque os dois no `.env` do servidor e reinicie o serviço:
   ```
   CLOUDFLARE_ACCOUNT_ID=...
   CLOUDFLARE_API_TOKEN=...
   ```
4. O rodapé do site passa a mostrar `IA: cloudflare`.

Na janela "Peças personalizadas" há dois modos:
- **Personagem** (padrão): a pessoa ajusta um retângulo em volta da cabeça e do tronco do personagem. O busto, com as cores originais, sai de um **pedestal de xadrez** com aros dourados e um **medalhão dourado com a silhueta da peça**. O pedestal usa a cor do tema do time (marfim, ébano, rubi...). É instantâneo e funciona com personagens famosos e sem internet (`public/js/personagem.js`). Funciona melhor com desenhos de fundo liso.
- **Foto de pessoa:** a IA desenha a peça com a cabeça da pessoa e o corpo no material do time, em uns 7 segundos por peça. O campo "Quem é?" é opcional.

Para ter um personagem diferente em cada peça, gere uma peça de cada vez trocando a imagem: a janela já marca a próxima peça sem personagem.

O filtro de conteúdo do Cloudflare **bloqueia personagens protegidos por direitos autorais** (testado com o Perna Longa): o resultado é bloqueado ("output flagged") ou sai uma pessoa genérica. Por isso personagens usam o modo **Personagem**. No modo "Foto de pessoa", o servidor tenta 3 vezes antes de mostrar o erro.

Detalhes:
- O modelo é o `@cf/black-forest-labs/flux-2-klein-4b`. A cota grátis é diária (10.000 "neurons" por dia, o suficiente para algumas centenas de peças de 512×512).
- O servidor limita a 20 gerações por hora por pessoa (`IA_LIMITE_POR_HORA`). Atrás do túnel, o IP real vem no cabeçalho `CF-Connecting-IP`.
- A chave fica só no servidor e nunca vai para o navegador nem para o Git.

## Instalação no servidor Linux

```bash
# Node.js LTS e git
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs git

# Usuário de sistema que roda o serviço + grupo com os 4 integrantes
sudo useradd -r -s /usr/sbin/nologin xadrez
sudo usermod -aG xadrez ana        # repita para cada integrante (vale no próximo login)

# Código em /opt/xadrez-ia
sudo git clone <URL-DO-REPOSITORIO> /opt/xadrez-ia
sudo chown -R "$USER" /opt/xadrez-ia
cd /opt/xadrez-ia && npm install --omit=dev && cp .env.example .env
sudo chown -R xadrez:xadrez /opt/xadrez-ia && sudo chmod -R g+rwX /opt/xadrez-ia
git config --global --add safe.directory /opt/xadrez-ia   # cada integrante, para poder dar git pull

# Serviço
sudo cp deploy/xadrez.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now xadrez
systemctl status xadrez
curl -i http://127.0.0.1:3000/

# Publicação
cloudflared tunnel --url http://localhost:3000
```

Atualizar depois de mudanças no GitHub: `cd /opt/xadrez-ia && git pull && sudo systemctl restart xadrez`.

## Demonstração: alteração remota por SSH (item 3.6)

```bash
ssh ana@<ip-do-tailscale>
nano /opt/xadrez-ia/config.json
```

Troque, por exemplo, `"mensagemBoasVindas"` ou `"r": "esmagar"` por `"r": "desintegrar"`. Depois, basta atualizar a página no celular: o `config.json` é lido a cada acesso, então não precisa reiniciar. Mudanças em arquivos `.js` do servidor precisam de `sudo systemctl restart xadrez`.

## Diagnóstico de problemas (item 3.7)

A ordem de raciocínio é sempre: **o processo existe? → a porta está em escuta? → responde localmente? → só então o acesso externo.**

| Sintoma | Como diagnosticar | Como resolver |
|---|---|---|
| Processo parado | `systemctl status xadrez` mostra *inactive*; `sudo ss -lntp \| grep 3000` não mostra nada | `sudo systemctl start xadrez` |
| Porta diferente | `sudo ss -lntp` mostra outra porta; conferir `PORT` no `.env` e `journalctl -u xadrez` | Corrigir o `.env` ou rodar o cloudflared na porta certa |
| Só em 127.0.0.1 | `ss -lntp` mostra `127.0.0.1:3000`. O túnel **continua funcionando** (o cloudflared está na mesma máquina), mas outro PC na rede local ou pelo Tailscale não acessa | `HOST=0.0.0.0` no `.env` + `sudo systemctl restart xadrez` |
| cloudflared encerrado | A URL pública para de abrir, mas `curl -i http://127.0.0.1:3000/` funciona; `ps aux \| grep cloudflared` | Rodar de novo (a URL **muda**) |
| SSH parado | `ssh` dá *connection refused*; no console da máquina: `systemctl status ssh` | `sudo systemctl start ssh` |
| Firewall | `sudo ufw status`; local funciona, de outro PC dá *timeout* | `sudo ufw allow 22/tcp` (SSH) ou `sudo ufw allow 3000/tcp` |
| `config.json` quebrado | O site mostra o aviso "config.json inválido" com a linha do erro; `journalctl -u xadrez` | Corrigir o JSON (vírgulas e aspas) |

**Por que não precisa abrir porta no roteador?** O `cloudflared` faz uma conexão de **saída** até o Cloudflare e as requisições voltam por ela. Nenhuma conexão de entrada chega ao roteador.

## 7–13. Evidências (preencher)

- [ ] 7. Print de `sudo ss -lntp` mostrando a porta 3000
- [ ] 8. Print do `curl -i http://127.0.0.1:3000/` ou do navegador no servidor
- [ ] 9. Comando do túnel: `cloudflared tunnel --url http://localhost:3000`
- [ ] 10. Print da URL `trycloudflare.com`
- [ ] 11. Print do celular no 4G abrindo o jogo (com a barra de status do celular aparecendo)
- [ ] 12. Um problema encontrado e como foi diagnosticado: _descrever_
- [ ] 13. Link do repositório: _colar_

## Próximos passos

- [ ] Bot: Stockfish (versão lite single-threaded) num Web Worker, como novo controlador em `controladores.js`
- [ ] Online: salas em `salas.js` + controlador remoto, link e QR code da sala
- [ ] Testar a IA real com o token do Cloudflare e ajustar o prompt em `ia.js`
