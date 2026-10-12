// Servidor do Xadrez IA: entrega o site, a configuração e a geração de peças por IA.
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

const app = express();

// Log de cada requisição (aparece no `journalctl -u xadrez`). Arquivos estáticos ficam de fora para não poluir.
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    if (/\.(js|css|svg|png|ico|map)$/.test(req.path)) return;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio} ms)`);
  });
  next();
});

app.use(express.json({ limit: '3mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/chess.js', express.static(path.join(__dirname, 'node_modules', 'chess.js', 'dist', 'esm')));
app.use('/pecas', express.static(PASTA_PECAS, { maxAge: '7d' }));

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

// Limite de gerações por pessoa. Atrás do Cloudflare Tunnel toda requisição chega de 127.0.0.1,
// então o IP real vem no cabeçalho CF-Connecting-IP.
const usosPorIp = new Map();
function dentroDoLimite(req) {
  const ip = req.get('cf-connecting-ip') || req.ip;
  const limite = Number(process.env.IA_LIMITE_POR_HORA) || 20;
  const agora = Date.now();
  const recentes = (usosPorIp.get(ip) || []).filter((t) => agora - t < 60 * 60 * 1000);
  const permitido = recentes.length < limite;
  if (permitido) recentes.push(agora);
  usosPorIp.set(ip, recentes);
  return permitido;
}

// Recebe a foto, pede para a IA transformar em peça e devolve a imagem gerada (ainda com fundo).
app.post('/api/gerar', async (req, res) => {
  const { foto, peca, tema, cor, descricao } = req.body || {};
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(foto || '')) {
    return res.status(400).json({ erro: 'Envie uma foto em PNG, JPG ou WEBP.' });
  }
  if (typeof peca !== 'string' || !/^[kqrbnp]$/.test(peca) || !['w', 'b'].includes(cor)) {
    return res.status(400).json({ erro: 'Peça ou cor inválida.' });
  }
  // O limite só vale para a IA de verdade (que gasta cota); o modo simulado é de graça
  if (provedorAtual() !== 'simulado' && !dentroDoLimite(req)) {
    return res.status(429).json({ erro: 'Limite de gerações por hora atingido. Tente mais tarde.' });
  }
  try {
    const imagem = await gerarPeca({ foto, peca, tema, cor, descricao });
    res.json({ imagem, provedor: provedorAtual() });
  } catch (erro) {
    console.error('[IA]', erro.message);
    res.status(erro.bloqueado ? 422 : 502).json({ erro: `A IA não conseguiu gerar a peça: ${erro.message}`, bloqueado: !!erro.bloqueado });
  }
});

// Guarda a peça final (PNG já sem fundo) para poder ser usada por outros jogadores no modo online.
app.post('/api/pecas', async (req, res) => {
  const encontrado = /^data:image\/png;base64,(.+)$/.exec(req.body?.imagem || '');
  if (!encontrado) return res.status(400).json({ erro: 'Envie a peça como PNG.' });
  const dados = Buffer.from(encontrado[1], 'base64');
  if (!dados.subarray(0, 8).equals(ASSINATURA_PNG)) return res.status(400).json({ erro: 'Arquivo não é um PNG válido.' });
  if (dados.length > 1.5 * 1024 * 1024) return res.status(413).json({ erro: 'Imagem muito grande.' });

  const nome = `${crypto.randomBytes(8).toString('hex')}.png`;
  await fs.mkdir(PASTA_PECAS, { recursive: true });
  await fs.writeFile(path.join(PASTA_PECAS, nome), dados);
  res.json({ url: `/pecas/${nome}` });
});

const servidor = http.createServer(app);
registrarSalas(new Server(servidor));

servidor.listen(PORT, HOST, () => {
  console.log(`Xadrez IA rodando em http://${HOST}:${PORT} (IA: ${provedorAtual()}, .env: ${envCarregado ? 'carregado' : 'não encontrado'}, Node ${process.version})`);
});
