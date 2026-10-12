// Modo online (salas com Socket.IO) — próxima etapa (Pessoa 3).
// Contrato combinado:
//   cliente -> servidor: criarSala(time) -> { codigo } | entrarSala({ codigo, time }) | jogada({ from, to, promotion })
//   servidor -> cliente: estado({ fen, times, vez }) | jogada({ from, to, promotion }) | adversarioSaiu()
// O servidor guarda as salas na memória e confere cada jogada com o chess.js.

function registrarSalas(io) {
  io.on('connection', (socket) => {
    socket.emit('aviso', 'Modo online ainda em construção.');
  });
}

module.exports = { registrarSalas };
