// Modo "Personagem": o busto do personagem (cores originais) sai de um pedestal de xadrez,
// com aros dourados e um medalhão dourado com a silhueta da peça na frente.
// O pedestal usa a paleta do tema do time (marfim, ébano, rubi...), para saber de que lado a peça é.
// Tudo em coordenadas de 0 a 100 e desenhado num canvas de 256 px.

import { carregarImagem, novoCanvas } from './recorte.js';
import { FORMAS } from './pecas.js';

const TAMANHO = 256;
const U = TAMANHO / 100;

const hexParaRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbParaHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const misturar = (a, b, t) => rgbParaHex(hexParaRgb(a).map((v, i) => v + (hexParaRgb(b)[i] - v) * t));

function svgPedestal(tipo, paleta) {
  const borda = misturar(paleta.g2, paleta.contorno, 0.55);
  const silhueta = (cor, detalhe, dx, dy) =>
    `<g transform="translate(${50 + dx} ${83 + dy}) scale(0.185) translate(-50 -50)" fill="${cor}" stroke="none">${FORMAS[tipo](detalhe)}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${TAMANHO}" height="${TAMANHO}">
    <defs>
      <linearGradient id="madeira" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="${borda}"/><stop offset="0.28" stop-color="${paleta.g1}"/>
        <stop offset="0.62" stop-color="${paleta.g2}"/><stop offset="1" stop-color="${borda}"/>
      </linearGradient>
      <linearGradient id="ouro" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#a87412"/><stop offset="0.3" stop-color="#ffe7a0"/>
        <stop offset="0.65" stop-color="#d9a634"/><stop offset="1" stop-color="#8a5d0b"/>
      </linearGradient>
      <radialGradient id="medalha" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#fff3c0"/><stop offset="0.5" stop-color="#e3b33c"/><stop offset="1" stop-color="#94650c"/>
      </radialGradient>
    </defs>
    <g stroke="#2e1d0c" stroke-width="1.6" stroke-linejoin="round">
      <rect x="22" y="90.5" width="56" height="6" rx="3" fill="url(#madeira)"/>
      <rect x="24" y="88" width="52" height="3" rx="1.5" fill="url(#ouro)"/>
      <path d="M34 76.5 L66 76.5 Q67.5 84 74 88.6 L26 88.6 Q32.5 84 34 76.5 Z" fill="url(#madeira)"/>
      <rect x="32" y="72" width="36" height="5" rx="2.5" fill="url(#ouro)"/>
      <circle cx="50" cy="83" r="12.5" fill="url(#medalha)"/>
      <circle cx="50" cy="83" r="10.2" fill="none" stroke="#8a5d0b" stroke-width="0.9"/>
    </g>
    ${silhueta('#fff3c4', '#fff3c4', -0.5, -0.5)}
    ${silhueta('#6e4a08', '#e7b744', 0, 0)}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Corta as bordas transparentes de um canvas
function aparar(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas;
  const c = novoCanvas(maxX - minX + 1, maxY - minY + 1);
  c.getContext('2d').drawImage(canvas, minX, minY, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

// Recorta um retângulo (em pixels da foto) da figura já sem fundo: vira o busto do personagem
export function recortarBusto(figura, { x, y, largura, altura }) {
  const c = novoCanvas(Math.max(1, Math.round(largura)), Math.max(1, Math.round(altura)));
  const origem = figura.deslocamento || { x: 0, y: 0 };
  // Parte do retângulo que cai dentro da figura
  const sx = Math.max(0, x - origem.x);
  const sy = Math.max(0, y - origem.y);
  const ex = Math.min(figura.width, x - origem.x + largura);
  const ey = Math.min(figura.height, y - origem.y + altura);
  if (ex > sx && ey > sy) {
    c.getContext('2d').drawImage(figura, sx, sy, ex - sx, ey - sy, sx - (x - origem.x), sy - (y - origem.y), ex - sx, ey - sy);
  }
  return aparar(c);
}

// paletaTime: paleta do tema do time (pecas.js) — usada no pedestal
export async function montarPersonagem(busto, { tipo, paletaTime }) {
  const saida = novoCanvas(TAMANHO, TAMANHO);
  const ctx = saida.getContext('2d');

  // Busto o maior possível, com a parte de baixo escondida atrás do aro de cima do pedestal
  const base = 75.5;
  const escala = Math.min(72 / busto.width, (base - 2) / busto.height);
  const largura = busto.width * escala;
  const altura = busto.height * escala;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(busto, (50 - largura / 2) * U, (base - altura) * U, largura * U, altura * U);
  ctx.shadowColor = 'transparent';

  ctx.drawImage(await carregarImagem(svgPedestal(tipo, paletaTime)), 0, 0, TAMANHO, TAMANHO);
  return saida.toDataURL('image/png');
}
