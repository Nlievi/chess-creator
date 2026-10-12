// Telas do jogo: menu (modo + times), partida e janelas (promoção, fim, fotos).

import { Tabuleiro } from './tabuleiro.js';
import { Partida } from './partida.js';
import { ControladorLocal } from './controladores.js';
import { TEMAS, TIPOS, NOMES_PECAS, montarTime } from './pecas.js';
import { sons, opcoesSom, destravarAudio } from './sons.js';
import { configurarAnimacoes, pularAnimacoes, EFEITOS_PADRAO, EFEITOS } from './animacoes.js';
import { abrirPersonalizacao } from './personalizar.js';

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const NOME_COR = { w: 'brancas', b: 'pretas' };
const outra = (cor) => (cor === 'w' ? 'b' : 'w');

// ---------- preferências guardadas neste navegador ----------

const CHAVE = 'xadrez-ia';
function lerPreferencias() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { return {}; }
}
function salvarPreferencias() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({
      temas: estado.temas, nomes: estado.nomes, fotos: estado.fotos,
      animacoes: $('#opt-animacoes').checked, som: $('#opt-som').checked,
    }));
  } catch { /* navegador sem armazenamento: segue sem salvar */ }
}

const prefs = lerPreferencias();
const estado = {
  config: {},
  efeitos: { ...EFEITOS_PADRAO },
  provedorIa: 'simulado',
  temas: { w: 'classico', b: 'classico', ...prefs.temas },
  nomes: { w: 'Jogador 1', b: 'Jogador 2', ...prefs.nomes },
  fotos: { w: {}, b: {}, ...prefs.fotos },
  tabuleiro: null,
  partida: null,
  times: null,
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
}

async function carregarStatus() {
  try {
    const s = await (await fetch('/api/status', { cache: 'no-store' })).json();
    estado.provedorIa = s.ia;
    $('#servidor-info').innerHTML = `Servido por <strong>${s.servidor}</strong> · porta ${s.porta} · IA: ${s.ia}`;
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
    caixa.textContent = 'Nenhuma peça com foto ainda.';
    return;
  }
  caixa.innerHTML = tipos.map((t) => `<figure><img src="${fotos[t]}" alt=""><figcaption>${NOMES_PECAS[t]}</figcaption></figure>`).join('');
}

function prepararMenu() {
  for (const cor of ['w', 'b']) {
    const time = $(`.time[data-cor="${cor}"]`);
    const nome = $('.nome', time);
    nome.value = estado.nomes[cor];
    nome.addEventListener('input', () => {
      estado.nomes[cor] = nome.value.trim() || (cor === 'w' ? 'Jogador 1' : 'Jogador 2');
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
    desenharTemas(cor);
    desenharResumoFotos(cor);
  }
  $('#btn-jogar').addEventListener('click', () => {
    destravarAudio();
    iniciarPartida();
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
    $('strong', el).textContent = estado.nomes[cor]; // textContent: nome digitado nunca vira HTML
  }
}

function atualizarStatus({ vez, xeque }) {
  const nome = estado.nomes[vez];
  $('#status').textContent = xeque ? `Xeque! ${nome} precisa salvar o rei.` : `Vez de ${nome} (${NOME_COR[vez]})`;
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
    const vencedor = estado.nomes[resultado.vencedor];
    sons.vitoria();
    $('#fim-titulo').textContent = 'Xeque-mate!';
    $('#fim-texto').textContent = (estado.config.mensagemVitoria || '{vencedor} venceu!').replace('{vencedor}', vencedor);
    $('#status').textContent = `${vencedor} venceu!`;
  } else {
    sons.empate();
    $('#fim-titulo').textContent = 'Empate';
    $('#fim-texto').textContent = resultado.motivo;
    $('#status').textContent = 'Empate.';
  }
  dlg.showModal();
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

function iniciarPartida() {
  estado.partida?.encerrar();
  trocarTela('tela-jogo');

  estado.times = {
    w: montarTime(estado.temas.w, 'w', estado.fotos.w),
    b: montarTime(estado.temas.b, 'b', estado.fotos.b),
  };
  if (!estado.tabuleiro) {
    estado.tabuleiro = new Tabuleiro($('#tabuleiro'));
    estado.tabuleiro.aoClicarLivre = pularAnimacoes;
  }
  desenharJogadores();

  estado.partida = new Partida({
    tabuleiro: estado.tabuleiro,
    times: estado.times,
    nomes: estado.nomes,
    efeitos: estado.efeitos,
    eventos: { status: atualizarStatus, jogada: registrarCaptura, fim: mostrarFim },
  });
  const local = new ControladorLocal({ escolherPromocao });
  estado.partida.iniciar({ w: local, b: local });
}

function voltarAoMenu() {
  estado.partida?.encerrar();
  trocarTela('tela-inicio');
}

function prepararJogo() {
  $('#btn-girar').addEventListener('click', () => {
    estado.tabuleiro.girar();
    const capturadas = {};
    for (const el of document.querySelectorAll('.capturadas')) capturadas[el.dataset.cor] = el.innerHTML;
    desenharJogadores();
    for (const el of document.querySelectorAll('.capturadas')) el.innerHTML = capturadas[el.dataset.cor];
    if (estado.partida) atualizarStatus({ vez: estado.partida.chess.turn(), xeque: estado.partida.chess.inCheck() });
  });
  $('#btn-reiniciar').addEventListener('click', iniciarPartida);
  $('#btn-menu').addEventListener('click', voltarAoMenu);
  $('#fim-novamente').addEventListener('click', () => {
    $('#dlg-fim').close();
    iniciarPartida();
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
carregarConfig();
carregarStatus();
