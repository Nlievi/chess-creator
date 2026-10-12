// Tratamento das imagens no navegador (sem custo para o servidor):
// - reduzirFoto: diminui a foto antes de enviar (a IA do Cloudflare aceita imagens menores que 512x512)
// - recortarFundo: tira o fundo liso (ou já transparente) e devolve só o conteúdo
// - enquadrar: centraliza o recorte num quadrado, apoiado embaixo

export function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    img.src = src;
  });
}

export function novoCanvas(largura, altura) {
  const c = document.createElement('canvas');
  c.width = largura;
  c.height = altura;
  return c;
}

// Prepara a foto para a IA: fundo transparente vira branco, sobras de fundo liso são cortadas
// (a figura ocupa a imagem toda, a IA enxerga mais detalhes) e o resultado é um quadrado de até `maximo` px.
export async function reduzirFoto(arquivo, maximo = 500) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await carregarImagem(url);
    // Foto de celular tem 12 a 48 megapixels: reduz para no máximo 1024 px ANTES de analisar,
    // senão a análise usa centenas de MB de memória e trava a página
    const reducao = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * reducao));
    const h = Math.max(1, Math.round(img.naturalHeight * reducao));
    const base = novoCanvas(w, h);
    const bctx = base.getContext('2d', { willReadFrequently: true });
    bctx.fillStyle = '#fff';
    bctx.fillRect(0, 0, w, h);
    bctx.drawImage(img, 0, 0, w, h);

    const dados = bctx.getImageData(0, 0, w, h);
    const fundo = corDoFundo(dados.data, w, h);
    const caixa = apagarFundo(dados.data, w, h, 30);
    const lado = Math.max(caixa.largura, caixa.altura) * 1.12;
    const escala = Math.min(1, maximo / lado);
    const saida = novoCanvas(Math.round(lado * escala), Math.round(lado * escala));
    const ctx = saida.getContext('2d');
    // A margem usa a cor do fundo da própria foto (branco criaria uma "parede" e o fundo não sairia depois)
    ctx.fillStyle = `rgb(${fundo.map(Math.round).join(',')})`;
    ctx.fillRect(0, 0, saida.width, saida.height);
    ctx.drawImage(base, caixa.x, caixa.y, caixa.largura, caixa.altura,
      (saida.width - caixa.largura * escala) / 2, (saida.height - caixa.altura * escala) / 2,
      caixa.largura * escala, caixa.altura * escala);
    return saida.toDataURL('image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Média das cores dos 4 cantos (ignorando pixels transparentes): é a cor do fundo
function corDoFundo(d, w, h) {
  const soma = [0, 0, 0];
  let n = 0;
  const lado = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  for (const [cx, cy] of [[0, 0], [w - lado, 0], [0, h - lado], [w - lado, h - lado]]) {
    for (let y = cy; y < cy + lado; y++) {
      for (let x = cx; x < cx + lado; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 16) continue;
        soma[0] += d[i];
        soma[1] += d[i + 1];
        soma[2] += d[i + 2];
        n++;
      }
    }
  }
  return n ? soma.map((v) => v / n) : [255, 255, 255];
}

// "Balde de tinta" a partir das bordas: o que é parecido com o fundo e encosta na borda fica transparente
// (altera os pixels de `d`). Funciona bem com desenhos e com o fundo branco da IA; em fotos reais com fundo
// claro parecido com a pele não dá para ir além disso sem "comer" o rosto. Devolve a caixa do conteúdo.
function apagarFundo(d, w, h, tolerancia) {
  const fundo = corDoFundo(d, w, h);
  const ehFundo = (i) =>
    d[i * 4 + 3] < 16 ||
    Math.hypot(d[i * 4] - fundo[0], d[i * 4 + 1] - fundo[1], d[i * 4 + 2] - fundo[2]) <= tolerancia;

  // Cada pixel entra na pilha no máximo uma vez (marcado ao entrar): a memória fica limitada ao tamanho da imagem
  const visitado = new Uint8Array(w * h);
  const pilha = new Int32Array(w * h);
  let topo = 0;
  const empilhar = (i) => {
    if (visitado[i]) return;
    visitado[i] = 1;
    pilha[topo++] = i;
  };
  for (let x = 0; x < w; x++) { empilhar(x); empilhar((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { empilhar(y * w); empilhar(y * w + w - 1); }
  while (topo) {
    const i = pilha[--topo];
    if (!ehFundo(i)) continue;
    d[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) empilhar(i - 1);
    if (x < w - 1) empilhar(i + 1);
    if (i >= w) empilhar(i - w);
    if (i < w * (h - 1)) empilhar(i + w);
  }

  // Borda mais suave: pixels encostados no fundo ficam semitransparentes
  const transparente = (i) => d[i * 4 + 3] === 0;
  for (let i = 0; i < w * h; i++) {
    if (transparente(i)) continue;
    const x = i % w;
    if ((x > 0 && transparente(i - 1)) || (x < w - 1 && transparente(i + 1)) ||
        (i >= w && transparente(i - w)) || (i < w * (h - 1) && transparente(i + w))) {
      d[i * 4 + 3] = Math.min(d[i * 4 + 3], 140);
    }
  }

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) [minX, minY, maxX, maxY] = [0, 0, w - 1, h - 1];
  return { x: minX, y: minY, largura: maxX - minX + 1, altura: maxY - minY + 1 };
}

// Tira o fundo e devolve um canvas recortado no conteúdo que sobrou.
// `recorte.deslocamento` guarda onde esse conteúdo estava na imagem original.
export async function recortarFundo(src, { tolerancia = 42 } = {}) {
  const img = await carregarImagem(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = novoCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const dados = ctx.getImageData(0, 0, w, h);
  const caixa = apagarFundo(dados.data, w, h, tolerancia);
  ctx.putImageData(dados, 0, 0);

  const recorte = novoCanvas(caixa.largura, caixa.altura);
  recorte.getContext('2d').drawImage(c, caixa.x, caixa.y, caixa.largura, caixa.altura, 0, 0, caixa.largura, caixa.altura);
  recorte.deslocamento = { x: caixa.x, y: caixa.y };
  return recorte;
}

// Centraliza o recorte num quadrado transparente, apoiado embaixo (usado para as peças feitas pela IA)
export function enquadrar(recorte, tamanho = 256) {
  const saida = novoCanvas(tamanho, tamanho);
  const margem = tamanho * 0.04;
  const escala = Math.min((tamanho - 2 * margem) / recorte.width, (tamanho - 2 * margem) / recorte.height);
  const dw = recorte.width * escala;
  const dh = recorte.height * escala;
  saida.getContext('2d').drawImage(recorte, (tamanho - dw) / 2, tamanho - margem - dh, dw, dh);
  return saida.toDataURL('image/png');
}
