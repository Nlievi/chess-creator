// Uma partida: regras (chess.js), turnos e animações.
// Cada lado tem um "controlador" que devolve a jogada: local (clique), bot ou remoto (online).
// Contrato do controlador: pedirJogada(partida) -> Promise<{ from, to, promotion? }>; opcionais: jogadaFeita(move), cancelar()

import { Chess } from '/vendor/chess.js/chess.js';
import { animarCaptura, animarDeslize, animarXequeMate, EFEITOS_PADRAO } from './animacoes.js';
import { sons } from './sons.js';

export class Partida {
  constructor({ tabuleiro, times, nomes = { w: 'Brancas', b: 'Pretas' }, efeitos = EFEITOS_PADRAO, eventos = {} }) {
    this.tab = tabuleiro;
    this.times = times;
    this.nomes = nomes;
    this.efeitos = efeitos;
    this.eventos = eventos; // status(info), jogada(move), fim(resultado)
    this.chess = new Chess();
    this.controladores = null;
    this.ativa = false;
  }

  preparar(fen) {
    if (fen) this.chess.load(fen);
    else this.chess.reset();
    this.tab.definirTimes(this.times);
    this.tab.sincronizar(this.chess.board());
    this.tab.marcarUltima(null);
    this.marcarXeque();
  }

  async iniciar(controladores, fen) {
    this.controladores = controladores;
    this.ativa = true;
    this.preparar(fen);
    this.emitirStatus();

    while (this.ativa && !this.chess.isGameOver()) {
      let jogada;
      try {
        jogada = await controladores[this.chess.turn()].pedirJogada(this);
      } catch {
        return; // partida encerrada enquanto esperava a jogada
      }
      if (!this.ativa) return;
      const move = await this.aplicar(jogada);
      if (!move) continue; // jogada inválida: pede de novo
      for (const c of new Set(Object.values(controladores))) c.jogadaFeita?.(move, this);
      this.emitirStatus();
    }
    if (this.ativa) {
      this.ativa = false;
      this.eventos.fim?.(this.resultado());
    }
  }

  encerrar() {
    this.ativa = false;
    if (this.controladores) for (const c of new Set(Object.values(this.controladores))) c.cancelar?.();
  }

  async aplicar({ from, to, promotion }) {
    let move;
    try {
      move = this.chess.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return null;
    }

    const atacante = this.tab.elemento(move.from);
    // No en passant o peão capturado não está na casa de destino
    const vitimaCasa = move.captured ? (move.flags.includes('e') ? move.to[0] + move.from[1] : move.to) : null;
    const vitima = vitimaCasa ? this.tab.elemento(vitimaCasa) : null;

    this.tab.limparSelecao();
    this.eventos.jogada?.(move);

    if (atacante && vitima) {
      this.tab.pecas.delete(vitimaCasa);
      await animarCaptura(this.efeitos[move.piece] || 'espada', {
        tab: this.tab, atacante, vitima, de: move.from, para: move.to, vitimaCasa,
      });
    } else if (atacante) {
      sons.mover();
      await animarDeslize(this.tab, atacante, move.from, move.to);
    }
    this.tab.moverNoMapa(move.from, move.to);

    // Roque: a torre também anda
    if (move.flags.includes('k') || move.flags.includes('q')) {
      const linha = move.from[1];
      const [de, para] = move.flags.includes('k') ? [`h${linha}`, `f${linha}`] : [`a${linha}`, `d${linha}`];
      const torre = this.tab.elemento(de);
      this.tab.moverNoMapa(de, para);
      if (torre) await animarDeslize(this.tab, torre, de, para);
    }

    this.tab.sincronizar(this.chess.board()); // promoção troca a imagem do peão
    this.tab.marcarUltima(move.from, move.to);
    this.marcarXeque();

    if (this.chess.isCheckmate()) await animarXequeMate({ tab: this.tab, casaRei: this.casaDoRei(this.chess.turn()) });
    else if (this.chess.inCheck()) sons.xeque();
    return move;
  }

  casaDoRei(cor) {
    for (const linha of this.chess.board()) {
      for (const peca of linha) if (peca?.type === 'k' && peca.color === cor) return peca.square;
    }
    return null;
  }

  marcarXeque() {
    this.tab.marcarXeque(this.chess.inCheck() ? this.casaDoRei(this.chess.turn()) : null);
  }

  emitirStatus() {
    this.eventos.status?.({ vez: this.chess.turn(), xeque: this.chess.inCheck(), fim: this.chess.isGameOver() });
  }

  resultado() {
    const c = this.chess;
    if (c.isCheckmate()) return { tipo: 'mate', vencedor: c.turn() === 'w' ? 'b' : 'w' };
    if (c.isStalemate()) return { tipo: 'empate', motivo: 'Afogamento: quem joga não tem nenhum lance válido.' };
    if (c.isInsufficientMaterial()) return { tipo: 'empate', motivo: 'Não há peças suficientes para dar xeque-mate.' };
    if (c.isThreefoldRepetition()) return { tipo: 'empate', motivo: 'A mesma posição se repetiu três vezes.' };
    if (c.isDrawByFiftyMoves?.()) return { tipo: 'empate', motivo: '50 lances sem captura nem movimento de peão.' };
    return { tipo: 'empate', motivo: 'Empate.' };
  }
}
