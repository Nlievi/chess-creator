// Controladores: quem decide a jogada de cada lado. Todos seguem o mesmo formato:
//   pedirJogada(partida) -> Promise<{ from, to, promotion? }>; opcionais: jogadaFeita(move), cancelar()
// Local = alguém clicando neste aparelho; Bot = Stockfish no navegador; Remoto = o adversário do modo online.

export class ControladorLocal {
  constructor({ escolherPromocao }) {
    this.escolherPromocao = escolherPromocao; // (cor) -> Promise<'q'|'r'|'b'|'n'|null>
    this.cancelar = null;
  }

  pedirJogada(partida) {
    const { chess, tab } = partida;
    const cor = chess.turn();

    return new Promise((resolve, reject) => {
      let selecionada = null;

      const selecionar = (casa) => {
        selecionada = casa;
        const destinos = chess.moves({ square: casa, verbose: true }).map((m) => ({ casa: m.to, captura: !!m.captured }));
        tab.mostrarSelecao(casa, destinos);
      };

      const aoClicar = async (casa) => {
        if (selecionada) {
          const lances = chess.moves({ square: selecionada, verbose: true }).filter((m) => m.to === casa);
          if (lances.length) {
            let promotion;
            if (lances[0].promotion) {
              tab.entrada = null;
              promotion = await this.escolherPromocao(cor);
              if (!promotion) {
                tab.entrada = aoClicar; // desistiu da promoção: continua escolhendo
                return;
              }
            }
            tab.entrada = null;
            this.cancelar = null;
            resolve({ from: selecionada, to: casa, promotion });
            return;
          }
        }
        const peca = chess.get(casa);
        if (peca && peca.color === cor && casa !== selecionada) selecionar(casa);
        else {
          selecionada = null;
          tab.limparSelecao();
        }
      };

      tab.entrada = aoClicar;
      this.cancelar = () => {
        tab.entrada = null;
        tab.limparSelecao();
        reject(new Error('partida encerrada'));
      };
    });
  }
}

// ---------- Bot: Stockfish (versão "lite", uma thread) rodando num Web Worker, no navegador do jogador ----------

// elo: a opção UCI_Elo do Stockfish limita a força dele para jogar como alguém daquele rating
// (escala calibrada pelo próprio Stockfish, de 1320 a 3190). 0 = sem limite: força máxima.
export const NIVEIS_BOT = {
  facil: { nome: 'Fácil', elo: 1320, tempo: 150 },
  medio: { nome: 'Médio', elo: 1800, tempo: 400 },
  dificil: { nome: 'Difícil', elo: 0, tempo: 1000 },
};

export function ratingDoNivel(nivel) {
  return nivel.elo ? String(nivel.elo) : '3190+';
}

let motor = null; // um Worker só, reaproveitado entre partidas

function iniciarMotor() {
  if (motor) return motor;
  const worker = new Worker('/vendor/stockfish/stockfish-19-lite-single.js');
  const ouvintes = new Set();
  worker.onmessage = (e) => ouvintes.forEach((f) => f(String(e.data)));
  // Manda um comando e espera a linha que começa com `esperar`
  const pedir = (comando, esperar) => new Promise((resolve, reject) => {
    const tempoMaximo = setTimeout(() => { ouvintes.delete(ouvir); reject(new Error('o motor não respondeu')); }, 15000);
    const ouvir = (linha) => {
      if (!linha.startsWith(esperar)) return;
      clearTimeout(tempoMaximo);
      ouvintes.delete(ouvir);
      resolve(linha);
    };
    ouvintes.add(ouvir);
    worker.postMessage(comando);
  });
  motor = { worker, pedir, pronto: pedir('uci', 'uciok') };
  worker.onerror = () => { motor = null; };
  return motor;
}

// Plano B se o Stockfish não carregar: prefere capturas, senão uma jogada qualquer
function jogadaSimples(chess) {
  const lances = chess.moves({ verbose: true });
  const capturas = lances.filter((m) => m.captured);
  const escolha = (capturas.length ? capturas : lances)[Math.floor(Math.random() * (capturas.length || lances.length))];
  return { from: escolha.from, to: escolha.to, promotion: escolha.promotion };
}

export class ControladorBot {
  constructor(nivel = 'medio') {
    this.nivel = NIVEIS_BOT[nivel] || NIVEIS_BOT.medio;
    this.cancelar = null;
  }

  async calcular(chess) {
    const m = iniciarMotor();
    await m.pronto;
    // O motor é reaproveitado entre partidas: sempre liga ou desliga o limite
    const { elo } = this.nivel;
    m.worker.postMessage(`setoption name UCI_LimitStrength value ${elo ? 'true' : 'false'}`);
    if (elo) m.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
    await m.pedir('isready', 'readyok');
    m.worker.postMessage(`position fen ${chess.fen()}`);
    const linha = await m.pedir(`go movetime ${this.nivel.tempo}`, 'bestmove');
    const lance = linha.split(' ')[1];
    if (!lance || lance === '(none)') throw new Error('sem lance');
    return { from: lance.slice(0, 2), to: lance.slice(2, 4), promotion: lance[4] };
  }

  pedirJogada(partida) {
    return new Promise((resolve, reject) => {
      let cancelado = false;
      this.cancelar = () => { cancelado = true; reject(new Error('partida encerrada')); };
      const inicio = Date.now();
      this.calcular(partida.chess)
        .catch(() => jogadaSimples(partida.chess))
        .then(async (jogada) => {
          // Um pequeno "pensando" para a jogada do bot não aparecer instantânea
          const espera = 600 - (Date.now() - inicio);
          if (espera > 0) await new Promise((r) => setTimeout(r, espera));
          if (!cancelado) resolve(jogada);
        });
    });
  }
}

// ---------- Remoto: o adversário do modo online (as jogadas chegam pelo Socket.IO) ----------

export class ControladorRemoto {
  constructor({ socket, minhaCor, aoErro }) {
    this.socket = socket;
    this.minhaCor = minhaCor;
    this.aoErro = aoErro;
    this.fila = [];
    this.esperando = null; // { resolve, reject } enquanto a partida espera a jogada do adversário
    this.aoReceber = (jogada) => {
      if (this.esperando) {
        const { resolve } = this.esperando;
        this.esperando = null;
        resolve(jogada);
      } else {
        this.fila.push(jogada);
      }
    };
    socket.on('jogada', this.aoReceber);
  }

  pedirJogada() {
    if (this.fila.length) return Promise.resolve(this.fila.shift());
    return new Promise((resolve, reject) => {
      this.esperando = { resolve, reject };
    });
  }

  // Fim da partida (ou Menu/Reiniciar): para de ouvir o adversário, seja a vez de quem for
  cancelar() {
    this.socket.off('jogada', this.aoReceber);
    if (this.esperando) {
      this.esperando.reject(new Error('partida encerrada'));
      this.esperando = null;
    }
  }

  // Toda jogada feita neste aparelho vai para o servidor, que confere e repassa ao adversário
  jogadaFeita(move) {
    if (move.color !== this.minhaCor) return;
    this.socket.emit('jogada', { from: move.from, to: move.to, promotion: move.promotion }, (resposta) => {
      if (resposta?.erro) this.aoErro?.(resposta.erro);
    });
  }
}
