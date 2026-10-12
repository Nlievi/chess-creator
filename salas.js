// Modo online: salas com Socket.IO. O servidor guarda as salas na memória e confere cada jogada com o chess.js,
// então os dois aparelhos sempre têm o mesmo tabuleiro (e ninguém consegue mandar jogada ilegal).
//   cliente -> servidor: criarSala({ nome, time }) | entrarSala({ codigo, nome, time }) | jogada({ from, to, promotion }) | sairSala()
//   servidor -> cliente: adversarioEntrou({ codigo, fen, times, nomes }) | jogada({ from, to, promotion }) | adversarioSaiu()
// Se o processo do servidor parar, as salas somem (estão só na memória).

const { Chess } = require('chess.js');

const MAX_SALAS = 200;
const CARACTERES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, que se confundem
const URL_PECA = /^\/pecas\/[a-f0-9]{16}\.png$/;
const TEMAS = ['classico', 'realeza', 'neon', 'elementos', 'madeira'];
const salas = new Map(); // codigo -> { chess, jogadores: { w, b }, times: { w, b }, nomes: { w, b }, criadaEm }

function novoCodigo() {
  let codigo;
  do {
    codigo = Array.from({ length: 4 }, () => CARACTERES[Math.floor(Math.random() * CARACTERES.length)]).join('');
  } while (salas.has(codigo));
  return codigo;
}

// O time de um jogador vai para o outro aparelho: aceita só um tema conhecido e peças guardadas neste servidor
function limparTime(time) {
  const fotos = {};
  for (const tipo of 'kqrbnp') {
    if (URL_PECA.test(time?.fotos?.[tipo] || '')) fotos[tipo] = time.fotos[tipo];
  }
  return { tema: TEMAS.includes(time?.tema) ? time.tema : 'classico', fotos };
}

function limparNome(nome, padrao) {
  return String(nome || '').replace(/[<>&"]/g, '').trim().slice(0, 20) || padrao;
}

// Sala criada e abandonada sem adversário some depois de 2 horas
setInterval(() => {
  const limite = Date.now() - 2 * 60 * 60 * 1000;
  for (const [codigo, sala] of salas) if (!sala.jogadores.b && sala.criadaEm < limite) salas.delete(codigo);
}, 10 * 60 * 1000).unref();

function registrarSalas(io) {
  io.on('connection', (socket) => {
    let minhaSala = null;
    let minhaCor = null;
    const responder = (callback, resposta) => typeof callback === 'function' && callback(resposta);

    function sairDaSala() {
      if (!minhaSala) return;
      if (salas.has(minhaSala)) {
        socket.to(minhaSala).emit('adversarioSaiu');
        salas.delete(minhaSala); // a partida acaba quando um dos dois sai
        console.log(`[online] sala ${minhaSala} encerrada`);
      }
      socket.leave(minhaSala);
      minhaSala = null;
      minhaCor = null;
    }

    socket.on('criarSala', (dados, callback) => {
      sairDaSala();
      if (salas.size >= MAX_SALAS) return responder(callback, { erro: 'Servidor cheio. Tente mais tarde.' });
      const codigo = novoCodigo();
      salas.set(codigo, {
        chess: new Chess(),
        jogadores: { w: socket.id, b: null },
        times: { w: limparTime(dados?.time), b: null },
        nomes: { w: limparNome(dados?.nome, 'Brancas'), b: null },
        criadaEm: Date.now(),
      });
      minhaSala = codigo;
      minhaCor = 'w';
      socket.join(codigo);
      console.log(`[online] sala ${codigo} criada`);
      responder(callback, { codigo, cor: 'w' });
    });

    socket.on('entrarSala', (dados, callback) => {
      const codigo = String(dados?.codigo || '').toUpperCase().trim();
      const sala = salas.get(codigo);
      if (!sala) return responder(callback, { erro: 'Sala não encontrada. Confira o código.' });
      if (sala.jogadores.w === socket.id) return responder(callback, { erro: 'Você criou essa sala; abra o link em outro aparelho.' });
      if (sala.jogadores.b) return responder(callback, { erro: 'Essa sala já tem dois jogadores.' });
      sairDaSala();
      sala.jogadores.b = socket.id;
      sala.times.b = limparTime(dados?.time);
      sala.nomes.b = limparNome(dados?.nome, 'Pretas');
      minhaSala = codigo;
      minhaCor = 'b';
      socket.join(codigo);
      const inicio = { codigo, fen: sala.chess.fen(), times: sala.times, nomes: sala.nomes };
      socket.to(codigo).emit('adversarioEntrou', inicio);
      console.log(`[online] sala ${codigo}: o segundo jogador entrou`);
      responder(callback, { ...inicio, cor: 'b' });
    });

    socket.on('jogada', (jogada, callback) => {
      const sala = salas.get(minhaSala);
      if (!sala || !sala.jogadores.b) return responder(callback, { erro: 'A partida ainda não começou.' });
      if (sala.chess.turn() !== minhaCor) return responder(callback, { erro: 'Não é a sua vez.' });
      let move;
      try {
        move = sala.chess.move({ from: String(jogada?.from), to: String(jogada?.to), promotion: String(jogada?.promotion || 'q') });
      } catch {
        return responder(callback, { erro: 'Jogada inválida.' });
      }
      socket.to(minhaSala).emit('jogada', { from: move.from, to: move.to, promotion: move.promotion });
      responder(callback, { ok: true });
      if (sala.chess.isGameOver()) console.log(`[online] sala ${minhaSala}: fim de jogo`);
    });

    socket.on('sairSala', sairDaSala);
    socket.on('disconnect', sairDaSala);
  });
}

module.exports = { registrarSalas };
