// Desenha o tabuleiro 8x8 e as peças. Não conhece as regras: quem decide as jogadas é a Partida.
// Camadas: casas (cliques) -> peças -> efeitos das animações.

import { ehPersonalizada, montarTime } from './pecas.js';

const posicaoCss = (p) => `translate(${p.c * 100}%, ${p.r * 100}%)`;

export class Tabuleiro {
  constructor(raiz, { orientacao = 'w' } = {}) {
    this.raiz = raiz;
    this.orientacao = orientacao;
    this.pecas = new Map(); // casa ("e4") -> elemento da peça
    this.times = null;
    this.entrada = null; // função chamada ao clicar numa casa quando é a vez de alguém local
    this.aoClicarLivre = null; // clique sem ninguém esperando jogada (ex.: pular animação)
    this.destaques = { ultima: [], xeque: null, selecao: null, destinos: [] };

    raiz.classList.add('tabuleiro');
    raiz.replaceChildren();
    this.casas = this.criarCamada('casas');
    this.camadaPecas = this.criarCamada('camada-pecas');
    this.camadaEfeitos = this.criarCamada('camada-efeitos');

    this.casas.addEventListener('click', (evento) => {
      const casa = evento.target.closest('.casa');
      if (!casa) return;
      if (this.entrada) this.entrada(casa.dataset.casa);
      else this.aoClicarLivre?.();
    });
    this.desenharCasas();
  }

  criarCamada(classe) {
    const el = document.createElement('div');
    el.className = classe;
    this.raiz.appendChild(el);
    return el;
  }

  // Converte "e4" em coluna/linha na tela (0..7), respeitando de que lado o tabuleiro está virado
  pos(casa) {
    const coluna = casa.charCodeAt(0) - 97;
    const linha = Number(casa[1]);
    return this.orientacao === 'w' ? { c: coluna, r: 8 - linha } : { c: 7 - coluna, r: linha - 1 };
  }

  desenharCasas() {
    this.casas.replaceChildren();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const coluna = this.orientacao === 'w' ? c : 7 - c;
        const linha = this.orientacao === 'w' ? 8 - r : r + 1;
        const el = document.createElement('div');
        el.className = `casa ${(coluna + linha) % 2 === 1 ? 'escura' : 'clara'}`;
        el.dataset.casa = String.fromCharCode(97 + coluna) + linha;
        if (c === 0) el.dataset.linha = linha;
        if (r === 7) el.dataset.coluna = String.fromCharCode(97 + coluna);
        this.casas.appendChild(el);
      }
    }
    this.aplicarDestaques();
  }

  definirTimes(times) {
    this.times = times;
    for (const el of this.pecas.values()) this.atualizarImagem(el);
  }

  atualizarImagem(el) {
    const { cor, tipo } = el.dataset;
    const time = this.times?.[cor];
    const url = time?.pecas[tipo];
    if (!url) return;
    const img = el.querySelector('img');
    // Se a foto não carregar (arquivo apagado no servidor), volta para a peça desenhada do tema
    img.onerror = () => {
      img.onerror = null;
      img.src = montarTime(time.tema, cor).pecas[tipo];
      el.classList.remove('foto');
    };
    if (img.getAttribute('src') !== url) img.src = url;
    el.classList.toggle('foto', ehPersonalizada(url));
  }

  criarPeca(casa, { type, color }) {
    const el = document.createElement('div');
    el.className = 'peca';
    el.dataset.tipo = type;
    el.dataset.cor = color;
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    el.appendChild(img);
    this.atualizarImagem(el);
    el.style.transform = posicaoCss(this.pos(casa));
    this.camadaPecas.appendChild(el);
    return el;
  }

  posicionar(el, casa) {
    el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    el.style.transform = posicaoCss(this.pos(casa));
    el.style.zIndex = '';
    el.style.visibility = '';
  }

  elemento(casa) {
    return this.pecas.get(casa) || null;
  }

  moverNoMapa(de, para) {
    const el = this.pecas.get(de);
    if (!el) return;
    this.pecas.delete(de);
    this.pecas.set(para, el);
  }

  // Deixa as peças da tela iguais ao tabuleiro do chess.js (reaproveita as que já estão certas)
  sincronizar(tabuleiroChess) {
    const ocupadas = new Set();
    for (const linha of tabuleiroChess) {
      for (const peca of linha) {
        if (!peca) continue;
        ocupadas.add(peca.square);
        const el = this.pecas.get(peca.square);
        if (el && el.dataset.tipo === peca.type && el.dataset.cor === peca.color) {
          this.posicionar(el, peca.square);
          continue;
        }
        el?.remove();
        this.pecas.set(peca.square, this.criarPeca(peca.square, peca));
      }
    }
    for (const [casa, el] of this.pecas) {
      if (!ocupadas.has(casa)) {
        el.remove();
        this.pecas.delete(casa);
      }
    }
  }

  girar() {
    this.orientacao = this.orientacao === 'w' ? 'b' : 'w';
    this.desenharCasas();
    for (const [casa, el] of this.pecas) this.posicionar(el, casa);
  }

  // Deixa a cor indicada embaixo (no online, quem joga de pretas vê o tabuleiro do seu lado)
  definirOrientacao(cor) {
    if (this.orientacao !== cor) this.girar();
  }

  marcarUltima(de, para) {
    this.destaques.ultima = de ? [de, para] : [];
    this.aplicarDestaques();
  }

  marcarXeque(casa) {
    this.destaques.xeque = casa;
    this.aplicarDestaques();
  }

  mostrarSelecao(casa, destinos) {
    this.destaques.selecao = casa;
    this.destaques.destinos = destinos;
    this.aplicarDestaques();
  }

  limparSelecao() {
    this.destaques.selecao = null;
    this.destaques.destinos = [];
    this.aplicarDestaques();
  }

  aplicarDestaques() {
    const { ultima, xeque, selecao, destinos } = this.destaques;
    for (const el of this.casas.children) {
      const casa = el.dataset.casa;
      const destino = destinos.find((d) => d.casa === casa);
      el.classList.toggle('ultima', ultima.includes(casa));
      el.classList.toggle('xeque', casa === xeque);
      el.classList.toggle('selecionada', casa === selecao);
      el.classList.toggle('destino', !!destino);
      el.classList.toggle('captura', !!destino?.captura);
    }
  }

  tamanhoCasa() {
    return this.casas.getBoundingClientRect().width / 8;
  }

  // Canto superior esquerdo de uma posição (coluna/linha) em pixels da tela
  cantoPx(p) {
    const r = this.casas.getBoundingClientRect();
    const t = r.width / 8;
    return { x: r.left + p.c * t, y: r.top + p.r * t, t };
  }
}
