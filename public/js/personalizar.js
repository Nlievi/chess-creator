// Janela "Peças personalizadas". Dois modos:
// - "personagem": o busto do personagem (cores originais) sai de um pedestal de xadrez com medalhão dourado.
//                 Instantâneo; funciona com personagens famosos e sem internet.
// - "pessoa":     a foto vai para a IA (POST /api/gerar), que desenha a peça com a cabeça da pessoa
// Nos dois, a peça final (PNG sem fundo) vai para POST /api/pecas, que guarda no servidor.

import { TEMAS, TIPOS, NOMES_PECAS, montarTime } from './pecas.js';
import { carregarImagem, reduzirFoto, recortarFundo, enquadrar } from './recorte.js';
import { montarPersonagem, recortarBusto } from './personagem.js';

async function postarJson(url, corpo) {
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw Object.assign(new Error(json.erro || `O servidor respondeu ${resposta.status}.`), { bloqueado: !!json.bloqueado });
  return json;
}

export function abrirPersonalizacao({ cor, tema, fotos, provedor, aoSalvar }) {
  const dlg = document.getElementById('dlg-fotos');
  const resultado = { ...fotos };
  // Começa marcando só a próxima peça sem personagem: facilita ter um personagem diferente em cada peça
  const selecionadas = new Set([TIPOS.find((t) => !fotos[t]) || 'k']);
  const temIa = provedor === 'cloudflare';
  const paleta = TEMAS[tema][cor === 'w' ? 'claro' : 'escuro'];
  let foto = null; // foto reduzida (data URL)
  let figura = null; // a figura inteira já sem fundo (com .deslocamento dentro da foto)
  let caixa = null; // retângulo do busto, em pixels da foto: { x, y, largura, altura }
  let gerando = false;

  dlg.innerHTML = `
    <form method="dialog" class="fotos-janela">
      <h2>Peças personalizadas — ${cor === 'w' ? 'Brancas' : 'Pretas'}</h2>
      <div class="estilos" role="radiogroup" aria-label="Como criar as peças">
        <label class="estilo"><input type="radio" name="modo" value="personagem" checked>
          <strong>Personagem</strong>
          <small>O personagem sai de um pedestal de xadrez com medalhão. Para desenhos (fundo liso).</small></label>
        <label class="estilo"><input type="radio" name="modo" value="pessoa" ${temIa ? '' : 'disabled'}>
          <strong>Foto de pessoa</strong>
          <small>${temIa ? 'A IA desenha a peça com a cabeça da pessoa.' : 'Indisponível: configure o Cloudflare no .env.'}</small></label>
      </div>

      <label class="escolher-foto">
        <input type="file" accept="image/*" hidden>
        <img alt="" hidden>
        <span>Escolher imagem</span>
      </label>

      <div class="editor-cara" hidden>
        <p class="rotulo">Arraste o retângulo para pegar a cabeça e o tronco do personagem; puxe o canto para mudar o tamanho.</p>
        <div class="editor-linha">
          <div class="area-recorte"><img class="imagem-recorte" alt=""><div class="quadro"><span class="alca"></span></div></div>
          <div class="previa-personagem"><img alt="Prévia do rei"><span>Prévia do rei</span></div>
        </div>
      </div>

      <div data-secao="quem" hidden>
        <label class="rotulo" for="quem-e">Quem é? <small>(opcional: "minha avó", "o professor")</small></label>
        <input id="quem-e" class="quem-e" maxlength="60" autocomplete="off">
      </div>

      <p class="rotulo">Em quais peças? <small>Um personagem diferente em cada peça: gere uma de cada vez,
        trocando a imagem entre uma e outra.</small></p>
      <div class="grade-pecas"></div>
      <p class="progresso" aria-live="polite"></p>
      <div class="acoes">
        <button type="button" class="primario" data-acao="gerar">Gerar peças</button>
        <button value="ok">Concluir</button>
      </div>
    </form>`;

  const $ = (seletor) => dlg.querySelector(seletor);
  const entrada = $('input[type=file]');
  const previaFoto = $('.escolher-foto img');
  const textoFoto = $('.escolher-foto span');
  const editor = $('.editor-cara');
  const imagemRecorte = $('.imagem-recorte');
  const quadro = $('.quadro');
  const previaRei = $('.previa-personagem img');
  const grade = $('.grade-pecas');
  const progresso = $('.progresso');
  const botaoGerar = $('[data-acao=gerar]');
  const modoAtual = () => $('input[name=modo]:checked')?.value || 'personagem';

  function mostrarSecoes() {
    const modo = modoAtual();
    editor.hidden = modo !== 'personagem' || !foto;
    previaFoto.hidden = !foto || modo === 'personagem';
    $('[data-secao=quem]').hidden = modo !== 'pessoa';
    progresso.textContent = '';
  }
  $('.estilos').addEventListener('change', mostrarSecoes);

  // ---------- grade de peças ----------

  function desenharGrade() {
    const time = montarTime(tema, cor, resultado);
    grade.replaceChildren(...TIPOS.map((tipo) => {
      const item = document.createElement('label');
      item.className = 'opcao-peca';
      item.innerHTML = `
        <input type="checkbox" value="${tipo}" ${selecionadas.has(tipo) ? 'checked' : ''}>
        <img src="${time.pecas[tipo]}" alt="">
        <span>${NOMES_PECAS[tipo]}</span>
        ${resultado[tipo] ? `<button type="button" class="remover" data-tipo="${tipo}" title="Voltar para a peça do tema">×</button>` : ''}`;
      return item;
    }));
  }

  grade.addEventListener('change', (e) => {
    if (e.target.checked) selecionadas.add(e.target.value);
    else selecionadas.delete(e.target.value);
  });

  // Salva a cada mudança (não só ao fechar): se a janela fechar no meio da geração, nada se perde
  const salvar = () => aoSalvar({ ...resultado });

  grade.addEventListener('click', (e) => {
    const botao = e.target.closest('.remover');
    if (!botao) return;
    e.preventDefault();
    delete resultado[botao.dataset.tipo];
    salvar();
    desenharGrade();
  });

  // ---------- editor do busto (modo personagem) ----------

  let tamanhoFoto = 0;

  function desenharQuadro() {
    const pct = (v) => `${(v / tamanhoFoto) * 100}%`;
    Object.assign(quadro.style, { left: pct(caixa.x), top: pct(caixa.y), width: pct(caixa.largura), height: pct(caixa.altura) });
  }

  let previaPendente = null;
  function atualizarPrevia() {
    clearTimeout(previaPendente);
    previaPendente = setTimeout(async () => {
      previaRei.src = await montarPersonagem(recortarBusto(figura, caixa), { tipo: 'k', paletaTime: paleta });
    }, 120);
  }

  // Retângulo inicial: figura de corpo inteiro (alta) -> da cabeça até a cintura; retrato -> a figura toda
  function caixaInicial() {
    const { x, y } = figura.deslocamento;
    const alta = figura.height > figura.width * 1.3;
    return { x, y, largura: figura.width, altura: alta ? figura.height * 0.62 : figura.height };
  }

  // Arrastar move o retângulo; arrastar a alça do canto muda largura e altura
  quadro.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    quadro.setPointerCapture(e.pointerId);
    const redimensionar = e.target.classList.contains('alca');
    const escala = tamanhoFoto / imagemRecorte.clientWidth;
    const inicio = { px: e.clientX, py: e.clientY, ...caixa };
    const mover = (ev) => {
      const dx = (ev.clientX - inicio.px) * escala;
      const dy = (ev.clientY - inicio.py) * escala;
      if (redimensionar) {
        caixa = {
          ...caixa,
          largura: Math.max(16, Math.min(inicio.largura + dx, tamanhoFoto - inicio.x)),
          altura: Math.max(16, Math.min(inicio.altura + dy, tamanhoFoto - inicio.y)),
        };
      } else {
        caixa = {
          ...caixa,
          x: Math.min(Math.max(0, inicio.x + dx), tamanhoFoto - caixa.largura),
          y: Math.min(Math.max(0, inicio.y + dy), tamanhoFoto - caixa.altura),
        };
      }
      desenharQuadro();
    };
    const soltar = () => {
      quadro.removeEventListener('pointermove', mover);
      quadro.removeEventListener('pointerup', soltar);
      quadro.removeEventListener('pointercancel', soltar);
      atualizarPrevia();
    };
    quadro.addEventListener('pointermove', mover);
    quadro.addEventListener('pointerup', soltar);
    quadro.addEventListener('pointercancel', soltar);
  });

  // ---------- escolher a imagem ----------

  entrada.addEventListener('change', async () => {
    const arquivo = entrada.files[0];
    if (!arquivo) return;
    try {
      foto = await reduzirFoto(arquivo);
      tamanhoFoto = (await carregarImagem(foto)).naturalWidth; // a foto reduzida é sempre quadrada
      previaFoto.src = foto;
      imagemRecorte.src = foto;
      textoFoto.textContent = 'Trocar imagem';
      figura = await recortarFundo(foto);
      caixa = caixaInicial();
      desenharQuadro();
      atualizarPrevia();
      mostrarSecoes();
    } catch (erro) {
      progresso.textContent = erro.message;
    }
  });

  // ---------- gerar ----------

  // Devolve a URL da peça guardada no servidor
  async function gerarUmaPeca(tipo, modo, busto) {
    let png;
    if (modo === 'personagem') {
      png = await montarPersonagem(busto, { tipo, paletaTime: paleta });
    } else {
      try {
        const { imagem } = await postarJson('/api/gerar', { foto, peca: tipo, tema, cor, descricao: $('#quem-e').value });
        png = enquadrar(await recortarFundo(imagem));
      } catch (erro) {
        if (erro.bloqueado) throw new Error('a IA bloqueou esta imagem (personagem famoso?). Use o modo Personagem.');
        throw erro;
      }
    }
    const { url } = await postarJson('/api/pecas', { imagem: png });
    return url;
  }

  botaoGerar.addEventListener('click', async () => {
    if (gerando) return;
    const modo = modoAtual();
    if (!foto) {
      progresso.textContent = 'Escolha uma imagem primeiro.';
      return;
    }
    const fila = TIPOS.filter((t) => selecionadas.has(t));
    if (!fila.length) {
      progresso.textContent = 'Marque pelo menos uma peça.';
      return;
    }

    gerando = true;
    botaoGerar.disabled = true;
    const total = fila.length;
    let feitas = 0;
    const erros = [];
    const busto = modo === 'personagem' ? recortarBusto(figura, caixa) : null;
    const mostrarProgresso = () => {
      progresso.textContent = modo === 'pessoa' ? `Gerando… ${feitas} de ${total} prontas (cada peça leva alguns segundos)` : 'Gerando…';
    };
    mostrarProgresso();

    // Duas peças por vez para não esperar demais nem sobrecarregar a cota da IA
    const trabalhar = async () => {
      while (fila.length) {
        const tipo = fila.shift();
        try {
          resultado[tipo] = await gerarUmaPeca(tipo, modo, busto);
          salvar();
          desenharGrade();
        } catch (erro) {
          erros.push(`${NOMES_PECAS[tipo]}: ${erro.message}`);
        }
        feitas++;
        mostrarProgresso();
      }
    };
    await Promise.all([trabalhar(), trabalhar()]);

    gerando = false;
    botaoGerar.disabled = false;
    if (erros.length) {
      progresso.textContent = `Algumas peças falharam. ${erros.join(' ')}`;
      return;
    }
    // Desmarca as peças feitas e marca a próxima sem personagem, pronta para a próxima imagem
    selecionadas.clear();
    const proxima = TIPOS.find((t) => !resultado[t]);
    if (proxima) selecionadas.add(proxima);
    desenharGrade();
    progresso.textContent = proxima
      ? `Pronto! Para a próxima peça (${NOMES_PECAS[proxima]}), troque a imagem e clique em Gerar de novo.`
      : 'Pronto! Todas as peças têm personagem. Clique em Concluir.';
  });

  mostrarSecoes();
  desenharGrade();
  dlg.showModal();
}
