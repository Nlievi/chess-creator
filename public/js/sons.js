// Efeitos sonoros sintetizados na hora com a Web Audio API (sem arquivos de áudio, sem licença para conferir).
// O navegador só libera áudio depois de um clique: chame destravarAudio() no clique de "Jogar".

export const opcoesSom = { ligado: true };

let ctx = null;
let mestre = null;
let bufferRuido = null;

function contexto() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    mestre = ctx.createGain();
    mestre.gain.value = 0.7;
    mestre.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function destravarAudio() {
  contexto();
}

function ruidoBranco(c) {
  if (!bufferRuido) {
    bufferRuido = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const dados = bufferRuido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
  }
  return bufferRuido;
}

function envelope(c, inicio, vol, ataque, duracao) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, inicio);
  g.gain.exponentialRampToValueAtTime(vol, inicio + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  return g;
}

function ruido({ dur = 0.3, filtro = 'bandpass', f0 = 1000, f1 = f0, q = 1, vol = 0.3, ataque = 0.005, atraso = 0 } = {}) {
  const c = contexto();
  if (!c || !opcoesSom.ligado) return;
  const t = c.currentTime + atraso;
  const fonte = c.createBufferSource();
  fonte.buffer = ruidoBranco(c);
  const f = c.createBiquadFilter();
  f.type = filtro;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  fonte.connect(f).connect(envelope(c, t, vol, ataque, dur)).connect(mestre);
  fonte.start(t, Math.random() * 1.2);
  fonte.stop(t + dur + 0.05);
}

function tom({ tipo = 'sine', f0 = 440, f1 = f0, dur = 0.3, vol = 0.3, ataque = 0.005, atraso = 0 } = {}) {
  const c = contexto();
  if (!c || !opcoesSom.ligado) return;
  const t = c.currentTime + atraso;
  const osc = c.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  osc.connect(envelope(c, t, vol, ataque, dur)).connect(mestre);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sons = {
  mover() {
    tom({ tipo: 'triangle', f0: 700, f1: 520, dur: 0.07, vol: 0.18 });
    ruido({ filtro: 'highpass', f0: 3000, dur: 0.03, vol: 0.08 });
  },
  espada() {
    ruido({ f0: 3500, f1: 600, q: 0.8, dur: 0.22, vol: 0.35 });
    [2637, 3951, 5274].forEach((f, i) => tom({ f0: f, f1: f * 0.98, dur: 0.6, vol: 0.07 - i * 0.015, atraso: 0.11 }));
  },
  pulo() {
    ruido({ f0: 400, f1: 1600, q: 1, dur: 0.28, vol: 0.12 });
  },
  esmagar() {
    tom({ f0: 150, f1: 38, dur: 0.4, vol: 0.7 });
    ruido({ filtro: 'lowpass', f0: 1200, f1: 150, dur: 0.35, vol: 0.6 });
    ruido({ f0: 2200, q: 3, dur: 0.12, vol: 0.25, atraso: 0.02 });
  },
  coice() {
    tom({ tipo: 'square', f0: 240, f1: 80, dur: 0.12, vol: 0.18 });
    ruido({ f0: 1400, q: 1.5, dur: 0.09, vol: 0.4 });
    ruido({ f0: 1800, f1: 300, dur: 0.5, vol: 0.12, atraso: 0.05 });
  },
  magia() {
    [659, 880, 1319, 1760].forEach((f, i) => tom({ f0: f, dur: 0.35, vol: 0.09, atraso: i * 0.06 }));
    ruido({ filtro: 'highpass', f0: 6000, dur: 0.7, vol: 0.05 });
  },
  desintegrar() {
    ruido({ f0: 5000, f1: 1200, q: 0.7, dur: 0.8, vol: 0.14, ataque: 0.08 });
  },
  xeque() {
    tom({ tipo: 'triangle', f0: 988, dur: 0.12, vol: 0.2 });
    tom({ tipo: 'triangle', f0: 740, dur: 0.25, vol: 0.2, atraso: 0.12 });
  },
  tensao() {
    tom({ tipo: 'sawtooth', f0: 55, f1: 75, dur: 0.9, vol: 0.12, ataque: 0.3 });
  },
  explosao() {
    ruido({ filtro: 'lowpass', f0: 2500, f1: 60, dur: 1.4, vol: 0.8 });
    tom({ f0: 110, f1: 28, dur: 1.2, vol: 0.8 });
  },
  vitoria() {
    [523, 659, 784, 1047].forEach((f, i) => tom({ tipo: 'triangle', f0: f, dur: i === 3 ? 0.8 : 0.18, vol: 0.18, atraso: i * 0.14 }));
  },
  empate() {
    [523, 494, 440].forEach((f, i) => tom({ tipo: 'triangle', f0: f, dur: 0.3, vol: 0.15, atraso: i * 0.2 }));
  },
};
