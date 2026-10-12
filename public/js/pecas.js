// Peças padrão desenhadas em SVG para este projeto + temas de cores.
// Cada tema tem uma paleta "claro" (brancas) e "escuro" (pretas).

const BASE = (esq, dir) => `<rect x="${esq}" y="84" width="${dir - esq}" height="9" rx="3.5"/>`;
const PE = (esq, dir) =>
  `<path d="M${esq} 84 Q${esq} 76 ${esq + 8} 74 L${dir - 8} 74 Q${dir} 76 ${dir} 84 Z"/>`;
const DETALHE = (cor) => `fill="${cor}" stroke="none"`;

export const FORMAS = {
  p: () => `
    <path d="M39 74 Q43 62 44 50 L56 50 Q57 62 61 74 Z"/>
    <circle cx="50" cy="35" r="13"/>
    <rect x="36" y="46" width="28" height="7" rx="3.5"/>
    ${PE(30, 70)}${BASE(24, 76)}`,
  r: () => `
    <path d="M37 74 L39 42 L61 42 L63 74 Z"/>
    <path d="M31 36 L31 17 L40 17 L40 24 L46 24 L46 17 L54 17 L54 24 L60 24 L60 17 L69 17 L69 36 Z"/>
    <rect x="31" y="35" width="38" height="8" rx="2"/>
    ${PE(28, 72)}${BASE(22, 78)}`,
  b: (d) => `
    <path d="M40 74 Q44 62 44 54 L56 54 Q56 62 60 74 Z"/>
    <circle cx="50" cy="13" r="5"/>
    <path d="M50 18 C63 26 67 39 60 51 L40 51 C33 39 37 26 50 18 Z"/>
    <path d="M55 28 L47 41" stroke="${d}" fill="none"/>
    <rect x="37" y="49" width="26" height="7" rx="3.5"/>
    ${PE(30, 70)}${BASE(24, 76)}`,
  n: (d) => `
    <path d="M36 74 C35 64 40 58 46 53 C39 55 31 57 25 55 C19 53 17 47 21 42 L35 27 C37 22 39 19 41 17 L43 8 L50 15 C62 16 72 28 72 44 C72 56 68 66 68 74 Z"/>
    <path d="M53 19 C62 25 66 36 64 50" fill="none" stroke="${d}" stroke-width="2.5"/>
    <circle cx="41" cy="28" r="2.8" ${DETALHE(d)}/>
    <circle cx="24.5" cy="47" r="1.7" ${DETALHE(d)}/>
    ${PE(28, 72)}${BASE(22, 78)}`,
  q: () => `
    <path d="M38 74 Q43 60 40 47 L60 47 Q57 60 62 74 Z"/>
    <path d="M33 47 L25 22 L37 33 L41 13 L46 30 L50 9 L54 30 L59 13 L63 33 L75 22 L67 47 Z"/>
    <circle cx="25" cy="20" r="4"/><circle cx="41" cy="11" r="4"/><circle cx="50" cy="7" r="4"/>
    <circle cx="59" cy="11" r="4"/><circle cx="75" cy="20" r="4"/>
    <rect x="34" y="44" width="32" height="7" rx="3.5"/>
    ${PE(28, 72)}${BASE(22, 78)}`,
  k: () => `
    <path d="M38 74 Q43 60 40 47 L60 47 Q57 60 62 74 Z"/>
    <path d="M47 8 h6 v6 h6 v6 h-6 v11 h-6 v-11 h-6 v-6 h6 z"/>
    <path d="M34 47 Q27 35 33 29 Q42 22 50 31 Q58 22 67 29 Q73 35 66 47 Z"/>
    <rect x="34" y="44" width="32" height="7" rx="3.5"/>
    ${PE(28, 72)}${BASE(22, 78)}`,
};

export const TEMAS = {
  classico: {
    nome: 'Clássico',
    claro: { g1: '#ffffff', g2: '#d9cdb8', contorno: '#2a231d', detalhe: '#2a231d' },
    escuro: { g1: '#5c534c', g2: '#1c1917', contorno: '#0b0908', detalhe: '#ece4d6' },
  },
  realeza: {
    nome: 'Ouro e Rubi',
    claro: { g1: '#fff4c4', g2: '#d3a12a', contorno: '#5a3d05', detalhe: '#5a3d05' },
    escuro: { g1: '#b8364a', g2: '#3d0a14', contorno: '#1f0408', detalhe: '#f3c74a' },
  },
  neon: {
    nome: 'Neon',
    claro: { g1: '#e2fdff', g2: '#3fd8f2', contorno: '#0a4a5c', detalhe: '#0a4a5c', brilho: '#3fd8f2' },
    escuro: { g1: '#ffd6f6', g2: '#e43fb4', contorno: '#4d0a3c', detalhe: '#4d0a3c', brilho: '#ff4fd0' },
  },
  elementos: {
    nome: 'Gelo e Fogo',
    claro: { g1: '#f4fcff', g2: '#8ccdf0', contorno: '#1b4f6e', detalhe: '#1b4f6e', brilho: '#bfe9ff' },
    escuro: { g1: '#ffd25e', g2: '#d2361a', contorno: '#4d1005', detalhe: '#4d1005', brilho: '#ff7a2a' },
  },
  madeira: {
    nome: 'Madeira',
    claro: { g1: '#f5dcae', g2: '#c58b4b', contorno: '#4a2a0f', detalhe: '#4a2a0f' },
    escuro: { g1: '#8a5630', g2: '#3a1f0c', contorno: '#170a02', detalhe: '#f5dcae' },
  },
};

export const TIPOS = ['k', 'q', 'r', 'b', 'n', 'p'];
export const NOMES_PECAS = { k: 'Rei', q: 'Rainha', r: 'Torre', b: 'Bispo', n: 'Cavalo', p: 'Peão' };

function svgPeca(tipo, paleta) {
  const brilho = paleta.brilho
    ? `<filter id="f" x="-30%" y="-30%" width="160%" height="160%">
         <feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="b"/>
         <feFlood flood-color="${paleta.brilho}"/><feComposite in2="b" operator="in" result="g"/>
         <feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
       </filter>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="${paleta.g1}"/><stop offset="1" stop-color="${paleta.g2}"/>
      </linearGradient>${brilho}
    </defs>
    <g fill="url(#g)" stroke="${paleta.contorno}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"
       ${paleta.brilho ? 'filter="url(#f)"' : ''}>${FORMAS[tipo](paleta.detalhe)}</g>
  </svg>`;
}

export function urlPeca(tipo, paleta) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgPeca(tipo, paleta))}`;
}

// Time = tema escolhido + imagens das 6 peças. Fotos geradas pela IA substituem as peças do tema.
export function montarTime(temaId, cor, personalizadas = {}) {
  const tema = TEMAS[temaId] ? temaId : 'classico';
  const paleta = cor === 'w' ? TEMAS[tema].claro : TEMAS[tema].escuro;
  const pecas = {};
  for (const tipo of TIPOS) pecas[tipo] = personalizadas[tipo] || urlPeca(tipo, paleta);
  return { tema, pecas, personalizadas: { ...personalizadas } };
}

export function ehPersonalizada(url) {
  return !url.startsWith('data:image/svg');
}
