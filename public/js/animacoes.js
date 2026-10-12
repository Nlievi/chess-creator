// Animações de captura e de xeque-mate.
// Cada efeito coreografa o atacante e a vítima com a Web Animations API (só transform/opacity/filter,
// leves no celular) e usa o canvas de partículas para faíscas, poeira e cinzas.
//
// Contrato (contrato nº 5): await animarCaptura(efeito, { tab, atacante, vitima, de, para, vitimaCasa })

import { sons } from './sons.js';
import { emitir, limparParticulas, opcoesParticulas } from './particulas.js';

export const EFEITOS = ['espada', 'esmagar', 'coice', 'desintegrar'];
export const EFEITOS_PADRAO = { p: 'espada', n: 'coice', b: 'desintegrar', r: 'esmagar', q: 'espada', k: 'espada' };
export const opcoesAnimacao = { ativadas: true, velocidade: 1 };

export function configurarAnimacoes({ ativadas, velocidade } = {}) {
  if (ativadas !== undefined) opcoesAnimacao.ativadas = ativadas;
  if (velocidade > 0) {
    opcoesAnimacao.velocidade = velocidade;
    opcoesParticulas.velocidade = velocidade;
  }
}

// ---------- utilitários ----------

let pulando = false;
const ativas = new Set();
const esperas = new Set();

// Com a aba escondida o navegador congela as animações; sem isto a partida travaria até a pessoa voltar
const semAnimacao = () => pulando || document.hidden;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pularAnimacoes();
});

const dur = (ms) => ms / opcoesAnimacao.velocidade;
const T = (p, extra = '') => `translate(${p.c * 100}%, ${p.r * 100}%) ${extra}`.trim();
const lerp = (a, b, t) => ({ c: a.c + (b.c - a.c) * t, r: a.r + (b.r - a.r) * t });
const aleatorio = (min, max) => min + Math.random() * (max - min);
const escolher = (lista) => lista[Math.floor(Math.random() * lista.length)];

function comecar() {
  pulando = false;
}

// Clique no tabuleiro durante uma animação: termina tudo na hora
export function pularAnimacoes() {
  pulando = true;
  for (const a of [...ativas]) {
    try { a.finish(); } catch { /* já terminou */ }
  }
  for (const terminar of [...esperas]) terminar();
  limparParticulas();
}

function esperar(ms) {
  if (semAnimacao() || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const terminar = () => {
      clearTimeout(id);
      esperas.delete(terminar);
      resolve();
    };
    const id = setTimeout(terminar, dur(ms));
    esperas.add(terminar);
  });
}

async function animar(el, quadros, { duracao = 300, easing = 'ease', atraso = 0 } = {}) {
  if (semAnimacao()) return; // quem chamou já aplica o estado final
  const a = el.animate(quadros, { duration: dur(duracao), easing, delay: dur(atraso), fill: 'forwards' });
  ativas.add(a);
  try { await a.finished; } catch { /* cancelada */ } finally { ativas.delete(a); }
}

function soltar(el) {
  el.getAnimations().forEach((a) => a.cancel());
}

async function mover(el, de, para, duracao = 220, easing = 'cubic-bezier(.3,.7,.4,1)') {
  await animar(el, [{ transform: T(de) }, { transform: T(para) }], { duracao, easing });
  el.style.transform = T(para);
  soltar(el);
}

function criarEfeito(tab, p, classe) {
  const el = document.createElement('div');
  el.className = `efeito ${classe}`;
  el.style.transform = T(p);
  tab.camadaEfeitos.appendChild(el);
  return el;
}

function pedacoDaImagem(src, recorte) {
  const caixa = document.createElement('div');
  caixa.className = 'pedaco';
  caixa.style.clipPath = recorte;
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  caixa.appendChild(img);
  return caixa;
}

function tremer(tab, forca, duracao = 320) {
  const quadros = [];
  for (let i = 0; i < 7; i++) quadros.push({ transform: `translate(${aleatorio(-forca, forca)}px, ${aleatorio(-forca, forca)}px)` });
  quadros.push({ transform: 'translate(0px, 0px)' });
  return animar(tab.raiz, quadros, { duracao, easing: 'linear' }).then(() => soltar(tab.raiz));
}

// Lê as cores da imagem da peça para as partículas terem a "cara" dela (funciona com as fotos da IA também)
function amostrarCores(img, lado = 40, passo = 2) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, lado, lado);
    const d = ctx.getImageData(0, 0, lado, lado).data;
    const pontos = [];
    for (let y = 0; y < lado; y += passo) {
      for (let x = 0; x < lado; x += passo) {
        const i = (y * lado + x) * 4;
        if (d[i + 3] > 120) pontos.push({ x: x / lado, y: y / lado, cor: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})` });
      }
    }
    return pontos.length ? pontos : null;
  } catch {
    return null; // imagem de outro domínio: o navegador bloqueia a leitura
  }
}

function pontosGenericos(cores) {
  const pontos = [];
  for (let i = 0; i < 160; i++) pontos.push({ x: aleatorio(0.25, 0.75), y: aleatorio(0.1, 0.92), cor: escolher(cores) });
  return pontos;
}

// ---------- partículas ----------

function faiscasNoCorte(tab, p, [x1, y1, x2, y2]) {
  const { x, y, t } = tab.cantoPx(p);
  const lista = [];
  for (let i = 0; i < 24; i++) {
    const k = Math.random();
    const angulo = aleatorio(0, Math.PI * 2);
    const vel = aleatorio(1.5, 4.5) * t;
    lista.push({
      x: x + ((x1 + (x2 - x1) * k) / 100) * t,
      y: y + ((y1 + (y2 - y1) * k) / 100) * t,
      vx: Math.cos(angulo) * vel,
      vy: Math.sin(angulo) * vel - t,
      g: t * 9, arrasto: 2, vida: aleatorio(0.25, 0.55),
      tam: Math.max(1.5, t / 40), cor: escolher(['#ffffff', '#fff3c4', '#ffd166']), tipo: 'faisca',
    });
  }
  emitir(lista);
}

function poeira(tab, p) {
  const { x, y, t } = tab.cantoPx(p);
  const lista = [];
  for (let i = 0; i < 30; i++) {
    const lado = Math.random() < 0.5 ? -1 : 1;
    lista.push({
      x: x + t / 2 + lado * aleatorio(0, t * 0.3), y: y + t * 0.88 - aleatorio(0, t * 0.1),
      vx: lado * aleatorio(1, 3.5) * t, vy: -aleatorio(0.2, 1.3) * t,
      g: t * 2.5, arrasto: 3, vida: aleatorio(0.4, 0.8),
      tam: aleatorio(t / 14, t / 7), cor: escolher(['#cbb89d', '#a8957a', '#e8dcc8']), tipo: 'circulo',
    });
  }
  emitir(lista);
}

function pedacos(tab, p, pontos) {
  const { x, y, t } = tab.cantoPx(p);
  const lista = [];
  const fonte = pontos || pontosGenericos(['#777', '#999', '#555']);
  for (let i = 0; i < 26; i++) {
    const ponto = escolher(fonte);
    const lado = ponto.x < 0.5 ? -1 : 1;
    lista.push({
      x: x + ponto.x * t, y: y + t * 0.8,
      vx: lado * aleatorio(1.5, 4) * t, vy: -aleatorio(1, 3) * t,
      g: t * 12, arrasto: 0.5, vida: aleatorio(0.4, 0.75),
      tam: aleatorio(t / 18, t / 9), cor: ponto.cor,
    });
  }
  emitir(lista);
}

function estrelaDeImpacto(tab, p) {
  const { x, y, t } = tab.cantoPx(p);
  const lista = [];
  for (let i = 0; i < 20; i++) {
    const angulo = (i / 20) * Math.PI * 2;
    const vel = aleatorio(3, 6) * t;
    lista.push({
      x: x + t / 2, y: y + t / 2, vx: Math.cos(angulo) * vel, vy: Math.sin(angulo) * vel,
      arrasto: 4, vida: aleatorio(0.25, 0.4), tam: Math.max(2, t / 30),
      cor: escolher(['#ffffff', '#ffe066', '#ffb703']), tipo: 'faisca',
    });
  }
  emitir(lista);
}

function feixeMagico(tab, de, para) {
  const a = tab.cantoPx(de);
  const b = tab.cantoPx(para);
  const t = a.t;
  const tempo = 0.32;
  const lista = [];
  for (let i = 0; i < 46; i++) {
    const atraso = (i / 46) * 0.25;
    lista.push({
      x: a.x + t / 2 + aleatorio(-t * 0.08, t * 0.08), y: a.y + t * 0.3,
      vx: (b.x - a.x) / tempo + aleatorio(-t * 0.3, t * 0.3), vy: (b.y + t * 0.2 - a.y) / tempo + aleatorio(-t * 0.3, t * 0.3),
      atraso, vida: tempo, tam: aleatorio(t / 22, t / 12),
      cor: escolher(['#ffffff', '#d7b8ff', '#9f6bff', '#7cf3ff']), tipo: 'circulo',
    });
  }
  emitir(lista);
}

function cinzas(tab, p, pontos) {
  const { x, y, t } = tab.cantoPx(p);
  const fonte = pontos || pontosGenericos(['#d7b8ff', '#ffffff', '#9f6bff']);
  emitir(fonte.map((ponto) => ({
    x: x + ponto.x * t, y: y + ponto.y * t,
    vx: aleatorio(-0.4, 0.4) * t, vy: -aleatorio(0.3, 1.1) * t,
    g: -t * 0.6, arrasto: 0.5, atraso: ponto.y * 0.65,
    vida: aleatorio(0.6, 1.1), tam: t / 18, cor: ponto.cor,
  })));
}

function explosao(tab, p, pontos) {
  const { x, y, t } = tab.cantoPx(p);
  const lista = [];
  const fonte = pontos || pontosGenericos(['#ccc', '#888', '#fff']);
  for (let i = 0; i < 70; i++) {
    const angulo = aleatorio(0, Math.PI * 2);
    const vel = aleatorio(2, 7) * t;
    const ponto = escolher(fonte);
    lista.push({
      x: x + ponto.x * t, y: y + ponto.y * t, vx: Math.cos(angulo) * vel, vy: Math.sin(angulo) * vel - 2 * t,
      g: t * 8, arrasto: 1, vida: aleatorio(0.6, 1.3), tam: aleatorio(t / 16, t / 8), cor: ponto.cor,
    });
  }
  for (let i = 0; i < 40; i++) {
    const angulo = aleatorio(0, Math.PI * 2);
    const vel = aleatorio(4, 10) * t;
    lista.push({
      x: x + t / 2, y: y + t / 2, vx: Math.cos(angulo) * vel, vy: Math.sin(angulo) * vel,
      arrasto: 2.5, vida: aleatorio(0.3, 0.7), tam: Math.max(2, t / 25),
      cor: escolher(['#ffffff', '#ffe066', '#ff8c42']), tipo: 'faisca',
    });
  }
  emitir(lista);
}

// ---------- efeitos de captura ----------

// Peão, Rei e Rainha: espadada na diagonal, a peça se parte em duas
async function espada({ tab, atacante, vitima, de, para, vitimaCasa }) {
  const a = tab.pos(de);
  const b = tab.pos(para);
  const v = tab.pos(vitimaCasa);
  const src = vitima.querySelector('img').src;

  atacante.style.zIndex = 5;
  await mover(atacante, a, lerp(a, b, 0.6), 240);

  sons.espada();
  const espelhar = b.c < a.c; // ataque vindo da direita: corte espelhado
  const linha = espelhar ? [95, 15, 5, 85] : [5, 15, 95, 85];
  const corte = criarEfeito(tab, v, 'corte');
  corte.innerHTML = `<svg viewBox="0 0 100 100"><line x1="${linha[0]}" y1="${linha[1]}" x2="${linha[2]}" y2="${linha[3]}" pathLength="100"/></svg>`;
  animar(corte.querySelector('line'), [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duracao: 130, easing: 'ease-in' });
  await esperar(110);

  // A linha do corte, estendida até as bordas da casa, cruza x=0 em 11,1% e x=100 em 88,9%
  const yEsq = espelhar ? 88.9 : 11.1;
  const yDir = espelhar ? 11.1 : 88.9;
  const cima = criarEfeito(tab, v, 'partes');
  cima.appendChild(pedacoDaImagem(src, `polygon(0 0, 100% 0, 100% ${yDir}%, 0 ${yEsq}%)`));
  const baixo = criarEfeito(tab, v, 'partes');
  baixo.appendChild(pedacoDaImagem(src, `polygon(0 ${yEsq}%, 100% ${yDir}%, 100% 100%, 0 100%)`));
  vitima.remove();
  faiscasNoCorte(tab, v, linha);

  const s = espelhar ? -1 : 1;
  const queda = { duracao: 650, easing: 'cubic-bezier(.2,.6,.4,1)' };
  animar(cima.firstChild, [
    { transform: 'translate(0%, 0%) rotate(0deg)', opacity: 1 },
    { transform: `translate(${s * 9}%, -11%) rotate(${s * 8}deg)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${s * 28}%, 70%) rotate(${s * 35}deg)`, opacity: 0 },
  ], queda);
  animar(baixo.firstChild, [
    { transform: 'translate(0%, 0%) rotate(0deg)', opacity: 1 },
    { transform: `translate(${-s * 7}%, 6%) rotate(${-s * 6}deg)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${-s * 22}%, 80%) rotate(${-s * 25}deg)`, opacity: 0 },
  ], queda);
  animar(corte, [{ opacity: 1 }, { opacity: 0 }], { duracao: 260, atraso: 100 });

  await esperar(150);
  await mover(atacante, lerp(a, b, 0.6), b, 170, 'ease-out');
  await esperar(380);
}

// Torre: pula alto e cai em cima da vítima, que fica achatada
async function esmagar({ tab, atacante, vitima, de, para }) {
  const a = tab.pos(de);
  const b = tab.pos(para);
  const pontos = amostrarCores(vitima.querySelector('img'));
  const X = (p, y, s) => T(p, `translateY(${y}%) scale(${s})`);

  atacante.style.zIndex = 6;
  sons.pulo();
  await animar(atacante, [
    { transform: X(a, 0, 1), easing: 'ease-out' },
    { transform: X(lerp(a, b, 0.55), -95, 1.35), offset: 0.5, easing: 'ease-in-out' },
    { transform: X(b, -120, 1.45), offset: 0.78, easing: 'cubic-bezier(.7,0,1,1)' },
    { transform: X(b, 0, 1) },
  ], { duracao: 640 });
  atacante.style.transform = T(b);
  soltar(atacante);

  sons.esmagar();
  const imgVitima = vitima.querySelector('img');
  imgVitima.style.transformOrigin = '50% 92%';
  animar(imgVitima, [
    { transform: 'scale(1, 1)', opacity: 1 },
    { transform: 'scale(1.5, 0.3)', opacity: 1, offset: 0.3 },
    { transform: 'scale(1.8, 0.08)', opacity: 0.9, offset: 0.7 },
    { transform: 'scale(1.9, 0.04)', opacity: 0 },
  ], { duracao: 420, easing: 'ease-out' });

  const imgAtacante = atacante.querySelector('img');
  imgAtacante.style.transformOrigin = '50% 92%';
  animar(imgAtacante, [
    { transform: 'scale(1.2, 0.8)' },
    { transform: 'scale(0.94, 1.07)', offset: 0.5 },
    { transform: 'scale(1, 1)' },
  ], { duracao: 280 }).then(() => soltar(imgAtacante));

  poeira(tab, b);
  pedacos(tab, b, pontos);
  tremer(tab, tab.tamanhoCasa() * 0.08, 360);
  await esperar(440);
}

// Cavalo: salta em arco e dá um coice que arremessa a vítima para fora do tabuleiro, girando
async function coice({ tab, atacante, vitima, de, para }) {
  const a = tab.pos(de);
  const b = tab.pos(para);
  const sentido = b.c >= a.c ? 1 : -1;
  const X = (p, y, giro, s) => T(p, `translateY(${y}%) rotate(${giro}deg) scale(${s})`);

  atacante.style.zIndex = 6;
  sons.pulo();
  const salto = animar(atacante, [
    { transform: X(a, 0, 0, 1) },
    { transform: X(lerp(a, b, 0.5), -75, -12 * sentido, 1.25), offset: 0.5 },
    { transform: X(b, 0, 0, 1) },
  ], { duracao: 480, easing: 'ease-in-out' });
  await esperar(400);

  sons.coice();
  estrelaDeImpacto(tab, b);
  tremer(tab, tab.tamanhoCasa() * 0.05, 220);

  const dist = Math.hypot(b.c - a.c, b.r - a.r) || 1;
  const alvo = { c: b.c + ((b.c - a.c) / dist) * 6, r: b.r + ((b.r - a.r) / dist) * 6 - 2.5 };
  const meio = { c: (b.c + alvo.c) / 2, r: (b.r + alvo.r) / 2 - 1.5 };
  const giro = sentido * aleatorio(600, 900);
  vitima.style.zIndex = 7;
  animar(vitima, [
    { transform: T(b, 'rotate(0deg) scale(1)'), opacity: 1 },
    { transform: T(meio, `rotate(${giro / 2}deg) scale(0.85)`), opacity: 1, offset: 0.45 },
    { transform: T(alvo, `rotate(${giro}deg) scale(0.45)`), opacity: 0 },
  ], { duracao: 750, easing: 'cubic-bezier(.15,.7,.35,1)' });

  await salto;
  atacante.style.transform = T(b);
  soltar(atacante);
  await esperar(450);
}

// Bispo: lança um feitiço e a vítima se desfaz em cinzas, de cima para baixo
async function desintegrar({ tab, atacante, vitima, de, para, vitimaCasa }) {
  const a = tab.pos(de);
  const b = tab.pos(para);
  const v = tab.pos(vitimaCasa);
  const imgAtacante = atacante.querySelector('img');
  const imgVitima = vitima.querySelector('img');
  const pontos = amostrarCores(imgVitima);

  sons.magia();
  animar(imgAtacante, [
    { filter: 'drop-shadow(0 0 0px #b98bff) brightness(1)' },
    { filter: 'drop-shadow(0 0 14px #b98bff) brightness(1.35)', offset: 0.5 },
    { filter: 'drop-shadow(0 0 0px #b98bff) brightness(1)' },
  ], { duracao: 900 }).then(() => soltar(imgAtacante));
  feixeMagico(tab, a, v);
  await esperar(330);

  sons.desintegrar();
  cinzas(tab, v, pontos);
  animar(imgVitima, [
    { clipPath: 'inset(0% 0% 0% 0%)', filter: 'brightness(1)' },
    { clipPath: 'inset(100% 0% 0% 0%)', filter: 'brightness(2.2)' },
  ], { duracao: 700, easing: 'linear' });
  await esperar(500);
  await mover(atacante, a, b, 300);
  await esperar(250);
}

const COREOGRAFIAS = { espada, esmagar, coice, desintegrar };

// ---------- API usada pela Partida ----------

export async function animarCaptura(efeito, contexto) {
  comecar();
  const { tab, atacante, vitima, de, para } = contexto;
  try {
    if (!opcoesAnimacao.ativadas) {
      sons.mover();
      await mover(atacante, tab.pos(de), tab.pos(para), 120);
      return;
    }
    await (COREOGRAFIAS[efeito] || espada)(contexto);
  } finally {
    vitima.remove();
    atacante.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    atacante.style.transform = T(tab.pos(para));
    atacante.style.zIndex = '';
    tab.camadaEfeitos.replaceChildren();
  }
}

export async function animarDeslize(tab, el, de, para) {
  comecar();
  await mover(el, tab.pos(de), tab.pos(para), opcoesAnimacao.ativadas ? 200 : 0);
}

// Xeque-mate: o tabuleiro escurece, o rei treme, racha e explode em pedaços
export async function animarXequeMate({ tab, casaRei }) {
  comecar();
  const rei = casaRei && tab.elemento(casaRei);
  if (!rei || !opcoesAnimacao.ativadas) return;
  const p = tab.pos(casaRei);
  const imgRei = rei.querySelector('img');
  const src = imgRei.src;
  const pontos = amostrarCores(imgRei);

  sons.tensao();
  const sombra = document.createElement('div');
  sombra.className = 'sombra-mate';
  sombra.style.setProperty('--x', `${(p.c + 0.5) * 12.5}%`);
  sombra.style.setProperty('--y', `${(p.r + 0.5) * 12.5}%`);
  tab.camadaPecas.appendChild(sombra);
  animar(sombra, [{ opacity: 0 }, { opacity: 1 }], { duracao: 350 });
  rei.style.zIndex = 9;

  const tremor = [];
  for (let i = 0; i < 14; i++) {
    tremor.push({ transform: `translate(${aleatorio(-3, 3)}%, ${aleatorio(-2, 2)}%) rotate(${aleatorio(-4, 4)}deg)` });
  }
  tremor.push({ transform: 'translate(0%, 0%) rotate(0deg)' });
  animar(imgRei, tremor, { duracao: 800, easing: 'linear' });

  const rachaduras = document.createElement('div');
  rachaduras.className = 'rachaduras';
  rachaduras.innerHTML = `<svg viewBox="0 0 100 100">
    <path pathLength="100" d="M50 30 L46 42 L53 50 L44 62 L50 74"/>
    <path pathLength="100" d="M53 50 L64 47 L70 56"/>
    <path pathLength="100" d="M46 42 L34 38 L30 46"/>
    <path pathLength="100" d="M44 62 L36 70"/></svg>`;
  rei.appendChild(rachaduras);
  rachaduras.querySelectorAll('path').forEach((caminho, i) => {
    animar(caminho, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duracao: 380, atraso: 250 + i * 120, easing: 'ease-out' });
  });
  await esperar(850);

  sons.explosao();
  tremer(tab, tab.tamanhoCasa() * 0.16, 650);
  rei.style.visibility = 'hidden';
  const estilhacos = document.createElement('div');
  estilhacos.className = 'estilhacos';
  estilhacos.style.transform = T(p);
  tab.camadaPecas.appendChild(estilhacos);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const f = document.createElement('div');
      f.className = 'fragmento';
      Object.assign(f.style, {
        left: `${i * 20}%`, top: `${j * 20}%`,
        backgroundImage: `url("${src}")`, backgroundPosition: `${i * 25}% ${j * 25}%`,
      });
      estilhacos.appendChild(f);
      const dx = (i - 2 + aleatorio(-0.5, 0.5)) * aleatorio(140, 300);
      const dy = (j - 2 + aleatorio(-0.5, 0.5)) * aleatorio(140, 260) - aleatorio(180, 360);
      animar(f, [
        { transform: 'translate(0%, 0%) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}%, ${dy}%) rotate(${aleatorio(-200, 200)}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx * 1.6}%, ${dy + 1100}%) rotate(${aleatorio(-500, 500)}deg)`, opacity: 0 },
      ], { duracao: 1300, easing: 'cubic-bezier(.2,.7,.4,1)' });
    }
  }
  explosao(tab, p, pontos);
  await esperar(1300);

  estilhacos.remove();
  rachaduras.remove();
  await animar(sombra, [{ opacity: 1 }, { opacity: 0 }], { duracao: 400 });
  sombra.remove();
}
