// Geração de peças com IA (Cloudflare Workers AI, cota gratuita diária; modelo FLUX.2 [klein]).
// A foto vai junto: a cabeça da pessoa (cores reais) vira o topo de uma peça no material do time.
// Personagens famosos (protegidos por direitos autorais) são bloqueados pelo filtro de conteúdo do Cloudflare;
// para eles o jogo usa o modo "personagem" (public/js/personagem.js), que monta a peça no navegador.
// Provedor "simulado" (sem token no .env): devolve a própria foto; serve só para testar a rota sem chave.

const NOMES_PECAS = {
  k: 'king',
  q: 'queen',
  r: 'rook (castle tower)',
  b: 'bishop',
  n: 'knight (horse)',
  p: 'pawn',
};

// Cada tema do jogo tem um material para as brancas (w) e outro para as pretas (b)
const MATERIAIS = {
  classico: { w: 'polished ivory', b: 'polished black ebony' },
  realeza: { w: 'shining gold with small jewels', b: 'deep ruby red with gold trim' },
  neon: { w: 'glowing cyan neon, cyberpunk style', b: 'glowing magenta neon, cyberpunk style' },
  elementos: { w: 'translucent blue ice crystal', b: 'fire and glowing molten lava' },
  madeira: { w: 'light hand-carved wood', b: 'dark hand-carved wood' },
};

// O que deixa cada peça reconhecível no tabuleiro
const DETALHES_PECAS = {
  k: 'wearing a royal crown with a small cross on top',
  q: 'wearing an elegant queen crown',
  r: 'with the body shaped like a castle tower with battlements',
  b: 'wearing a tall bishop mitre',
  n: 'with the body shaped like a chess knight horse',
  p: 'with a simple short pawn body',
};

function provedorAtual() {
  return process.env.IA_PROVEDOR || (process.env.CLOUDFLARE_API_TOKEN ? 'cloudflare' : 'simulado');
}

// Texto livre digitado pelo jogador: só letras, números e pontuação simples
function limparDescricao(texto, limite = 60) {
  return String(texto || '').replace(/[^\p{L}\p{N} .,'()-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

// Prompts no formato de "edição" (transforme X em Y, mantenha Z), que o FLUX.2 segue melhor
const PROMPTS = {
  pessoa: ({ quem, peca, material, detalhe }) =>
    `Turn the person in image 1${quem ? ` (${quem})` : ''} into a ${peca} chess piece. ` +
    `Keep the head identical to image 1: same face, hair, colors and expression, instantly recognizable, ` +
    `${detalhe}. Replace the body with a polished ${material} Staunton chess ${peca} body and round base. ` +
    `3D render of a collectible chess piece, whole piece visible, centered, front view, studio lighting, ` +
    `plain pure white background, no text.`,
};

function montarPrompt({ peca, tema, cor, descricao }) {
  const material = MATERIAIS[tema]?.[cor] ?? (cor === 'w' ? 'white marble' : 'black marble');
  return PROMPTS.pessoa({ peca: NOMES_PECAS[peca], material, detalhe: DETALHES_PECAS[peca], quem: limparDescricao(descricao) });
}

function dataUrlParaBlob(dataUrl) {
  const [cabecalho, base64] = dataUrl.split(',');
  const tipo = /^data:(.*?);/.exec(cabecalho)[1];
  return new Blob([Buffer.from(base64, 'base64')], { type: tipo });
}

function tipoDaImagem(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.subarray(0, 4).toString() === 'RIFF') return 'image/webp';
  return 'image/png';
}

async function viaCloudflare(opcoes) {
  const conta = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!conta || !token) throw new Error('faltam CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN no .env');
  const modelo = process.env.CLOUDFLARE_MODELO || '@cf/black-forest-labs/flux-2-klein-4b';

  const form = new FormData();
  form.append('prompt', montarPrompt(opcoes));
  form.append('input_image_0', dataUrlParaBlob(opcoes.foto), 'foto');
  form.append('width', '512');
  form.append('height', '512');

  // O filtro de conteúdo do Cloudflare às vezes bloqueia um resultado ao acaso; tenta até 3 vezes.
  // Personagens famosos (protegidos por direitos autorais) costumam ser bloqueados sempre.
  let resposta;
  for (let tentativa = 1; ; tentativa++) {
    resposta = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/ai/run/${modelo}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    if (resposta.ok) break;
    const corpo = await resposta.text();
    if (!/flagged/i.test(corpo)) throw new Error(`Cloudflare respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    console.log(`[IA] resultado bloqueado pelo filtro de conteúdo (tentativa ${tentativa} de 3)`);
    if (tentativa === 3) {
      const erro = new Error('o filtro de conteúdo do Cloudflare bloqueou o resultado (acontece com personagens famosos).');
      erro.bloqueado = true;
      throw erro;
    }
  }

  let imagem;
  if ((resposta.headers.get('content-type') || '').startsWith('image/')) {
    imagem = Buffer.from(await resposta.arrayBuffer());
  } else {
    const json = await resposta.json();
    const base64 = json?.result?.image;
    if (!base64) throw new Error(`resposta sem imagem: ${JSON.stringify(json).slice(0, 300)}`);
    imagem = Buffer.from(base64, 'base64');
  }
  return `data:${tipoDaImagem(imagem)};base64,${imagem.toString('base64')}`;
}

// Sem IA generativa: devolve a própria foto (para testar a rota sem chave)
async function simulado({ foto }) {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return foto;
}

async function gerarPeca(opcoes) {
  return provedorAtual() === 'cloudflare' ? viaCloudflare(opcoes) : simulado(opcoes);
}

module.exports = { gerarPeca, provedorAtual, montarPrompt, PROMPTS };
