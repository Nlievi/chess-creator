// Sistema de partículas simples num <canvas> fixo que cobre a tela inteira (faíscas, poeira, cinzas, estilhaços).
// Posições e velocidades em pixels da tela; tempo em segundos.

let canvas = null;
let ctx = null;
let particulas = [];
let rodando = false;
let ultimo = 0;

export const opcoesParticulas = { velocidade: 1 };

function garantirCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'particulas';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  const ajustar = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  ajustar();
  window.addEventListener('resize', ajustar);
}

// Cada partícula: { x, y, vx, vy, vida, g?, arrasto?, tam?, cor?, tipo?: 'quadrado'|'circulo'|'faisca', atraso? }
export function emitir(novas) {
  if (document.hidden) return;
  garantirCanvas();
  for (const p of novas) {
    p.max = p.vida;
    p.atraso ??= 0;
    p.g ??= 0;
    p.arrasto ??= 0;
    p.tam ??= 3;
    p.cor ??= '#fff';
    p.tipo ??= 'quadrado';
    particulas.push(p);
  }
  if (!rodando) {
    rodando = true;
    ultimo = performance.now();
    requestAnimationFrame(passo);
  }
}

export function limparParticulas() {
  particulas = [];
}

function passo(agora) {
  const dt = (Math.min(0.05, (agora - ultimo) / 1000)) * opcoesParticulas.velocidade;
  ultimo = agora;
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  const vivas = [];
  for (const p of particulas) {
    if (p.atraso > 0) {
      p.atraso -= dt;
      vivas.push(p);
      continue;
    }
    p.vida -= dt;
    if (p.vida <= 0) continue;
    p.vx *= 1 - Math.min(1, p.arrasto * dt);
    p.vy *= 1 - Math.min(1, p.arrasto * dt);
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    vivas.push(p);

    ctx.globalAlpha = Math.max(0, Math.min(1, p.vida / p.max));
    if (p.tipo === 'faisca') {
      ctx.strokeStyle = p.cor;
      ctx.lineWidth = p.tam;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
    } else if (p.tipo === 'circulo') {
      ctx.fillStyle = p.cor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.tam * (0.5 + 0.5 * (p.vida / p.max)), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.cor;
      ctx.fillRect(p.x - p.tam / 2, p.y - p.tam / 2, p.tam, p.tam);
    }
  }
  ctx.globalAlpha = 1;
  particulas = vivas;

  if (particulas.length) requestAnimationFrame(passo);
  else {
    rodando = false;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
}
