// Telas do jogo: menu (modo + times), partida e janelas (promoção, fim, fotos, online, times no servidor).

import { Tabuleiro } from './tabuleiro.js';
import { Partida } from './partida.js';
import { ControladorLocal, ControladorBot, ControladorRemoto, NIVEIS_BOT } from './controladores.js';
import { TEMAS, TIPOS, NOMES_PECAS, montarTime } from './pecas.js';
import { sons, opcoesSom, destravarAudio } from './sons.js';
import { configurarAnimacoes, pularAnimacoes, EFEITOS_PADRAO, EFEITOS } from './animacoes.js';
import { abrirPersonalizacao } from './personalizar.js';

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const NOME_COR = { w: 'brancas', b: 'pretas' };
const outra = (cor) => (cor === 'w' ? 'b' : 'w');
const URL_PECA = /^\/pecas\/[a-f0-9]{16}\.png$/;

// ---------- preferências guardadas neste navegador (validadas: podem vir de versões antigas) ----------

const CHAVE = 'xadrez-ia';
const temaValido = (tema) => (TEMAS[tema] ? tema : 'classico');
const nomeValido = (nome, padrao) => (typeof nome === 'string' && nome.trim() ? nome.trim().slice(0, 20) : padrao);
const fotosValidas = (fotos) =>
  Object.fromEntries(TIPOS.filter((t) => URL_PECA.test(fotos?.[t] || '')).map((t) => [t, fotos[t]]));

function lerPreferencias() {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE));
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function salvarPreferencias() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({
      temas: estado.temas, nomes: estado.nomes, fotos: estado.fotos, modo: estado.modo, nivelBot: estado.nivelBot,
      animacoes: $('#opt-animacoes').checked, som: $('#opt-som').checked,
    }));
  } catch { /* navegador sem armazenamento: segue sem salvar */ }
}

const prefs = lerPreferencias();
const primeiraVisita = !prefs.temas && !prefs.fotos;
const estado = {
  config: {},
  efeitos: { ...EFEITOS_PADRAO },
  provedorIa: 'simulado',
  modo: ['local', 'bot', 'online'].includes(prefs.modo) ? prefs.modo : 'local',
  nivelBot: NIVEIS_BOT[prefs.nivelBot] ? prefs.nivelBot : 'medio',
  temas: { w: temaValido(prefs.temas?.w), b: temaValido(prefs.temas?.b) },
  nomes: { w: nomeValido(prefs.nomes?.w, 'Jogador 1'), b: nomeValido(prefs.nomes?.b, 'Jogador 2') },
  fotos: { w: fotosValidas(prefs.fotos?.w), b: fotosValidas(prefs.fotos?.b) },
  tabuleiro: null,
  partida: null,
  times: null,
  nomesPartida: null, // nomes da partida atual (no online vêm do servidor)
  minhaCor: null, // só no online: a cor deste aparelho
  socket: null,
};

// ---------- configuração vinda do servidor (config.json) ----------

function mostrarAviso(texto) {
  const aviso = $('#aviso');
  aviso.textContent = texto;
  aviso.hidden = !texto;
}

async function carregarConfig() {
  try {
    const resposta = await fetch('/api/config', { cache: 'no-store' });
    const config = await resposta.json();
    if (!resposta.ok) throw new Error(config.erro);
    estado.config = config;
  } catch (erro) {
    mostrarAviso(`Não consegui ler a configuração do servidor (${erro.message}). Usando os valores padrão.`);
    return;
  }
  const c = estado.config;
  if (c.titulo) {
    document.title = c.titulo;
    $('#titulo').textContent = c.titulo;
  }
  $('#boas-vindas').textContent = c.mensagemBoasVindas || '';
  if (c.corCasaClara) document.documentElement.style.setProperty('--casa-clara', c.corCasaClara);
  if (c.corCasaEscura) document.documentElement.style.setProperty('--casa-escura', c.corCasaEscura);
  configurarAnimacoes({ velocidade: Number(c.velocidadeAnimacoes) || 1 });
  for (const [tipo, efeito] of Object.entries(c.efeitos || {})) {
    if (EFEITOS.includes(efeito)) estado.efeitos[tipo] = efeito;
  }
  // Times guardados no servidor: valem em qualquer aparelho e sobrevivem à troca da URL do túnel
  $('#btn-usar-times').hidden = !c.timesPadrao;
  if (c.timesPadrao && primeiraVisita) aplicarTimesDoServidor();
}

async function carregarStatus() {
  try {
    const s = await (await fetch('/api/status', { cache: 'no-store' })).json();
    estado.provedorIa = s.ia;
    $('#servidor-info').textContent = `Servido por ${s.servidor} · porta ${s.porta} · IA: ${s.ia}`;
  } catch {
    $('#servidor-info').textContent = 'Sem resposta do servidor.';
  }
}

// ---------- menu ----------

function desenharTemas(cor) {
  const caixa = $(`.time[data-cor="${cor}"] .temas`);
  caixa.replaceChildren(...Object.entries(TEMAS).map(([id, tema]) => {
    const time = montarTime(id, cor);
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'tema';
    botao.setAttribute('aria-pressed', String(estado.temas[cor] === id));
    botao.innerHTML = `<span class="mini">${['k', 'q', 'n'].map((t) => `<img src="${time.pecas[t]}" alt="">`).join('')}</span><span>${tema.nome}</span>`;
    botao.addEventListener('click', () => {
      estado.temas[cor] = id;
      salvarPreferencias();
      desenharTemas(cor);
      desenharResumoFotos(cor);
    });
    return botao;
  }));
}

function desenharResumoFotos(cor) {
  const caixa = $(`.time[data-cor="${cor}"] .fotos-resumo`);
  const fotos = estado.fotos[cor];
  const tipos = TIPOS.filter((t) => fotos[t]);
  if (!tipos.length) {
    caixa.textContent = 'Nenhuma peça personalizada ainda.';
    return;
  }
  caixa.innerHTML = tipos.map((t) => `<figure><img src="${fotos[t]}" alt=""><figcaption>${NOMES_PECAS[t]}</figcaption></figure>`).join('');
}

function redesenharTimes() {
  for (const cor of ['w', 'b']) {
    $(`.time[data-cor="${cor}"] .nome`).value = estado.nomes[cor];
    desenharTemas(cor);
    desenharResumoFotos(cor);
  }
}

function aplicarTimesDoServidor() {
  const times = estado.config.timesPadrao || {};
  for (const cor of ['w', 'b']) {
    if (!times[cor]) continue;
    estado.temas[cor] = temaValido(times[cor].tema);
    estado.nomes[cor] = nomeValido(times[cor].nome, estado.nomes[cor]);
    estado.fotos[cor] = fotosValidas(times[cor].fotos);
  }
  salvarPreferencias();
  redesenharTimes();
}

// Mostra o trecho para colar no config.json (pelo SSH): é assim que os times ficam guardados no servidor
function abrirGuardarTimes() {
  const trecho = {};
  for (const cor of ['w', 'b']) trecho[cor] = { nome: estado.nomes[cor], tema: estado.temas[cor], fotos: estado.fotos[cor] };
  const dlg = $('#dlg-times');
  $('textarea', dlg).value = JSON.stringify(trecho, null, 2);
  $('.progresso', dlg).textContent = '';
  dlg.showModal();
}

const DESCRICOES_MODO = {
  local: 'Os dois jogadores se revezam neste aparelho.',
  bot: 'Você joga de brancas (time das Brancas) contra o Stockfish, que usa o time das Pretas.',
  online: 'Quem cria a sala joga de brancas com o time das Brancas; quem entra pelo link joga de pretas com o time das Pretas.',
};

function desenharModo() {
  for (const botao of document.querySelectorAll('.modo')) {
    botao.setAttribute('aria-pressed', String(botao.dataset.modo === estado.modo));
  }
  $('.niveis').hidden = estado.modo !== 'bot';
  for (const opcao of document.querySelectorAll('.niveis input')) opcao.checked = opcao.value === estado.nivelBot;
  $('#descricao-modo').textContent = DESCRICOES_MODO[estado.modo];
}

function prepararMenu() {
  for (const cor of ['w', 'b']) {
    const time = $(`.time[data-cor="${cor}"]`);
    const nome = $('.nome', time);
    nome.addEventListener('input', () => {
      estado.nomes[cor] = nomeValido(nome.value, cor === 'w' ? 'Jogador 1' : 'Jogador 2');
      salvarPreferencias();
    });
    $('.btn-foto', time).addEventListener('click', () => {
      abrirPersonalizacao({
        cor,
        tema: estado.temas[cor],
        fotos: estado.fotos[cor],
        provedor: estado.provedorIa,
        aoSalvar: (fotos) => {
          estado.fotos[cor] = fotos;
          salvarPreferencias();
          desenharResumoFotos(cor);
        },
      });
    });
  }
  redesenharTimes();

  for (const botao of document.querySelectorAll('.modo')) {
    botao.addEventListener('click', () => {
      estado.modo = botao.dataset.modo;
      salvarPreferencias();
      desenharModo();
    });
  }
  for (const opcao of document.querySelectorAll('.niveis input')) {
    opcao.addEventListener('change', () => {
      estado.nivelBot = opcao.value;
      salvarPreferencias();
    });
  }
  desenharModo();

  $('#btn-guardar-times').addEventListener('click', abrirGuardarTimes);
  $('#btn-usar-times').addEventListener('click', aplicarTimesDoServidor);
  $('#btn-jogar').addEventListener('click', () => {
    destravarAudio();
    if (estado.modo === 'online') abrirOnline();
    else iniciarPartida();
  });
}

// ---------- partida ----------

function trocarTela(id) {
  for (const tela of document.querySelectorAll('.tela')) tela.classList.toggle('ativa', tela.id === id);
  window.scrollTo(0, 0);
}

function desenharJogadores() {
  const deCima = estado.tabuleiro.orientacao === 'w' ? 'b' : 'w';
  for (const [id, cor] of [['#jogador-cima', deCima], ['#jogador-baixo', outra(deCima)]]) {
    const el = $(id);
    el.dataset.cor = cor;
    el.innerHTML = `<span class="selo selo-${cor}"></span><strong></strong><span class="capturadas" data-cor="${cor}"></span>`;
    $('strong', el).textContent = estado.nomesPartida[cor]; // textContent: nome digitado nunca vira HTML
  }
}

function atualizarStatus({ vez, xeque }) {
  const nome = estado.nomesPartida[vez];
  const minhaVez = estado.minhaCor === vez;
  let texto = minhaVez ? `Sua vez (${NOME_COR[vez]})` : `Vez de ${nome} (${NOME_COR[vez]})`;
  if (estado.modo === 'bot' && vez === 'b') texto = 'O computador está pensando…';
  if (xeque) texto = minhaVez ? 'Xeque! Salve o seu rei.' : `Xeque! ${nome} precisa salvar o rei.`;
  $('#status').textContent = texto;
  $('#status').classList.toggle('alerta', xeque);
  for (const el of document.querySelectorAll('.jogador')) el.classList.toggle('vez', el.dataset.cor === vez);
}

function registrarCaptura(move) {
  if (!move.captured) return;
  const img = document.createElement('img');
  img.src = estado.times[outra(move.color)].pecas[move.captured];
  img.alt = NOMES_PECAS[move.captured];
  $(`.capturadas[data-cor="${move.color}"]`)?.appendChild(img);
}

function mostrarFim(resultado) {
  const dlg = $('#dlg-fim');
  if (resultado.tipo === 'mate') {
    const vencedor = estado.nomesPartida[resultado.vencedor];
    sons.vitoria();
    $('#fim-titulo').textContent = 'Xeque-mate!';
    $('#fim-texto').textContent = (estado.config.mensagemVitoria || '{vencedor} venceu!').replace('{vencedor}', vencedor);
    $('#status').textContent = `${vencedor} venceu!`;
  } else if (resultado.tipo === 'interrompida') {
    $('#fim-titulo').textContent = 'Partida encerrada';
    $('#fim-texto').textContent = resultado.motivo;
    $('#status').textContent = resultado.motivo;
  } else {
    sons.empate();
    $('#fim-titulo').textContent = 'Empate';
    $('#fim-texto').textContent = resultado.motivo;
    $('#status').textContent = 'Empate.';
  }
  $('#fim-novamente').textContent = estado.modo === 'online' ? 'Nova sala' : 'Jogar de novo';
  if (!dlg.open) dlg.showModal();
}

function escolherPromocao(cor) {
  const dlg = $('#dlg-promocao');
  const opcoes = $('.promo-opcoes', dlg);
  return new Promise((resolve) => {
    const responder = (tipo) => {
      dlg.removeEventListener('cancel', desistir);
      if (dlg.open) dlg.close();
      resolve(tipo);
    };
    const desistir = () => responder(null); // tecla Esc
    opcoes.replaceChildren(...['q', 'r', 'b', 'n'].map((tipo) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.title = NOMES_PECAS[tipo];
      botao.innerHTML = `<img src="${estado.times[cor].pecas[tipo]}" alt="${NOMES_PECAS[tipo]}">`;
      botao.addEventListener('click', () => responder(tipo));
      return botao;
    }));
    dlg.addEventListener('cancel', desistir);
    dlg.showModal();
  });
}

// Começa uma partida em qualquer modo. Cada partida ganha um tabuleiro novo: se a anterior ainda estiver
// terminando uma animação, ela mexe num tabuleiro que já saiu da tela.
function comecar({ times, nomes, controladores, orientacao = 'w', minhaCor = null }) {
  estado.partida?.encerrar();
  trocarTela('tela-jogo');
  estado.times = times;
  estado.nomesPartida = nomes;
  estado.minhaCor = minhaCor;
  estado.tabuleiro = new Tabuleiro($('#tabuleiro'), { orientacao });
  estado.tabuleiro.aoClicarLivre = pularAnimacoes;
  desenharJogadores();
  $('#btn-reiniciar').hidden = estado.modo === 'online';
  estado.partida = new Partida({
    tabuleiro: estado.tabuleiro,
    times,
    nomes,
    efeitos: estado.efeitos,
    eventos: { status: atualizarStatus, jogada: registrarCaptura, fim: mostrarFim },
  });
  estado.partida.iniciar(controladores);
}

function timesDoMenu() {
  return {
    w: montarTime(estado.temas.w, 'w', estado.fotos.w),
    b: montarTime(estado.temas.b, 'b', estado.fotos.b),
  };
}

function iniciarPartida() {
  const local = new ControladorLocal({ escolherPromocao });
  if (estado.modo === 'bot') {
    comecar({
      times: timesDoMenu(),
      nomes: { w: estado.nomes.w, b: `Computador (${NIVEIS_BOT[estado.nivelBot].nome})` },
      controladores: { w: local, b: new ControladorBot(estado.nivelBot) },
      minhaCor: 'w',
    });
  } else {
    comecar({ times: timesDoMenu(), nomes: { ...estado.nomes }, controladores: { w: local, b: local } });
  }
}

function voltarAoMenu() {
  estado.partida?.encerrar();
  sairDaSala();
  trocarTela('tela-inicio');
}

// ---------- modo online (Socket.IO) ----------

function carregarScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`não consegui carregar ${src}`));
    document.head.appendChild(script);
  });
}

async function conectar() {
  if (estado.socket?.connected) return estado.socket;
  await carregarScript('/socket.io/socket.io.js');
  // Sem reconexão automática: se a conexão cair, a sala acaba no servidor e a partida termina aqui também
  const socket = window.io({ reconnection: false });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', () => reject(new Error('Não consegui conectar ao servidor.')));
  });
  socket.on('disconnect', () => {
    if (estado.partida?.ativa && estado.modo === 'online') {
      estado.partida.encerrar();
      mostrarFim({ tipo: 'interrompida', motivo: 'A conexão com o servidor caiu.' });
    }
    estado.socket = null;
  });
  estado.socket = socket;
  return socket;
}

function sairDaSala() {
  estado.socket?.emit('sairSala');
}

function emitir(evento, dados) {
  return new Promise((resolve) => estado.socket.emit(evento, dados, resolve));
}

function linkDaSala(codigo) {
  return `${location.origin}/?sala=${codigo}`;
}

async function desenharQr(alvo, texto) {
  try {
    await carregarScript('/vendor/qrcode/qrcode.js');
    const qr = window.qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    alvo.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch {
    alvo.textContent = ''; // sem QR code, o link e o código continuam valendo
  }
}

function abrirOnline(codigoDoLink = '') {
  const dlg = $('#dlg-online');
  const progresso = $('.progresso', dlg);
  $('.online-escolha', dlg).hidden = false;
  $('.online-espera', dlg).hidden = true;
  $('#codigo-sala').value = codigoDoLink;
  progresso.textContent = codigoDoLink ? 'Você foi convidado para esta sala. Toque em Entrar.' : '';
  if (!dlg.open) dlg.showModal();
}

function iniciarPartidaOnline({ minhaCor, times, nomes }) {
  $('#dlg-online').close();
  history.replaceState(null, '', location.pathname); // tira o ?sala= da barra: F5 não tenta entrar de novo
  const socket = estado.socket;
  socket.off('adversarioSaiu');
  socket.on('adversarioSaiu', () => {
    if (!estado.partida?.ativa) return;
    estado.partida.encerrar();
    mostrarFim({ tipo: 'interrompida', motivo: 'O adversário saiu da partida.' });
  });
  const local = new ControladorLocal({ escolherPromocao });
  const remoto = new ControladorRemoto({ socket, minhaCor, aoErro: (erro) => mostrarAviso(`Servidor: ${erro}`) });
  comecar({
    times: { w: montarTime(times.w.tema, 'w', times.w.fotos), b: montarTime(times.b.tema, 'b', times.b.fotos) },
    nomes,
    controladores: minhaCor === 'w' ? { w: local, b: remoto } : { w: remoto, b: local },
    orientacao: minhaCor,
    minhaCor,
  });
}

function prepararOnline() {
  const dlg = $('#dlg-online');
  const progresso = $('.progresso', dlg);

  $('[data-acao=criar]', dlg).addEventListener('click', async () => {
    progresso.textContent = 'Criando a sala…';
    try {
      await conectar();
      const r = await emitir('criarSala', { nome: estado.nomes.w, time: { tema: estado.temas.w, fotos: estado.fotos.w } });
      if (r.erro) throw new Error(r.erro);
      const link = linkDaSala(r.codigo);
      $('.online-escolha', dlg).hidden = true;
      $('.online-espera', dlg).hidden = false;
      $('.codigo-grande', dlg).textContent = r.codigo;
      $('#link-sala').value = link;
      progresso.textContent = 'Aguardando o adversário entrar…';
      desenharQr($('.qr', dlg), link);
      estado.socket.off('adversarioEntrou');
      estado.socket.once('adversarioEntrou', (dados) => iniciarPartidaOnline({ ...dados, minhaCor: 'w' }));
    } catch (erro) {
      progresso.textContent = erro.message;
    }
  });

  const entrar = async () => {
    const codigo = $('#codigo-sala').value.trim().toUpperCase();
    if (codigo.length !== 4) {
      progresso.textContent = 'O código tem 4 letras/números.';
      return;
    }
    destravarAudio();
    progresso.textContent = 'Entrando…';
    try {
      await conectar();
      const r = await emitir('entrarSala', { codigo, nome: estado.nomes.b, time: { tema: estado.temas.b, fotos: estado.fotos.b } });
      if (r.erro) throw new Error(r.erro);
      iniciarPartidaOnline({ ...r, minhaCor: 'b' });
    } catch (erro) {
      progresso.textContent = erro.message;
    }
  };
  $('[data-acao=entrar]', dlg).addEventListener('click', entrar);
  $('#codigo-sala').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      entrar();
    }
  });

  $('[data-acao=copiar-link]', dlg).addEventListener('click', () => copiar($('#link-sala'), progresso, 'Link copiado.'));
  $('[data-acao=cancelar]', dlg).addEventListener('click', () => {
    sairDaSala();
    dlg.close();
  });
  dlg.addEventListener('cancel', sairDaSala);

  // Abriu o link de convite (?sala=ABCD): já vai para o modo online com o código preenchido
  const codigo = new URLSearchParams(location.search).get('sala');
  if (codigo && /^[A-Za-z0-9]{4}$/.test(codigo)) {
    estado.modo = 'online';
    desenharModo();
    abrirOnline(codigo.toUpperCase());
  }
}

// ---------- utilidades das janelas ----------

async function copiar(campo, aviso, mensagem) {
  try {
    await navigator.clipboard.writeText(campo.value);
    aviso.textContent = mensagem;
  } catch {
    campo.select();
    aviso.textContent = 'Selecionei o texto: use Ctrl+C para copiar.';
  }
}

function prepararJanelaTimes() {
  const dlg = $('#dlg-times');
  $('[data-acao=copiar]', dlg).addEventListener('click', () => copiar($('textarea', dlg), $('.progresso', dlg), 'Copiado! Agora cole no config.json do servidor.'));
  $('[data-acao=fechar]', dlg).addEventListener('click', () => dlg.close());
}

function prepararJogo() {
  $('#btn-girar').addEventListener('click', () => {
    estado.tabuleiro.girar();
    const capturadas = {};
    for (const el of document.querySelectorAll('.capturadas')) capturadas[el.dataset.cor] = el.innerHTML;
    desenharJogadores();
    for (const el of document.querySelectorAll('.capturadas')) el.innerHTML = capturadas[el.dataset.cor];
    // Depois do fim da partida o texto de resultado fica como está
    if (estado.partida?.ativa) atualizarStatus({ vez: estado.partida.chess.turn(), xeque: estado.partida.chess.inCheck() });
  });
  $('#btn-reiniciar').addEventListener('click', iniciarPartida);
  $('#btn-menu').addEventListener('click', voltarAoMenu);
  $('#fim-novamente').addEventListener('click', () => {
    $('#dlg-fim').close();
    if (estado.modo === 'online') {
      sairDaSala();
      trocarTela('tela-inicio');
      abrirOnline();
    } else {
      iniciarPartida();
    }
  });
  $('#fim-menu').addEventListener('click', () => {
    $('#dlg-fim').close();
    voltarAoMenu();
  });

  const animacoes = $('#opt-animacoes');
  const som = $('#opt-som');
  const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  animacoes.checked = prefs.animacoes ?? !reduzirMovimento;
  som.checked = prefs.som ?? true;
  configurarAnimacoes({ ativadas: animacoes.checked });
  opcoesSom.ligado = som.checked;
  animacoes.addEventListener('change', () => {
    configurarAnimacoes({ ativadas: animacoes.checked });
    salvarPreferencias();
  });
  som.addEventListener('change', () => {
    opcoesSom.ligado = som.checked;
    salvarPreferencias();
  });
}

prepararMenu();
prepararJogo();
prepararOnline();
prepararJanelaTimes();
carregarConfig();
carregarStatus();
