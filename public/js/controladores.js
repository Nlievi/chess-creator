// Controladores: quem decide a jogada de cada lado.
// Local = alguém clicando neste aparelho. Bot e remoto (online) entram aqui depois, com o mesmo formato.

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
