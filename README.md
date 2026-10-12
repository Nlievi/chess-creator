# Xadrez IA

Jogo de xadrez no navegador com três modos (mesmo PC, contra o computador e online), peças personalizadas com personagens ou com fotos transformadas por IA, e animações de captura (espada, esmagamento, coice, feitiço; no xeque-mate o rei explode).

Trabalho bimestral de **Infraestrutura de Servidores** (Prof. Lucca Abbado Neres — FAG): o jogo roda num computador Linux que faz o papel de servidor e é publicado na Web com **Cloudflare Tunnel**.

## 1. Integrantes

| Nome | Função |
|---|---|
| _preencher_ | Infraestrutura (servidor, SSH, túnel, systemd) |
| _preencher_ | Jogo + animações |
| _preencher_ | Online + bot |
| _preencher_ | IA + personalização |

## 2. O serviço

- **Modos de jogo:**
  - **Mesmo PC:** dois jogadores se revezam no mesmo aparelho.
  - **Contra o computador:** Stockfish 19 (versão "lite", uma thread) rodando no navegador, em 3 níveis.
  - **Online:** quem cria a sala recebe um código de 4 letras, um link e um QR code; o adversário entra de outro aparelho, em qualquer rede. O servidor confere cada jogada com o chess.js (ninguém consegue mandar jogada ilegal ou fora da vez).
- **Temas:** Clássico, Ouro e Rubi, Neon, Gelo e Fogo, Madeira.
- **Peças personalizadas** (botão "Colocar fotos nas peças"):
  - **Personagem:** o busto do personagem sai de um pedestal de xadrez com um medalhão que mostra o tipo da peça. Instantâneo, funciona sem internet e com personagens famosos.
  - **Foto de pessoa:** a IA do Cloudflare desenha a peça com a cabeça da pessoa.
- **Times guardados no servidor:** o botão "Guardar estes times no servidor" mostra um trecho para colar no `config.json` (campo `timesPadrao`). Qualquer aparelho que abrir o jogo pela primeira vez começa com esses times, mesmo depois que a URL do túnel muda.
- **Animações de captura** (dependem de quem captura; trocáveis no `config.json`):

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
| Tecnologias | Node.js + Express, Socket.IO, chess.js, Stockfish (WASM), HTML/CSS/JS puro, Web Animations API, Web Audio API, Cloudflare Workers AI, systemd, Cloudflare Tunnel, Tailscale |
| Comando para iniciar | `sudo systemctl start xadrez` (o serviço executa `node server.js` em `/opt/xadrez-ia`) |
| Porta | **3000** (variável `PORT` no `.env`) |

Caminho de uma requisição:

```
navegador (celular no 4G) → Cloudflare → cloudflared (serviço xadrez-tunel) → http://localhost:3000 → node server.js (serviço xadrez)
```

## Instalação no servidor (Ubuntu Server 24.04)

**1. Copiar o projeto do Windows para o servidor** (PowerShell no Windows; troque `usuario` e o IP):

```powershell
tar -czf "$env:USERPROFILE\Desktop\xadrez-ia.tar.gz" --exclude=node_modules --exclude=data --exclude=.claude -C "$env:USERPROFILE\Desktop" xadrez-ia
scp "$env:USERPROFILE\Desktop\xadrez-ia.tar.gz" usuario@192.168.0.50:~/
```

O pacote inclui o `.env` com o token da IA: não compartilhe esse arquivo.

**2. No servidor:**

```bash
tar -xzf xadrez-ia.tar.gz
sudo bash xadrez-ia/deploy/instalar.sh
sudo tailscale up                       # uma vez: abra o link e entre com a conta do grupo
bash /opt/xadrez-ia/deploy/tunel.sh     # mostra a URL pública
```

O `deploy/instalar.sh` instala Node.js, cloudflared, Tailscale, tmux e ufw; deixa o `sshd` escutando direto na porta 22; cria o usuário de sistema `xadrez` (que roda o jogo) e o grupo `xadrez` (os integrantes, que podem editar); copia o jogo para `/opt/xadrez-ia`; e instala os serviços `xadrez` e `xadrez-tunel`. Rodar de novo atualiza o jogo.

**3. Contas dos integrantes** (cada um entra pelo SSH com a sua):

```bash
sudo adduser NOME
sudo usermod -aG sudo,xadrez NOME
```

**Atualizar o jogo:** copie o pacote novo, extraia por cima e rode `sudo bash xadrez-ia/deploy/instalar.sh` de novo. Se usarem Git no servidor: `cd /opt/xadrez-ia && git pull && npm ci --omit=dev && sudo systemctl restart xadrez`.

## Rodar no seu computador (desenvolvimento)

```bash
npm install
cp .env.example .env     # opcional: sem ele roda na porta 3000, sem a IA
npm run dev              # reinicia sozinho quando um arquivo .js do servidor muda
```

Abra `http://localhost:3000`.

## Estrutura

```
server.js            Express: site, /api/config, /api/status, /api/gerar, /api/pecas + limites de uso
salas.js             Modo online: salas com Socket.IO, jogadas conferidas com o chess.js
ia.js                Geração das peças com a IA do Cloudflare (Workers AI)
config.json          Textos, cores, animações e times padrão; lido a cada acesso (edite via SSH!)
.env                 Porta, endereço e chaves da IA (fora do Git)
deploy/instalar.sh   Instalação completa no Ubuntu
deploy/tunel.sh      Mostra a URL pública (e liga o túnel se estiver desligado)
deploy/xadrez.service, deploy/xadrez-tunel.service   Serviços do systemd
data/pecas/          Peças personalizadas (fora do Git)
public/
  index.html, css/style.css
  js/main.js          Telas, menus, modo online
  js/partida.js       Regras e turnos (chess.js) + chama as animações
  js/tabuleiro.js     Desenho do tabuleiro e das peças
  js/controladores.js Quem joga cada lado: local, bot (Stockfish) ou remoto (online)
  js/animacoes.js     Efeitos de captura e de xeque-mate
  js/particulas.js    Faíscas, poeira, cinzas
  js/sons.js          Sons sintetizados (sem arquivos de áudio)
  js/pecas.js         Peças em SVG e temas
  js/personalizar.js  Janela "Colocar fotos nas peças"
  js/recorte.js       Reduz a foto e remove o fundo
  js/personagem.js    Modo Personagem: busto num pedestal de xadrez com medalhão
  vendor/stockfish/   Stockfish 19 lite (licença GPL-3, ver LICENCA-GPL3.txt)
  teste-animacoes.html
```

## IA gratuita (Cloudflare Workers AI)

Sem configuração, o modo **Personagem** funciona normalmente (não usa IA) e o modo **Foto de pessoa** fica desativado. Para ativar:

1. Crie uma conta gratuita no Cloudflare.
2. No painel: **AI → Workers AI → Use REST API**. Copie o **Account ID** e crie um **API Token**.
3. Coloque os dois no `.env` do servidor (`sudo nano /opt/xadrez-ia/.env`) e reinicie: `sudo systemctl restart xadrez`.
4. O rodapé do site passa a mostrar `IA: cloudflare`.

Detalhes:
- Modelo `@cf/black-forest-labs/flux-2-klein-4b`, cerca de 7 segundos por peça. A cota grátis é diária (10.000 "neurons").
- Limites do servidor: 40 gerações por hora por pessoa (`IA_LIMITE_POR_HORA`) e 300 por dia no total (`IA_LIMITE_DIA`).
- Atrás do túnel toda requisição chega de 127.0.0.1; o IP real vem no cabeçalho `CF-Connecting-IP`, que só é aceito quando a conexão vem da própria máquina (o cloudflared). Quem acessa a porta 3000 direto não consegue inventar um IP.
- O filtro de conteúdo do Cloudflare **bloqueia personagens protegidos por direitos autorais** (testado com o Perna Longa). Para eles, use o modo Personagem.
- A chave fica só no servidor (`.env` com permissão 640) e nunca vai para o navegador nem para o Git.

## Demonstração: alteração remota por SSH (item 3.6)

```bash
ssh usuario@<ip-do-tailscale>
nano /opt/xadrez-ia/config.json
```

Exemplos: trocar `"mensagemBoasVindas"`, trocar `"r": "esmagar"` por `"r": "desintegrar"` (a torre passa a desintegrar), ou colar times novos em `"timesPadrao"`. Depois basta dar F5 no celular: o `config.json` é lido a cada acesso. Mudanças no `.env` ou em arquivos `.js` do servidor precisam de `sudo systemctl restart xadrez`.

## Diagnóstico de problemas (item 3.7)

A ordem de raciocínio é sempre: **o processo existe? → a porta está em escuta? → responde localmente? → só então o acesso externo.**

| Sintoma | Como diagnosticar | Como resolver |
|---|---|---|
| Processo parado | `systemctl status xadrez` mostra *inactive*; `sudo ss -lntp \| grep 3000` não mostra nada; a URL pública dá erro 502 do Cloudflare | `sudo systemctl start xadrez` |
| Porta diferente | `sudo ss -lntp` mostra outra porta; conferir `PORT` no `.env` e `journalctl -u xadrez` | Corrigir o `.env` e reiniciar o serviço |
| Só em 127.0.0.1 | `ss -lntp` mostra `127.0.0.1:3000`. O túnel **continua funcionando** (o cloudflared está na mesma máquina), mas outro PC da rede local ou do Tailscale não acessa | `HOST=0.0.0.0` no `.env` + `sudo systemctl restart xadrez` |
| cloudflared encerrado | A URL pública para de abrir, mas `curl -i http://127.0.0.1:3000/` funciona; `systemctl status xadrez-tunel` mostra *inactive* | `bash /opt/xadrez-ia/deploy/tunel.sh` (a URL **muda**) |
| SSH parado | `ssh` dá *connection refused*; no teclado do servidor: `systemctl status ssh` | `sudo systemctl start ssh` |
| Firewall | `sudo ufw status`; local funciona, de outro PC dá *timeout* (não "refused") | `sudo ufw allow 22/tcp` (SSH) ou `sudo ufw allow 3000/tcp` |
| `config.json` quebrado | O site mostra o aviso "config.json inválido" com a linha do erro; `journalctl -u xadrez` | Corrigir o JSON (vírgulas e aspas) |

**Por que não precisa abrir porta no roteador?** O `cloudflared` faz uma conexão de **saída** até o Cloudflare e as requisições voltam por ela. Nenhuma conexão de entrada chega ao roteador.

## 7–13. Evidências (preencher)

- [ ] 7. Print de `sudo ss -lntp` mostrando a porta 3000
- [ ] 8. Print do `curl -i http://127.0.0.1:3000/` ou do navegador no servidor
- [ ] 9. Comando do túnel: `cloudflared tunnel --url http://localhost:3000` (no serviço `xadrez-tunel`)
- [ ] 10. Print da URL `trycloudflare.com` (saída do `deploy/tunel.sh`)
- [ ] 11. Print do celular no 4G abrindo o jogo (com a barra de status do celular aparecendo)
- [ ] 12. Um problema encontrado e como foi diagnosticado: _descrever_ (sugestão: no desenvolvimento, o servidor subia em "IA: simulado" mesmo com o token no `.env`. A linha de inicialização do log mostrou que o `.env` não estava sendo lido; o processo rodava a partir de outra pasta, sem `.env`. Corrigido apontando o serviço para a pasta certa e passando a registrar no log se o `.env` foi carregado.)
- [ ] 13. Link do repositório: _colar_
