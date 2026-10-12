// Servidor do Xadrez IA: entrega o site, a configuração, a geração de peças por IA e as salas online.
const path = require('node:path');

// Lê o .env (se existir) antes de qualquer outra coisa. Leitor próprio para funcionar em qualquer versão do Node.
// Uma variável já preenchida no ambiente tem prioridade sobre o .env.
function carregarEnv(arquivo) {
  let texto;
  try { texto = require('node:fs').readFileSync(arquivo, 'utf8'); } catch { return false; }
  for (const linha of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    const encontrado = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!encontrado || process.env[encontrado[1]]) continue;
    process.env[encontrado[1]] = encontrado[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return true;
}
const envCarregado = carregarEnv(path.join(__dirname, '.env'));

const fs = require('node:fs/promises');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const { Server } = require('socket.io');
const { gerarPeca, provedorAtual } = require('./ia');
const { registrarSalas } = require('./salas');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ARQUIVO_CONFIG = path.join(__dirname, 'config.json');
const PASTA_PECAS = path.join(__dirname, 'data', 'pecas');
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const UMA_HORA = 60 * 60 * 1000;

const app = express();

// Log de cada requisição (aparece no `journalctl -u xadrez`). Arquivos estáticos ficam de fora para não poluir.
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    if (/\.(js|css|svg|png|jpg|ico|map|wasm)$/.test(req.path)) return;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio} ms)`);
  });
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/chess.js', express.static(path.join(__dirname, 'node_modules', 'chess.js', 'dist', 'esm')));
app.use('/vendor/qrcode', express.static(path.join(__dirname, 'node_modules', 'qrcode-generator')));
app.use('/pecas', express.static(PASTA_PECAS, { maxAge: '7d' }));

// ---------- quem é o visitante ----------

// Pelo Cloudflare Tunnel toda requisição chega do cloudflared, ou seja, de 127.0.0.1; o IP real vem no
// cabeçalho CF-Connecting-IP. Só confiamos nesse cabeçalho quando a conexão vem da própria máquina:
// quem acessa a porta 3000 direto (rede local, Tailscale) não consegue inventar um IP.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function ipDoCliente(req) {
  const origem = req.socket.remoteAddress;
  return (LOOPBACK.has(origem) && req.headers['cf-connecting-ip']) || origem;
}

// Janela deslizante de 1 hora por IP. Os IPs antigos são apagados de tempos em tempos.
function criarLimite(maximoPorHora) {
  const usos = new Map();
  setInterval(() => {
    const agora = Date.now();
    for (const [ip, lista] of usos) {
      const recentes = lista.filter((t) => agora - t < UMA_HORA);
      if (recentes.length) usos.set(ip, recentes);
      else usos.delete(ip);
    }
  }, 10 * 60 * 1000).unref();
  return (ip) => {
    const agora = Date.now();
    const recentes = (usos.get(ip) || []).filter((t) => agora - t < UMA_HORA);
    const permitido = recentes.length < maximoPorHora;
    if (permitido) recentes.push(agora);
    usos.set(ip, recentes);
    return permitido;
  };
}

// ---------- configuração e status ----------

// O config.json é lido a cada requisição: editar via SSH e dar F5 já mostra a mudança, sem reiniciar.
app.get('/api/config', async (req, res) => {
  try {
    res.json(JSON.parse(await fs.readFile(ARQUIVO_CONFIG, 'utf8')));
  } catch (erro) {
    console.error('config.json inválido:', erro.message);
    res.status(500).json({ erro: `config.json inválido: ${erro.message}` });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ servidor: os.hostname(), porta: PORT, ligadoHaSegundos: Math.round(process.uptime()), ia: provedorAtual() });
});

// ---------- IA ----------

// Por pessoa e por dia (o dia inteiro do servidor): protege a cota gratuita do Cloudflare
const limiteIaPorIp = criarLimite(Number(process.env.IA_LIMITE_POR_HORA) || 40);
const limiteIaPorDia = Number(process.env.IA_LIMITE_DIA) || 300;
let geracoesHoje = { dia: new Date().toDateString(), total: 0 };

// Recebe a foto, pede para a IA transformar em peça e devolve a imagem gerada (ainda com fundo).
app.post('/api/gerar', async (req, res) => {
  const { foto, peca, tema, cor, descricao } = req.body || {};
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(foto || '')) {
    return res.status(400).json({ erro: 'Envie uma foto em PNG, JPG ou WEBP.' });
  }
  if (typeof peca !== 'string' || !/^[kqrbnp]$/.test(peca) || !['w', 'b'].includes(cor)) {
    return res.status(400).json({ erro: 'Peça ou cor inválida.' });
  }
  // Os limites só valem para a IA de verdade (que gasta cota); o modo simulado é de graça
  if (provedorAtual() !== 'simulado') {
    const hoje = new Date().toDateString();
    if (geracoesHoje.dia !== hoje) geracoesHoje = { dia: hoje, total: 0 };
    if (geracoesHoje.total >= limiteIaPorDia) {
      return res.status(429).json({ erro: 'A cota de IA do servidor para hoje acabou. Use o modo Personagem.' });
    }
    if (!limiteIaPorIp(ipDoCliente(req))) {
      return res.status(429).json({ erro: 'Limite de gerações por hora atingido. Tente mais tarde.' });
    }
    geracoesHoje.total++;
  }
  try {
    const imagem = await gerarPeca({ foto, peca, tema, cor, descricao });
    res.json({ imagem, provedor: provedorAtual() });
  } catch (erro) {
    console.error('[IA]', erro.message);
    res.status(erro.bloqueado ? 422 : 502).json({ erro: `A IA não conseguiu gerar a peça: ${erro.message}`, bloqueado: !!erro.bloqueado });
  }
});

// ---------- peças personalizadas ----------

// Teto da pasta data/pecas, para ninguém encher o disco do servidor pela URL pública
const LIMITE_PECAS = Number(process.env.PECAS_MAXIMO) || 3000;
const limitePecasPorIp = criarLimite(150);
let pecasNaPasta = 0;
fs.readdir(PASTA_PECAS).then((arquivos) => { pecasNaPasta = arquivos.length; }, () => {});

// Guarda a peça final (PNG já sem fundo) para poder ser usada por outros jogadores e aparelhos.
app.post('/api/pecas', async (req, res) => {
  if (!limitePecasPorIp(ipDoCliente(req))) {
    return res.status(429).json({ erro: 'Muitas peças salvas em pouco tempo. Tente mais tarde.' });
  }
  if (pecasNaPasta >= LIMITE_PECAS) {
    return res.status(507).json({ erro: 'O servidor atingiu o limite de peças guardadas.' });
  }
  const encontrado = /^data:image\/png;base64,(.+)$/.exec(req.body?.imagem || '');
  if (!encontrado) return res.status(400).json({ erro: 'Envie a peça como PNG.' });
  const dados = Buffer.from(encontrado[1], 'base64');
  if (!dados.subarray(0, 8).equals(ASSINATURA_PNG)) return res.status(400).json({ erro: 'Arquivo não é um PNG válido.' });
  if (dados.length > 600 * 1024) return res.status(413).json({ erro: 'Imagem muito grande.' });

  try {
    const nome = `${crypto.randomBytes(8).toString('hex')}.png`;
    await fs.mkdir(PASTA_PECAS, { recursive: true });
    await fs.writeFile(path.join(PASTA_PECAS, nome), dados);
    pecasNaPasta++;
    res.json({ url: `/pecas/${nome}` });
  } catch (erro) {
    console.error('[peças] não consegui gravar:', erro.message);
    res.status(500).json({ erro: 'O servidor não conseguiu guardar a peça (permissão da pasta data/pecas?).' });
  }
});

// Erros não tratados (JSON malformado, corpo grande demais...) viram uma mensagem curta, sem detalhes internos
app.use((erro, req, res, next) => {
  const status = erro.status || erro.statusCode || 500;
  if (status >= 500) console.error('[erro]', erro.message);
  res.status(status).json({ erro: status === 413 ? 'Envio grande demais.' : status < 500 ? 'Requisição inválida.' : 'Erro interno do servidor.' });
});

const servidor = http.createServer(app);
registrarSalas(new Server(servidor));

servidor.listen(PORT, HOST, () => {
  console.log(`Xadrez IA rodando em http://${HOST}:${PORT} (IA: ${provedorAtual()}, .env: ${envCarregado ? 'carregado' : 'não encontrado'}, Node ${process.version})`);
});
