// Estúdio Eternize — controle remoto, versão 0.17.19 (gerado por leona/gerar.py)
(function () {
'use strict';
const VERSAO_SCRIPT = '0.17.19';
// Faz o código da extensão (content.js) rodar no Tampermonkey: cria um "chrome" de mentira com as mesmas funções
// (guardar dados, falar com o Estúdio deste computador). O código do menu é o MESMO da extensão.
const chrome = (() => {
  const PORTAS = [8771, 8770];
  const ouvintes = [];
  let portaAchada = { porta: 0, quando: 0 };

  // ---- guardar dados (no lugar de chrome.storage.local) ----
  const lerTudo = () => { const o = {}; for (const k of GM_listValues()) o[k] = GM_getValue(k); return o; };
  const storage = {
    async get(chaves) {
      if (chaves === null || chaves === undefined) return lerTudo();
      if (typeof chaves === 'string') chaves = [chaves];
      const o = {};
      if (Array.isArray(chaves)) { for (const k of chaves) { const v = GM_getValue(k); if (v !== undefined) o[k] = v; } return o; }
      for (const k of Object.keys(chaves)) { const v = GM_getValue(k); o[k] = v !== undefined ? v : chaves[k]; }   // {chave: valorPadrao}
      return o;
    },
    async set(obj) {
      const mud = {};
      for (const [k, v] of Object.entries(obj)) { mud[k] = { newValue: v, oldValue: GM_getValue(k) }; GM_setValue(k, v); }
      ouvintes.forEach(f => { try { f(mud, 'local'); } catch (e) {} });
    },
    async remove(chaves) { for (const k of [].concat(chaves)) GM_deleteValue(k); },
  };

  // ---- falar com o Estúdio (no lugar do background.js) ----
  const pedir = (url, opc = {}) => new Promise((ok, erro) => {
    GM_xmlhttpRequest({
      method: opc.method || 'GET', url, data: opc.body, responseType: opc.binario ? 'arraybuffer' : 'text', timeout: opc.tempo || 60000,
      headers: Object.assign({ 'X-Estudio': '1' }, opc.body ? { 'Content-Type': 'application/json' } : {}),
      onload: r => ok(r), onerror: () => erro(new Error('Falha de conexão')), ontimeout: () => erro(new Error('Tempo esgotado')),
    });
  });
  const b64 = buf => { const by = new Uint8Array(buf); let bin = ''; for (let i = 0; i < by.length; i += 0x8000) bin += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); return btoa(bin); };
  const cab = (r, nome) => { const m = new RegExp('^' + nome + ':\\s*(.*)$', 'im').exec(r.responseHeaders || ''); return m ? m[1].trim() : ''; };
  const json = r => { try { return JSON.parse(r.responseText); } catch (e) { return null; } };

  async function responde(porta) {
    try { const r = await pedir('http://127.0.0.1:' + porta + '/api/versao', { tempo: 1500 }); const j = json(r); return r.status === 200 && j && typeof j.versao === 'string'; } catch (e) { return false; }
  }
  async function acharPorta() {
    const manual = Number(GM_getValue('porta', 0)) || 0;
    if (manual) return manual;
    if (portaAchada.porta && Date.now() - portaAchada.quando < 15000) return portaAchada.porta;
    for (const p of PORTAS) if (await responde(p)) { portaAchada = { porta: p, quando: Date.now() }; return p; }
    portaAchada = { porta: 0, quando: 0 };
    return PORTAS[0];
  }
  async function estudio(caminho, opc) {
    const porta = await acharPorta();
    const r = await pedir('http://127.0.0.1:' + porta + caminho, opc);
    return { status: r.status, json: json(r), porta };
  }

  async function tratar(msg) {
    try {
      if (msg.tipo === 'ping') { const r = await estudio('/api/versao'); return { ok: r.status === 200, dados: r.json, porta: r.porta }; }
      if (msg.tipo === 'gerar') {
        const r = await estudio('/api/leona/pedido', { method: 'POST', body: JSON.stringify(msg.pedido), tempo: 120000 });
        return { ok: r.status === 200 && !!(r.json && r.json.ok), id: r.json && r.json.id, erro: (r.json && r.json.erro) || (r.status !== 200 ? 'O Estúdio respondeu ' + r.status + '.' : '') };
      }
      if (msg.tipo === 'ponto') { const r = await estudio('/api/ponto/meu'); return { ok: r.status === 200, dados: r.json, porta: r.porta, erro: (r.json && r.json.erro) || '' }; }
      if (msg.tipo === 'ponto_acao') {
        const r = await estudio(msg.acao === 'encerrar' ? '/api/ponto/encerrar' : '/api/ponto/bater', { method: 'POST', body: '{}' });
        return { ok: r.status === 200, erro: (r.json && r.json.erro) || (r.status !== 200 ? 'O Estúdio respondeu ' + r.status + '.' : '') };
      }
      if (msg.tipo === 'status') { const r = await estudio('/api/leona/status?id=' + encodeURIComponent(msg.id)); return { ok: r.status === 200, dados: r.json }; }
      if (msg.tipo === 'arquivo') {
        const porta = await acharPorta();
        const r = await pedir('http://127.0.0.1:' + porta + '/api/leona/arquivo?id=' + encodeURIComponent(msg.id) + '&tipo=' + encodeURIComponent(msg.arquivo) + (msg.n != null ? '&n=' + Number(msg.n) : ''), { binario: true, tempo: 180000 });
        if (r.status !== 200) {
          let erro = 'O Estúdio respondeu ' + r.status + '.';
          try { erro = JSON.parse(new TextDecoder().decode(r.response)).erro || erro; } catch (e) {}
          return { ok: false, erro };
        }
        return { ok: true, mime: cab(r, 'content-type') || 'application/octet-stream', b64: b64(r.response) };
      }
      if (msg.tipo === 'baixar') {
        if (!/^https:\/\//.test(msg.url || '')) return { ok: false, erro: 'Endereço inválido.' };
        let r = null;
        try { const porta = await acharPorta(); r = await pedir('http://127.0.0.1:' + porta + '/api/leona/foto?url=' + encodeURIComponent(msg.url), { binario: true, tempo: 60000 }); } catch (e) { r = null; }   // 1º: pelo Estúdio deste computador (não depende da permissão do Tampermonkey)
        if (!r || r.status !== 200) r = await pedir(msg.url, { binario: true, tempo: 60000 });   // 2º: direto, se o Estúdio antigo não tiver essa rota
        if (r.status !== 200) return { ok: false, erro: 'O servidor da foto respondeu ' + r.status + '.' };
        const by = new Uint8Array(r.response);
        const mime = by[0] === 0xff ? 'image/jpeg' : by[0] === 0x89 ? 'image/png' : by[0] === 0x52 ? 'image/webp' : (cab(r, 'content-type') || 'image/jpeg');
        return { ok: true, mime, b64: b64(r.response) };
      }
      if (msg.tipo === 'leona_config') { const r = await estudio('/api/leona-config'); return { ok: r.status === 200, dados: r.json }; }
      if (msg.tipo === 'alerta_pegar') { const r = await estudio('/api/alerta/pegar'); return { ok: r.status === 200, dados: r.json }; }
      if (msg.tipo === 'alerta_enviado') { const r = await estudio('/api/alerta/enviado', { method: 'POST', body: JSON.stringify({ id: msg.id, ok: !!msg.ok }) }); return { ok: r.status === 200 }; }
      if (msg.tipo === 'meu_prompt_get') { const r = await estudio('/api/meu-prompt?caso=' + encodeURIComponent(String(msg.caso || ''))); return ({ ok: r.status === 200, dados: r.json, erro: (r.json && r.json.erro) || '' }); }
      if (msg.tipo === 'meu_prompt_set') { const r = await estudio('/api/meu-prompt', { method: 'POST', body: JSON.stringify({ caso: msg.caso, texto: msg.texto }) }); return ({ ok: r.status === 200, dados: r.json, erro: (r.json && r.json.erro) || '' }); }
      if (msg.tipo === 'avaliar') { const r = await estudio('/api/avaliar', { method: 'POST', body: JSON.stringify({ id: msg.id, resultado: msg.resultado, motivo: msg.motivo || '' }) }); return ({ ok: r.status === 200, erro: (r.json && r.json.erro) || '' }); }
      if (msg.tipo === 'repetir') { const r = await estudio('/api/leona/repetir', { method: 'POST', body: JSON.stringify({ id: msg.id, cancelar: !!msg.cancelar }) }); return { ok: r.status === 200, erro: (r.json && r.json.erro) || '' }; }
      if (msg.tipo === 'entregue') { const r = await estudio('/api/leona/entregue', { method: 'POST', body: JSON.stringify({ id: msg.id, tipo: msg.arquivo }) }); return { ok: r.status === 200 }; }
      return { ok: false, erro: 'Mensagem desconhecida.' };
    } catch (e) { return { ok: false, erro: String((e && e.message) || e) }; }
  }

  // ---- ajustes no menu do Tampermonkey (no lugar do ícone da extensão) ----
  try {
    const auto = () => GM_getValue('autoEnviar', true) !== false;
    GM_registerMenuCommand('Apertar Enviar sozinha: ' + (auto() ? 'LIGADO' : 'desligado') + ' (clique para trocar)', () => { storage.set({ autoEnviar: !auto() }); location.reload(); });
    GM_registerMenuCommand('Estúdio Eternize — versão ' + (typeof VERSAO_SCRIPT !== 'undefined' ? VERSAO_SCRIPT : '?'), () => alert('Versão do controle remoto: ' + (typeof VERSAO_SCRIPT !== 'undefined' ? VERSAO_SCRIPT : '?')));
    GM_registerMenuCommand('Testar conexão com o Estúdio', async () => {
      const r = await tratar({ tipo: 'ping' });
      alert(r.ok ? 'Estúdio ligado (versão ' + ((r.dados && r.dados.versao) || '?') + ') na porta ' + r.porta + '.' : 'Não achei o Estúdio. Abra o aplicativo do Estúdio.');
    });
  } catch (e) {}

  // ---- avisa o Estúdio, a cada minuto, que o controle remoto está ligado (o Estúdio mostra "conectado" no menu) ----
  const batida = () => { estudio('/api/leona/controle', { method: 'POST', body: JSON.stringify({ versao: typeof VERSAO_SCRIPT !== 'undefined' ? VERSAO_SCRIPT : '' }), tempo: 5000 }).catch(() => {}); };
  setTimeout(batida, 1500); setInterval(batida, 60000);

  // ---- atualização: confere o GitHub a cada 5 min (e ao voltar para a aba) e AVISA na tela quando há versão nova pronta ----
  // (o carregador só recarrega a Leona sozinho com o painel fechado e o editor parado; com o painel aberto, este aviso tem o botão "Atualizar agora")
  try {
    const URL_CODIGO = 'https://raw.githubusercontent.com/omisael-crypto/estudio-eternize-controle-remoto/main/estudio-eternize.js';
    const atual = typeof VERSAO_SCRIPT !== 'undefined' ? String(VERSAO_SCRIPT) : '';
    const tupla = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
    const maior = (a, b) => { const x = tupla(a), y = tupla(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
    let ultima = 0, mostrada = '';
    const aviso = nova => {
      if (mostrada === nova || !document.body) return; mostrada = nova;
      const d = document.createElement('div'); d.id = 'estudio-aviso-versao';
      d.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:320px;background:#191a20;color:#e8eaf2;border:1px solid #4c8dff;border-radius:12px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:13px/1.4 system-ui,Segoe UI,sans-serif';
      d.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Estúdio Eternize: nova versão ' + nova + '</div><div style="color:#9aa0b2;margin-bottom:10px">Atualizar recarrega a Leona. O que você está montando no painel fica guardado como rascunho.</div><div style="display:flex;gap:8px;justify-content:flex-end"><button data-v="depois" style="border:1px solid #2a2c35;background:#16171c;color:#c9cdda;border-radius:8px;padding:7px 12px;cursor:pointer">Depois</button><button data-v="agora" style="border:1px solid #4c8dff;background:#4c8dff;color:#fff;border-radius:8px;padding:7px 12px;cursor:pointer;font-weight:700">Atualizar agora</button></div>';
      d.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.v === 'depois') { d.remove(); return; }
        const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (w.__estudioOcupado > 0) { b.textContent = 'Enviando ao chat… espere'; setTimeout(() => { b.textContent = 'Atualizar agora'; }, 3000); return; }   // nunca recarrega no meio de um envio ao cliente
        location.reload();
      });
      document.body.appendChild(d);
    };
    const conferirNova = async () => {
      ultima = Date.now();
      try {
        const r = await pedir(URL_CODIGO + '?t=' + Math.floor(Date.now() / 60000), { tempo: 20000 });
        if (r.status !== 200 || !/Estúdio Eternize — controle remoto/.test(r.responseText || '')) return;
        const m = /VERSAO_SCRIPT\s*=\s*'([\d.]+)'/.exec(r.responseText); const nova = m && m[1];
        if (!nova || !atual || !maior(nova, atual)) return;
        GM_setValue('__codigo', r.responseText);   // o carregador usa este código ao recarregar (já entra direto na versão nova)
        aviso(nova);
      } catch (e) {}
    };
    if (GM_getValue('__codigo', '')) {   // só no carregador (a versão "completa" em um arquivo só se atualiza pelo próprio Tampermonkey)
      setTimeout(conferirNova, 20000); setInterval(conferirNova, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - ultima > 2 * 60 * 1000) conferirNova(); });
    }
  } catch (e) {}

  return {
    runtime: {
      sendMessage: msg => tratar(msg),
      onMessage: { addListener: () => {} },
    },
    storage: { local: storage, onChanged: { addListener: f => ouvintes.push(f) } },
  };
})();

// Estúdio Eternize — roda dentro da página da Leona.
// Botão ao lado do "Traduzir", lê as fotos do chat aberto e oferece o mesmo menu da "Nova homenagem" do Estúdio.
(() => {
  if (window.__estudioLeona) return;
  window.__estudioLeona = true;

  const MIN_LADO = 110;           // imagens menores que isso (avatares, ícones) não contam
  const MAX_PESSOAS = 4;
  let n, pessoas, ativa, fotosSel, mais, ajuste, relogio = null, msg = '', aniv = false;   // aniv: pedido de ANIVERSÁRIO (caso aniv-1p, 1 pessoa)
  let buscando = false;
  var modoPronta = false, prontaSrc = '', quemSobe = '';   // "prévia já enviada": usa uma imagem que NÓS mandamos no chat e gera só o vídeo dela
  var marcas = new Map(), marcasChat = '';   // foto (endereço) -> ['P1', 'P3']: o que já foi marcado neste chat
  let autoEnvio = true;   // chave "Envio automático ao cliente" (liga/desliga os botões "e enviar")
  const janelaPagina = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  const ico = (d, t = 16) => '<svg class="ico" width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const IC = {
    tesoura: ico('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'),
    girarEsq: ico('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
    girarDir: ico('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
    espelho: ico('<path d="M12 3v18"/><path d="M8 7 3 12l5 5V7z"/><path d="M16 7l5 5-5 5V7z"/>'),
    trocar: ico('<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>', 14),
    pessoas: ico('<circle cx="8.5" cy="8" r="3.2"/><circle cx="16.5" cy="8" r="3.2"/><path d="M2 20c0-3.3 2.7-5.5 6.5-5.5s6.5 2.2 6.5 5.5zM15 14.7c.5-.2 1-.3 1.5-.3 3.8 0 5.5 2.3 5.5 5.6h-5.8"/>', 14),
    estrela: ico('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', 13),
    coracao: ico('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', 13),
    telaCheia: ico('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 18),
    baixar: ico('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 18),
    fechar: ico('<path d="M6 6l12 12M18 6 6 18"/>', 14),
    fecharG: ico('<path d="M6 6l12 12M18 6 6 18"/>', 20),
    atualizar: ico('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>', 13),
    check: ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 14),
    abre: ico('<path d="M9 6l6 6-6 6"/>', 12),
    fecha: ico('<path d="M6 9l6 6 6-6"/>', 12),
  };
  const REC = window.SpeechRecognition || window.webkitSpeechRecognition || janelaPagina.SpeechRecognition || janelaPagina.webkitSpeechRecognition;
  let micAtivo = null;
  function avisoMic(texto, erro) {   // mensagem logo abaixo do campo "Quer mudar algo?"
    const el = $('#micmsg'); if (!el) return;
    el.textContent = texto || ''; el.className = 'aviso' + (erro ? ' bad' : ''); el.style.display = texto ? 'block' : 'none';
  }
  const MIC_ERRO = {
    'not-allowed': 'O Chrome está bloqueando o microfone neste site. Clique no cadeado ao lado do endereço, escolha Microfone > Permitir e aperte F5.',
    'service-not-allowed': 'O Chrome bloqueou o reconhecimento de voz neste site.',
    'audio-capture': 'Não achei um microfone neste computador.',
    'network': 'O reconhecimento de voz precisa de internet.',
    'no-speech': 'Não ouvi nada. Clique no microfone e fale.',
  };
  async function falar(b, campo) {   // ditado: o que for falado entra no campo (igual ao microfone do Estúdio)
    if (b._rec) { b._rec.stop(); return; }
    if (micAtivo) micAtivo.abort();
    try {   // se o microfone já está bloqueado para este site, avisa antes de tentar
      if (navigator.permissions && navigator.permissions.query) {
        const st = await navigator.permissions.query({ name: 'microphone' });
        if (st.state === 'denied') { avisoMic(MIC_ERRO['not-allowed'], true); return; }
      }
    } catch (e) {}
    avisoMic('');
    const r = new REC(); b._rec = r; micAtivo = r; r.lang = 'pt-BR'; r.interimResults = false; r.continuous = true;
    r.onresult = ev => { let t = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) t += ev.results[i][0].transcript;
      if (t) { campo.value = (campo.value ? campo.value.replace(/\s*$/, ' ') : '') + t.trim(); campo.dispatchEvent(new Event('input', { bubbles: true })); } };
    r.onstart = () => { b.classList.add('on'); b.setAttribute('aria-label', 'Parar'); b.title = 'Ouvindo… clique para parar'; avisoMic('Ouvindo… fale e clique no microfone de novo para parar.', false); };
    r.onend = () => { if (micAtivo === r) micAtivo = null; b._rec = null; b.classList.remove('on'); b.setAttribute('aria-label', 'Falar'); b.title = 'Falar em vez de escrever'; if ($('#micmsg') && $('#micmsg').className === 'aviso') avisoMic(''); };
    r.onerror = ev => { const c = (ev && ev.error) || 'erro'; if (c !== 'aborted') avisoMic(MIC_ERRO[c] || 'O microfone não funcionou.', true); r.onend(); };
    try { r.start(); } catch (x) { r.onend(); avisoMic('Não consegui ligar o microfone. Confira a permissão do Chrome para este site.', true); }
  }
  let juntos = false, jq = '2f';   // "Mesma foto": as duas pessoas na mesma foto (só com 2 pessoas)
  const NOMEJQ = { '1f2v': 'A da esquerda faleceu', '1v2f': 'A da direita faleceu', '2f': 'As duas faleceram' };
  const emJuntos = () => juntos && n === 2;
  let chatPainel = { id: '', nome: '' };   // o contato em que o painel foi aberto: tudo o que o painel faz vale para ELE, mesmo que a Leona mude de chat

  const nova = () => ({ vivo: false, foto: null, animal: false, bebe: false, semcamisa: false, calca: false, vestido: false, papel: '', edit: null, editada: null, busy: false });

  // ---------- ler o chat ----------
  function chatAtual() {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^#\d{5,}$/.test((e.textContent || '').trim()));
    const id = el ? el.textContent.trim().slice(1) : ((document.body.innerText || '').match(/#(\d{5,})/) || [])[1] || '';
    let nome = '';
    if (el) {
      const antes = el.previousElementSibling || (el.parentElement && el.parentElement.firstElementChild);
      nome = ((antes && antes !== el ? antes.textContent : '') || '').trim();
    }
    return { id, nome };
  }

  // Fotos que o CLIENTE mandou: imagens das mensagens recebidas (balão à esquerda, "justify-start"),
  // sem as que a própria Leona enviou (prévia, "Qual destes é...") e sem as miniaturas de resposta citada.
  // A Leona só mantém na tela as mensagens perto do ponto onde o chat está rolado. Por isso a extensão LEMBRA
  // as fotos que já viu em cada chat (com um número fixo), e "Buscar fotos antigas" rola o chat até o começo.
  const memoria = new Map();   // chat -> { lista: [{id, src}], por: Map(src -> id) }
  // NUNCA misturar as fotos de contatos diferentes: cada mensagem pertence ao primeiro chat em que foi vista; quando o Estúdio troca de contato
  // a Leona ainda mostra por um instante as mensagens do contato anterior, e elas não podem entrar na lista do novo.
  const donoMsg = new Map();   // id da mensagem -> chat de onde ela veio
  let chatVisto = '', chatDesde = 0, idsUltimos = new Set();
  const ESTAVEL_MS = 1500;     // depois de trocar de contato, espera a Leona terminar de redesenhar antes de anotar fotos
  function lerNaTela(ch, ids) {
    const vistos = new Set(), lista = [];
    document.querySelectorAll('[data-message-id]').forEach(msg => {
      const mid = msg.getAttribute('data-message-id') || '';
      if (mid) { if (donoMsg.has(mid) && donoMsg.get(mid) !== ch) return; donoMsg.set(mid, ch); if (ids) ids.add(mid); }   // é de outro contato: ignora
      if (!msg.classList.contains('justify-start')) return;   // mensagem do cliente (as nossas são justify-end)
      msg.querySelectorAll('img').forEach(img => {
        if (img.closest('[role="button"]')) return;           // miniatura da mensagem citada
        const src = img.currentSrc || img.src || '';
        if (!/^https:/.test(src)) return;
        const lado = Math.max(img.naturalWidth || 0, img.width || 0, img.getBoundingClientRect().width || 0);
        if (lado < 60) return;                                // ícones
        if (vistos.has(src)) return;
        vistos.add(src); lista.push(src);
      });
    });
    return lista;
  }
  function lembrar() {
    const ch = chatAtual().id; if (!ch) return;
    if (ch !== chatVisto) {   // trocou de contato: o que ainda está na tela e foi visto no contato anterior é dele
      for (const id of idsUltimos) if (chatVisto && !donoMsg.has(id)) donoMsg.set(id, chatVisto);
      chatVisto = ch; chatDesde = Date.now(); idsUltimos = new Set();
    }
    let m = memoria.get(ch); if (!m) { m = { lista: [], por: new Map() }; memoria.set(ch, m); }
    if (Date.now() - chatDesde < ESTAVEL_MS) return m;   // acabou de trocar de contato: ainda não anota nada
    const idsAgora = new Set();
    const novas = lerNaTela(ch, idsAgora); idsUltimos = idsAgora;
    for (const src of novas) if (!m.por.has(src)) { const f = { id: m.lista.length + 1, src }; m.lista.push(f); m.por.set(src, f.id); }
    m.nossas = m.nossas || [];   // imagens que a nossa equipe / o fluxo mandou (balão à direita): prévias já feitas
    document.querySelectorAll('[data-message-id].justify-end img').forEach(img => {
      if (img.closest('[role="button"]') || img.closest('#estudio-leona-raiz')) return;
      const src = img.currentSrc || img.src || '';
      if (!/^https:/.test(src) || m.nossas.some(x => x.src === src)) return;
      if (Math.max(img.naturalWidth || 0, img.getBoundingClientRect().width || 0) < 120) return;
      m.nossas.push({ id: m.nossas.length + 1, src });
    });
    return m;
  }
  function lerFotos() {
    const m = lembrar();
    return m ? m.lista.slice() : [];
  }
  function rolagemDoChat() {
    const msg = document.querySelector('[data-message-id]'); if (!msg) return null;
    for (let e = msg.parentElement; e && e !== document.body; e = e.parentElement) {
      const o = getComputedStyle(e).overflowY;
      if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 20) return e;
    }
    return null;
  }
  async function buscarAntigas(aoAndar, aindaVale) {   // rola o chat até o começo (várias vezes, até a Leona não carregar mais nada) e recolhe as fotos
    const sc = rolagemDoChat(); if (!sc) return 0;
    const ch = chatAtual().id, antes = lembrar().lista.length;
    let parados = 0, alt = -1;
    for (let i = 0; i < 250 && parados < 5; i++) {
      if (chatAtual().id !== ch || (aindaVale && !aindaVale())) break;
      sc.scrollTop = 0;
      const mais = [...document.querySelectorAll('button')].find(x => !x.closest('#estudio-leona-raiz') && /carregar.*(antigas|anteriores)|ver mais mensagens/i.test(x.textContent || '') && visivel(x));
      if (mais) mais.click();
      await esperar(600);
      lembrar(); if (aoAndar) aoAndar(lembrar().lista.length);
      if (sc.scrollHeight === alt && sc.scrollTop <= 2) parados++; else { parados = 0; alt = sc.scrollHeight; }
    }
    if (chatAtual().id === ch) sc.scrollTop = sc.scrollHeight;   // volta para o fim do chat
    return lembrar().lista.length - antes;
  }

  // ---------- botão ao lado do Traduzir + tela ----------
  const raiz = document.createElement('div');
  raiz.id = 'estudio-leona-raiz';
  const sombra = raiz.attachShadow({ mode: 'open' });
  sombra.innerHTML = `
  <style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:system-ui,Segoe UI,sans-serif}
    button{font:inherit;color:inherit}
    /* editor de foto */
    .edit{position:absolute;inset:0;background:#0b0c10;z-index:20;display:none;flex-direction:column}
    .edit.on{display:flex}
    .edit-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 18px;background:#191a20;border-bottom:1px solid #2a2c35}
    .edit-top h4{margin:0 10px 0 0;font-size:15px}
    .tb{border:1px solid #2a2c35;background:#16171c;color:#c9cdda;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px}
    .tb:hover{border-color:#4c8dff}.tb.on{background:#4c8dff;color:#fff;border-color:#4c8dff}.tb:disabled{opacity:.5;cursor:wait}
    .edit-meio{flex:1;min-height:0;display:flex}
    .edit-corpo{flex:1;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto}
    .stage{position:relative;line-height:0;user-select:none;touch-action:none}
    .stage canvas{display:block;border-radius:6px}
    .crop{position:absolute;border:2px dashed #4c8dff;cursor:pointer;box-sizing:border-box;touch-action:none;background:rgba(255,255,255,.04)}
    .crop.ativo{border-style:solid;box-shadow:0 0 0 9999px rgba(0,0,0,.62);cursor:move;background:transparent}
    .crop .rot{position:absolute;left:0;top:0;color:#fff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 0;line-height:1.3}
    /* fotos do cliente: coluna à esquerda, com rolagem (2 miniaturas por linha), para o recorte ficar com o resto da tela */
    .edit-pes{flex:none;width:156px;display:grid;grid-template-columns:repeat(2,60px);grid-auto-rows:auto;gap:8px;align-content:start;justify-content:center;padding:10px 8px;overflow-y:auto;background:#14151a;border-right:1px solid #2a2c35;font-size:12px;color:#9aa0b2;scrollbar-width:thin;scrollbar-color:#3a3d4a transparent}
    .edit-pes>span{grid-column:1/-1;grid-row:auto;line-height:1.3;padding:0 2px 2px}
    .foto .uso{position:absolute;left:4px;bottom:4px;background:#4c8dff;color:#fff;font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px}
    .crop i{position:absolute;width:16px;height:16px;background:#4c8dff;border:2px solid #fff;border-radius:50%;box-sizing:border-box;touch-action:none}
    .crop i[data-h=nw]{left:-9px;top:-9px;cursor:nwse-resize}.crop i[data-h=n]{left:calc(50% - 8px);top:-9px;cursor:ns-resize}
    .crop i[data-h=ne]{right:-9px;top:-9px;cursor:nesw-resize}.crop i[data-h=e]{right:-9px;top:calc(50% - 8px);cursor:ew-resize}
    .crop i[data-h=se]{right:-9px;bottom:-9px;cursor:nwse-resize}.crop i[data-h=s]{left:calc(50% - 8px);bottom:-9px;cursor:ns-resize}
    .crop i[data-h=sw]{left:-9px;bottom:-9px;cursor:nesw-resize}.crop i[data-h=w]{left:-9px;top:calc(50% - 8px);cursor:ew-resize}
    .edit-rod{display:flex;justify-content:space-between;gap:10px;padding:12px 18px;background:#191a20;border-top:1px solid #2a2c35;align-items:center}
    .pick{width:60px;height:60px;border-radius:8px;overflow:hidden;border:2px solid transparent;cursor:pointer;padding:0;background:#000}
    .pick img{width:100%;height:100%;object-fit:cover;display:block}
    .pick:hover{border-color:#8b90a0}.pick.at{border-color:#4c8dff}
    .acs{position:absolute;top:6px;right:6px;display:flex;gap:4px;z-index:2}
    .acs button{width:28px;height:28px;border-radius:8px;border:1px solid #2a2c35;background:#191a20;color:#c9cdda;cursor:pointer;line-height:1;font-size:14px}
    .acs button:hover{border-color:#4c8dff;color:#fff}
    .etq{position:absolute;left:12px;top:30px;background:#4c8dff;color:#fff;border-radius:6px;font-size:10px;font-weight:700;padding:1px 6px}
    .ocupado{color:#8b90a0;font-size:12px;padding:6px 0;text-align:center}
    /* barra de rolagem escura e fina, no estilo da Leona */
    .esq,.dir,.andam,.edit-corpo{scrollbar-width:thin;scrollbar-color:#3a3d4a transparent}
    .esq::-webkit-scrollbar,.dir::-webkit-scrollbar,.andam::-webkit-scrollbar,.edit-corpo::-webkit-scrollbar{width:8px;height:8px}
    .esq::-webkit-scrollbar-track,.dir::-webkit-scrollbar-track,.andam::-webkit-scrollbar-track,.edit-corpo::-webkit-scrollbar-track{background:transparent}
    .esq::-webkit-scrollbar-thumb,.dir::-webkit-scrollbar-thumb,.andam::-webkit-scrollbar-thumb,.edit-corpo::-webkit-scrollbar-thumb{background:#3a3d4a;border-radius:8px}
    .esq::-webkit-scrollbar-thumb:hover,.dir::-webkit-scrollbar-thumb:hover,.andam::-webkit-scrollbar-thumb:hover,.edit-corpo::-webkit-scrollbar-thumb:hover{background:#4c8dff}
    .toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#16161a;color:#ececf0;border:1px solid #2a2a31;border-left:3px solid #4c8dff;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:600;z-index:2147483002;display:none;box-shadow:0 6px 24px #0008;max-width:90vw}
    .veu{position:fixed;inset:0;background:#000a;z-index:2147483001;display:none;justify-content:flex-end}
    .veu.on{display:flex}
    .alca{position:absolute;left:-9px;top:0;bottom:0;width:16px;cursor:ew-resize;z-index:30;touch-action:none}
    .alca::after{content:'';position:absolute;left:7px;top:0;bottom:0;width:3px;background:transparent;transition:background .12s}
    .alca::before{content:'';position:absolute;left:6px;top:50%;width:5px;height:44px;margin-top:-22px;border-radius:3px;background:#4c8dff;opacity:0;transition:opacity .12s}
    .alca:hover::after,.alca.arr::after{background:#4c8dff}.alca:hover::before,.alca.arr::before{opacity:1}
    .gav{width:var(--larg,min(100%,max(1020px,58vw)));max-width:100%;height:100%;background:#121317;color:#e6e8ee;border-left:2px solid #4c8dff;display:flex;flex-direction:column;font-size:14px;position:relative}
    header{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:#191a20;border-bottom:1px solid #2a2c35}
    .tit{display:flex;align-items:center;gap:10px}
    .logo{width:34px;height:34px;flex:none}
    header h3{margin:0;font-size:16px}header small{color:#8b90a0}
    .x{background:none;border:0;color:#8b90a0;font-size:24px;cursor:pointer}
    .corpo{flex:1;display:flex;min-height:0}
    .esq{flex:1;overflow:auto;padding:16px 18px;border-right:1px solid #2a2c35}
    .dir{width:440px;max-width:100%;overflow:auto;padding:16px 18px}
    h5{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#8b90a0}
    .fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .foto{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;border:2px solid transparent;background:#000}
    .foto:hover{border-color:#4c8dff}.foto.usada{opacity:.25;pointer-events:none}
    .foto img{width:100%;height:100%;object-fit:cover;display:block}
    .vazio{color:#8b90a0;font-size:12px;padding:14px;text-align:center}
    /* menu (igual ao da Nova homenagem do Estúdio) */
    .passo{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-weight:700}
    .passo b{width:22px;height:22px;border-radius:50%;background:#4c8dff;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
    .ico{flex:none;display:block}
    .troca,.tb,.maisop,.stt{display:inline-flex;align-items:center;gap:6px}
    .stt{display:flex}
    .par button,.sc{display:inline-flex;align-items:center;justify-content:center;gap:5px}
    .acs button{display:grid;place-items:center;padding:0}
    .x{display:grid;place-items:center;width:36px;height:36px;padding:0;border-radius:8px}
    .x:hover{color:#fff;background:#1d1d22}
    .gr.ic{display:grid;place-items:center}
    .troca{white-space:nowrap;font-size:12px;font-weight:600;border:1px solid #2a2c35;background:#191a20;border-radius:8px;padding:4px 10px;cursor:pointer;color:#c9cdda;line-height:1.4}
    .troca.buscando .ico{animation:giro 1s linear infinite}
    .troca:hover:not([disabled]){border-color:#4c8dff;color:#fff}
    .troca:focus-visible{outline:2px solid #4c8dff;outline-offset:2px}
    .passo .troca{margin-left:auto}
    .seg{display:flex;border:1px solid #2a2c35;border-radius:10px;overflow:hidden;margin-bottom:18px}
    .seg button{flex:1;border:0;border-right:1px solid #2a2c35;background:#191a20;color:#c9cdda;padding:9px 4px;cursor:pointer;font-size:13px}
    .seg button:last-child{border-right:0}
    .seg button.on{background:#4c8dff;color:#fff;font-weight:700}
    .grade{display:grid;gap:10px;margin-bottom:12px;grid-template-columns:1fr 1fr}
    .grade.um{grid-template-columns:1fr;max-width:210px}
    .pes{display:flex;flex-direction:column;gap:6px;min-width:0}
    .slot{position:relative;min-height:96px;border:1px dashed #3a3d4a;border-radius:12px;padding:8px;cursor:pointer;background:#16171c;display:flex;flex-direction:column;gap:6px}
    .slot.ativa{border:2px solid #4c8dff;border-style:solid}
    .slot.cheio{border-style:solid;border-color:#3a3d4a}.slot.cheio.ativa{border-color:#4c8dff}
    .slot b{font-size:13px}
    .slot img{width:100%;height:190px;object-fit:contain;background:#0b0c10;border-radius:8px;display:block}   /* a foto/recorte inteiro, sem cortar de novo; altura fixa mantém os quadrados alinhados */
    .slot .dica{color:#8b90a0;font-size:12px}
    .chv{display:flex;align-items:center;gap:10px;margin:2px 0 10px;font-size:13px;color:#c9cdda;cursor:pointer;user-select:none}
    .chv input{position:absolute;opacity:0;pointer-events:none}
    .chv i{flex:none;width:36px;height:20px;border-radius:12px;background:#2a2c35;position:relative;transition:background .15s}
    .chv i::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#9aa0b2;transition:left .15s,background .15s}
    .chv input:checked+i{background:#2f6bd6}.chv input:checked+i::after{left:18px;background:#fff}
    .chv input:focus-visible+i{outline:2px solid #4c8dff;outline-offset:2px}
    .grade.pr .slot{display:none}.grade.pr .pes{margin:0}
    .bgrid{display:grid;grid-template-columns:1fr;gap:8px}.bgrid.dois{grid-template-columns:1fr 1fr}
    .bgrid .go{margin:0;font-size:14px;padding:13px 8px}
    .jq{display:grid;grid-template-columns:1fr;border:1px solid #2a2c35;border-radius:9px;overflow:hidden}
    .jq button{border:0;border-bottom:1px solid #2a2c35;background:#16171c;color:#9aa0b2;padding:8px 2px;cursor:pointer;font-size:12px}
    .jq button:last-child{border-bottom:0}
    .jq button.on{background:#4c8dff;color:#fff;font-weight:700}
    .grade.um:has(.jq){max-width:none}
    .par{display:grid;grid-template-columns:1fr 1fr;border:1px solid #2a2c35;border-radius:9px;overflow:hidden}
    .par button{border:0;border-right:1px solid #2a2c35;background:#16171c;color:#9aa0b2;padding:7px 2px;cursor:pointer;font-size:12px}
    .par button:last-child{border-right:0}
    .par button.on{background:#4c8dff;color:#fff;font-weight:700}
    .par.escondido{visibility:hidden}
    .trio{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}.duo{display:grid;grid-template-columns:1fr 1fr;gap:4px}
    .sc{border:1px solid #2a2c35;background:#16171c;color:#9aa0b2;border-radius:8px;padding:6px 2px;cursor:pointer;font-size:12px}
    .sc.on{background:#4c8dff;color:#fff;border-color:#4c8dff;font-weight:700}
    .maisop{background:none;border:0;color:#9aa0b2;cursor:pointer;padding:6px 0;font-size:13px}
    .maisop .cnt{background:#4c8dff;color:#fff;border-radius:9px;padding:1px 7px;font-size:11px;margin-left:4px}
    .aj label{display:block;font-size:12px;color:#8b90a0;margin:6px 0 4px}
    .aj input{width:100%;height:36px;box-sizing:border-box;padding:0 14px;border-radius:18px;border:1px solid #2a2c35;background:#16171c;color:#fff;outline:none}
    .aj input:focus{border-color:#4c8dff}
    .micb{flex:none;width:36px;height:36px;padding:0;border-radius:50%;border:1px solid #2a2c35;background:#1d1d22;color:#8e8e9a;cursor:pointer;display:grid;place-items:center}
    .micb:hover{color:#fff;border-color:#4c8dff}
    .micb.on{background:#f2686a;border-color:#f2686a;color:#fff;animation:pulsa 1.2s ease-in-out infinite}
    @keyframes pulsa{50%{box-shadow:0 0 0 5px rgba(242,104,106,.25)}}
    .aviso{color:#fcd34d;font-size:13px;margin:6px 0}.aviso.bad{color:#fca5a5}
    .dicac{display:flex;align-items:center;gap:9px;font-size:.8rem;color:#9aa0b2;margin:0;padding:9px 12px;background:#16161a;border:1px solid #2a2a31;border-radius:10px}.dicac:empty{display:none}
    .dicac::before{content:"i";flex:none;width:16px;height:16px;border-radius:50%;background:rgba(76,141,255,.18);color:#4c8dff;font:700 11px/16px Georgia,serif;text-align:center}.dicac b{color:#e6e8ee}
    .go{width:100%;border:0;border-radius:10px;padding:13px;font-size:15px;font-weight:700;background:#4c8dff;color:#fff;cursor:pointer;margin-bottom:8px}
    .go.sec{background:#191a20;border:1px solid #2a2c35;color:#c9cdda}
    .go:disabled{opacity:.4;cursor:not-allowed}
    .msg{font-size:13px;min-height:18px}.msg.bad{color:#fca5a5}
    /* andamento = a tela de detalhe do Estúdio (1 Original e refazer · 2 Prévia · 3 Vídeo), adaptada à extensão */
    .andam{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;padding:18px 24px 20px;gap:14px;background:#131317}
    .dh{display:flex;align-items:center;gap:14px}
    .dh h3{margin:0;font-size:1.05rem;font-weight:700;color:#ececf0;white-space:nowrap}
    .dh small{color:#8e8e9a;font-size:.82rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dh select{height:32px;max-width:260px;border:1px solid #2a2a31;background:#1d1d22;color:#ececf0;border-radius:8px;padding:0 8px;font-size:.82rem}
    .dh .bt{height:32px;padding:0 14px;border:1px solid #2a2a31;background:#1d1d22;color:#ececf0;border-radius:8px;font-weight:600;font-size:.82rem;cursor:pointer;white-space:nowrap}
    .dh .bt:hover{border-color:#4c8dff}
    .cols{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:auto minmax(0,1fr) auto auto auto auto auto;column-gap:20px;row-gap:10px;align-content:stretch}
    .col{display:contents}
    .col:nth-child(1)>*{grid-column:1}.col:nth-child(2)>*{grid-column:2}.col:nth-child(3)>*{grid-column:3}
    .col>.ct{grid-row:1}.col>.cartao{grid-row:2}.col>.jqs-l{grid-row:3}.col>.lin2{grid-row:4}.col>.stt{grid-row:5}.col>.aj{grid-row:5}.col:nth-child(1)>.stt{grid-row:6}.col:nth-child(1)>.stt:empty{display:none}
    .jqs-l:empty,.aj:empty{display:none}
    .aj{display:flex;flex-direction:column;gap:5px;margin:0}.aj label{margin:0;font-size:.78rem;font-weight:600;color:#9a9aa6}
    .aj input{height:40px;box-sizing:border-box;border:1px solid #2a2a31;background:#16161a;color:#ececf0;border-radius:8px;padding:0 12px;font-size:.88rem;outline:none}.aj input:focus{border-color:#4c8dff}
    .stt{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}
    .rodape{display:flex;flex-direction:column;gap:4px}.rodape:empty{display:none}
    .col .ct{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:24px;font-size:.72rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#9a9aa6}
    .cartao{flex:1;min-height:0;position:relative;background:#16161a;border:1px solid #2a2a31;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center}
    .cartao img,.cartao video{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain;display:block;background:#000}
    .cartao .orig{display:flex;gap:6px;width:100%;height:100%;padding:6px;box-sizing:border-box;background:#000}
    .cartao .orig img{flex:1;min-width:0;border-radius:4px}
    .espera{display:flex;flex-direction:column;align-items:center;gap:12px;color:#8e8e9a;font-size:.9rem;text-align:center;padding:20px}
    .espera .gira{width:34px;height:34px;border-radius:50%;border:3px solid #4c8dff;border-top-color:transparent;animation:giro 1s linear infinite}
    .espera b{color:#ececf0;font-size:1.3rem;font-variant-numeric:tabular-nums}
    .espera.erro .gira{display:none}.espera.erro{color:#f2686a}
    @keyframes giro{to{transform:rotate(360deg)}}
    .sel{position:absolute;top:8px;right:8px;width:34px;height:34px;border-radius:8px;border:0;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;font-size:16px}
    .pill{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;font-weight:700;letter-spacing:0;text-transform:none;padding:3px 10px;border-radius:6px;color:#8e8e9a;background:color-mix(in srgb,currentColor 14%,transparent)}
    .pill.ok{color:#22d366}.pill.agora{color:#4c8dff}.pill.erro{color:#f2686a}
    .pill.ok::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
    .lin2{display:flex;gap:8px}
    .gr{flex:1;min-width:0;height:42px;border:1px solid #4c8dff;background:#4c8dff;color:#fff;border-radius:8px;font-size:.95rem;font-weight:700;cursor:pointer;white-space:nowrap}
    .gr:hover:not([disabled]){background:#3b7df0;border-color:#3b7df0}
    .gr.sec{background:#1d1d22;border-color:#2a2a31;color:#ececf0}.gr.sec:hover:not([disabled]){border-color:#4c8dff;background:#1d1d22}
    .gr[disabled]{opacity:.45;cursor:default}
    .gr.ic{flex:none;width:42px;padding:0}
    .jqs{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #2a2a31;border-radius:8px;overflow:hidden}
    .jqs button{border:0;border-right:1px solid #2a2a31;background:#16161a;color:#9a9aa6;padding:10px 4px;font-size:.78rem;cursor:pointer}
    .jqs button:last-child{border-right:0}.jqs button.on{background:#4c8dff;color:#fff;font-weight:700}
    .mpd{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}
    .mpc{background:#17181f;border:1px solid #2a2c35;border-radius:12px;padding:16px;width:min(560px,100%);max-height:92vh;display:flex;flex-direction:column;gap:10px;color:#e6e8f0}
    .mpc h3{margin:0;font-size:15px}.mpc p{margin:0;font-size:12.5px;color:#9aa0b2}
    .mpc textarea{width:100%;min-height:260px;resize:vertical;background:#0f1015;color:#e6e8f0;border:1px solid #2a2c35;border-radius:8px;padding:10px;font:12.5px/1.45 ui-monospace,Consolas,monospace;box-sizing:border-box}
    .mpc .lin{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mpc .lin .qtd{margin-left:auto;font-size:12px;color:#9aa0b2}.mpc .lin .qtd.bad{color:#f2686a}
    .env{display:flex;flex:0 0 100%;align-items:center;gap:6px;padding:8px 12px;border-radius:10px;background:rgba(34,211,102,.12);color:#22d366;font-size:.8rem;font-weight:600}
    .avc{display:flex;align-items:center;justify-content:flex-start;gap:8px;flex-wrap:wrap;flex:0 0 100%;margin:0;padding:8px 10px 8px 12px;background:#16161a;border:1px solid #2a2a31;border-radius:10px;color:#b4b8c6;font-size:.82rem}
    .avc>span:first-child{font-weight:600;margin-right:auto}.avc .avb{margin-left:0}
    .avb{font:inherit;font-size:.8rem;font-weight:600;height:30px;padding:0 14px;border-radius:8px;border:1px solid #2a2c35;background:#1d1f27;color:#c9cdda;cursor:pointer}
    .avb.ok{border-color:#22d366;color:#22d366}.avb.bad{border-color:#f2686a;color:#f2686a}.avb:hover{background:#262935}
    .avm{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;width:100%}
    #s-video{flex-wrap:wrap}
    .stt{font-size:.85rem;color:#8e8e9a;min-height:22px;line-height:1.3}.stt.ok{color:#22d366}.stt.bad{color:#f2686a}
    .andam .erro{color:#f2686a;font-size:.85rem}
    @media(max-width:1100px){.cols{grid-template-columns:1fr;grid-template-rows:none;overflow:auto}.col{display:flex;flex-direction:column;gap:10px}.col>*{grid-column:auto!important;grid-row:auto!important}.cartao{min-height:360px}}
  </style>
  <div class="veu" id="veu"><div class="gav"><div class="alca" id="alca" title="Arraste para mudar a largura do painel (duplo clique volta ao tamanho padrão)"></div>
    <header><div class="tit"><svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#161d4a"/><stop offset="1" stop-color="#262b73"/></linearGradient><radialGradient id="lb"><stop offset="0" stop-color="#fcd679" stop-opacity=".55"/><stop offset="1" stop-color="#fcd679" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" rx="110" fill="url(#lg)"/><circle cx="256" cy="256" r="175" fill="url(#lb)"/><polygon fill="#fcd679" points="256,92 282,236 420,256 282,276 256,420 230,276 92,256 230,236"/><polygon fill="#fff6dc" points="256,150 270,242 372,256 270,270 256,370 242,270 140,256 242,242"/><polygon fill="#fcd679" points="385,100 392,128 420,135 392,142 385,170 378,142 350,135 378,128"/><polygon fill="#fcd679" points="131,355 136,375 156,380 136,385 131,405 126,385 106,380 126,375"/></svg><div><h3>Estúdio Eternize · Nova homenagem</h3><small id="cli"></small></div></div><button class="x" id="fechar" aria-label="Fechar" title="Fechar">${IC.fecharG}</button></header>
    <div class="corpo" id="corpo"></div>
    <div class="edit" id="edit"></div>
  </div></div>`;
  const $ = s => sombra.querySelector(s);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function acharTraduzir() {
    const cand = [...document.querySelectorAll('[aria-label*="Traduzir" i], [title*="Traduzir" i]')].filter(e => {
      if (e.closest('#estudio-leona-raiz') || e.closest('#estudio-leona-caixa')) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;   // o botão escondido (md:hidden) tem tamanho zero
    });
    cand.sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top);   // o de cima (cabeçalho), não o da caixa de mensagem
    return cand[0] || null;
  }
  // O botão fica FORA do shadow DOM, dentro da barra de ícones do cabeçalho, com a mesma estrutura e as mesmas classes dos outros ícones da Leona.
  const caixa = document.createElement('div');
  caixa.id = 'estudio-leona-caixa';
  caixa.className = 'relative inline-flex';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'estudio-leona-btn';
  btn.className = 'inline-flex items-center justify-center p-2 min-h-[36px] min-w-[36px] shrink-0 transition-all rounded-lg text-accent-primary hover:bg-surface-interactive hover:text-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30';
  btn.title = 'Estúdio Eternize: fotos do cliente';
  btn.setAttribute('aria-label', 'Estúdio Eternize: fotos do cliente');
  const qtdEl = document.createElement('span');
  qtdEl.style.cssText = 'position:absolute;top:-2px;right:-2px;background:#f59e0b;color:#000;font:700 10px/1 system-ui,sans-serif;border-radius:9px;padding:2px 5px;pointer-events:none';
  const vigia = new Map(), avisos = {};   // chat -> pedido vigiado ; chat -> 'previa' | 'video'
  const pontoEl = document.createElement('span');
  pontoEl.style.cssText = 'position:absolute;bottom:3px;right:3px;width:9px;height:9px;background:#22d366;border:2px solid #16161a;border-radius:50%;pointer-events:none;display:none;box-sizing:content-box';
  const OURO = '#fcd679';   // o dourado da logo do Estúdio
  const ESTRELA = '<path d="M12 4.3l1.5 6.2 6.2 1.5-6.2 1.5L12 19.7l-1.5-6.2L4.3 12l6.2-1.5z" stroke-width="1.6"/>' +
    '<path d="M18 4.7l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5zM6.1 16.3l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4z" fill="' + OURO + '" stroke-width=".6"/>';   // logo do Estúdio no estilo de contorno dos ícones da Leona
  (function () {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
    svg.setAttribute('class', 'w-[18px] h-[18px] shrink-0');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', OURO);
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ESTRELA;
    btn.appendChild(svg);
    caixa.append(btn, qtdEl, pontoEl);
  })();
  // ---------- ponto do editor: botão de relógio ao lado do botão do Estúdio ----------
  // Mesmo ponto do Estúdio: o primeiro pedido do dia abre sozinho; aqui o editor pausa, volta e encerra o dia.
  const caixaPonto = document.createElement('div');
  caixaPonto.id = 'estudio-ponto-caixa';
  caixaPonto.className = 'relative inline-flex';
  const btnPonto = document.createElement('button');
  btnPonto.type = 'button';
  btnPonto.id = 'estudio-ponto-btn';
  btnPonto.className = btn.className;
  btnPonto.setAttribute('aria-label', 'Estúdio Eternize: meu ponto');
  btnPonto.title = 'Meu ponto';
  const bolaPonto = document.createElement('span');
  bolaPonto.style.cssText = 'position:absolute;bottom:3px;right:3px;width:9px;height:9px;background:#8e8e9a;border:2px solid #16161a;border-radius:50%;pointer-events:none;box-sizing:content-box';
  btnPonto.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" class="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 3h5"/></svg>';
  caixaPonto.append(btnPonto, bolaPonto);
  const pop = document.createElement('div');
  pop.id = 'estudio-ponto-pop';
  const popSombra = pop.attachShadow({ mode: 'open' });
  popSombra.innerHTML = `
  <style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:system-ui,Segoe UI,sans-serif}
    .cx{position:fixed;z-index:2147483001;width:268px;background:#191a20;color:#ececf0;border:1px solid #2a2c35;border-radius:12px;padding:14px;box-shadow:0 14px 36px rgba(0,0,0,.45);display:none;font-size:13px;line-height:1.4}
    .cx.on{display:block}
    .est{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:700}
    .pt{width:10px;height:10px;border-radius:50%;background:#8e8e9a;flex:none}
    .trab .pt{background:#22d366;box-shadow:0 0 0 4px rgba(34,211,102,.2)}
    .pausa .pt{background:#f0a030;box-shadow:0 0 0 4px rgba(240,160,48,.2)}
    .sub{color:#8e8e9a;margin:4px 0 12px}
    button{font:inherit;cursor:pointer;border-radius:8px;height:34px;padding:0 12px;width:100%;font-weight:600;border:1px solid #2a2c35;background:#1d1d22;color:#ececf0}
    button:hover{border-color:#8e8e9a}
    button.p{background:#4c8dff;border-color:#4c8dff;color:#fff}
    button.p:hover{background:#3b7df0;border-color:#3b7df0}
    button[disabled]{opacity:.5;cursor:default}
    .linha{display:flex;gap:8px;margin-top:8px}
    a{display:block;margin-top:12px;color:#8e8e9a;font-size:12px;text-align:center;cursor:pointer;text-decoration:none}
    a:hover{color:#ececf0}
    .erro{color:#f2686a;font-size:12px;margin-top:8px}
  </style>
  <div class="cx" id="cx"><div class="est" id="est"><span class="pt"></span><span id="estt">Meu ponto</span></div><div class="sub" id="sub"></div>
    <button class="p" id="acao" type="button">Pausa</button><div class="linha"><button id="enc" type="button">Encerrar o dia</button></div>
    <div class="erro" id="erro"></div><a id="ver">Ver meu ponto completo</a></div>`;
  const P = s => popSombra.querySelector(s);
  const PT = { estado: '', desde: 0, porta: 0, falhou: false };
  const horaPT = t => new Date(t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  function pintarPonto() {
    bolaPonto.style.background = PT.falhou || !PT.estado || PT.estado === 'inicio' ? '#8e8e9a' : PT.estado === 'trabalhando' ? '#22d366' : '#f0a030';
    const txtEstado = PT.falhou ? 'Estúdio fechado' : PT.estado === 'trabalhando' ? 'Trabalhando' : PT.estado === 'pausa' ? 'Em pausa' : PT.estado === 'encerrado' ? 'Dia encerrado' : 'Sem ponto hoje';
    btnPonto.title = 'Meu ponto: ' + txtEstado + (PT.estado && PT.estado !== 'inicio' && !PT.falhou ? ' desde ' + horaPT(PT.desde) : '');
    const cx = P('#cx');
    cx.classList.toggle('trab', !PT.falhou && PT.estado === 'trabalhando');
    cx.classList.toggle('pausa', !PT.falhou && (PT.estado === 'pausa' || PT.estado === 'encerrado'));
    P('#estt').textContent = txtEstado;
    P('#sub').textContent = PT.falhou ? 'Abra o aplicativo do Estúdio neste computador.'
      : PT.estado === 'inicio' ? 'O ponto abre sozinho no seu primeiro pedido.'
      : 'desde ' + horaPT(PT.desde);
    P('#acao').textContent = PT.estado === 'trabalhando' ? 'Pausa' : PT.estado === 'inicio' || PT.estado === 'encerrado' ? 'Iniciar' : 'Voltar';
    P('#acao').disabled = P('#enc').disabled = PT.falhou;
    P('#enc').style.display = PT.estado === 'trabalhando' || PT.estado === 'pausa' ? '' : 'none';
  }
  async function carregarPonto() {
    let r; try { r = await chrome.runtime.sendMessage({ tipo: 'ponto' }); } catch (e) { r = null; }
    if (r && r.ok && r.dados) Object.assign(PT, { estado: r.dados.estado, desde: r.dados.desde || 0, porta: r.porta || PT.porta, falhou: false });
    else PT.falhou = true;
    pintarPonto();
  }
  async function acaoPonto(acao) {
    P('#erro').textContent = '';
    P('#acao').disabled = P('#enc').disabled = true;
    let r; try { r = await chrome.runtime.sendMessage({ tipo: 'ponto_acao', acao }); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) P('#erro').textContent = (r && r.erro) || 'Não deu certo. Tente de novo.';
    await carregarPonto();
  }
  function abrirPop(abrir) {
    const cx = P('#cx');
    if (abrir) {
      const r = btnPonto.getBoundingClientRect();
      cx.style.top = Math.round(r.bottom + 8) + 'px';
      cx.style.left = Math.max(8, Math.min(window.innerWidth - 276, Math.round(r.right - 268))) + 'px';
      cx.classList.add('on'); carregarPonto();
    } else cx.classList.remove('on');
  }
  btnPonto.addEventListener('click', e => { e.stopPropagation(); abrirPop(!P('#cx').classList.contains('on')); });
  P('#acao').addEventListener('click', () => acaoPonto('bater'));
  P('#enc').addEventListener('click', () => acaoPonto('encerrar'));
  P('#ver').addEventListener('click', () => { if (PT.porta) window.open('http://127.0.0.1:' + PT.porta + '/ponto', '_blank'); });
  document.addEventListener('click', e => { const cam = e.composedPath(); if (P('#cx').classList.contains('on') && !cam.includes(pop) && !cam.includes(caixaPonto)) abrirPop(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && P('#cx').classList.contains('on')) abrirPop(false); });
  function posicionarPonto() {
    if (caixa.parentElement) {
      if (caixaPonto.nextElementSibling !== caixa || caixaPonto.parentElement !== caixa.parentElement) {
        caixaPonto.style.cssText = caixa.style.position === 'fixed' ? 'position:fixed;top:14px;right:340px;z-index:2147483000;' : '';
        caixa.before(caixaPonto);
      }
    } else if (caixaPonto.parentElement !== document.body) {   // sem chat aberto o botão do Estúdio some, mas o ponto continua na tela, no mesmo canto
      caixaPonto.style.cssText = 'position:fixed;top:14px;right:300px;z-index:2147483000;';
      document.body.appendChild(caixaPonto);
    }
    if (!pop.parentElement) document.body.appendChild(pop);
  }
  setInterval(() => { if (!document.hidden) carregarPonto(); }, 60000);
  setTimeout(carregarPonto, 3000);

  function posicionar() {
    const alvo = acharTraduzir();
    if (alvo) {
      const item = alvo.closest('div.relative.inline-flex') || alvo;   // o "cartão" do ícone dentro da barra
      if (item.parentElement && (caixa.nextElementSibling !== item || caixa.parentElement !== item.parentElement)) {
        caixa.style.cssText = '';
        item.before(caixa);
      }
    } else if (chatAtual().id) {   // chat aberto mas não achei o Traduzir: botão solto no canto
      caixa.style.cssText = 'position:fixed;top:14px;right:300px;z-index:2147483000;';
      if (caixa.parentElement !== document.body) document.body.appendChild(caixa);
    } else if (caixa.parentElement) {   // sem chat aberto: não mostra
      caixa.remove();
    }
    const q = String(lerFotos().length);
    if (qtdEl.textContent !== q) qtdEl.textContent = q;
    try { pintarMarcas(); } catch (e) {}
    const av = avisos[chatAtual().id];
    pontoEl.style.display = av ? 'block' : 'none';
    try { posicionarPonto(); } catch (e) {}
    btn.title = av ? (av === 'video' ? 'Estúdio Eternize: o vídeo deste chat está pronto' : 'Estúdio Eternize: a prévia deste chat está pronta') : 'Estúdio Eternize: fotos do cliente';
  }
  let ultimo = 0, agendado = null;
  const pedir = () => {   // no máximo a cada 400 ms, mas sem adiar para sempre quando a página não para de mudar
    if (agendado) return;
    agendado = setTimeout(() => { agendado = null; ultimo = Date.now(); posicionar(); }, Math.max(0, 400 - (Date.now() - ultimo)));
  };
  new MutationObserver(pedir).observe(document.body, { childList: true, subtree: true });
  setInterval(posicionar, 1500);   // rede de segurança: a Leona redesenha o cabeçalho quando troca de chat
  document.body.appendChild(raiz);
  posicionar();

  // ---------- regras do menu (as mesmas da Nova homenagem) ----------
  const letras = () => pessoas.map(p => p.vivo ? 'v' : 'f').join('');
  function casoDe() {
    const l = letras();
    if (aniv && n === 1) return 'aniv-1p';
    if (n === 1) return '1p';
    if (emJuntos()) return jq;
    if (n === 2) return ({ ff: '2f', fv: '1f2v', vf: '1v2f' })[l] || null;
    return l.includes('f') ? n + '-' + l : null;
  }
  const todasFalecidas = () => pessoas.every(p => !p.vivo);
  const lista = () => emJuntos() ? pessoas.slice(0, 1) : pessoas;   // com "Mesma foto" só o 1º quadrado conta
  const okPronta = () => !!prontaSrc && !!casoDe() && (n < 2 || !!quemSobe.trim());
  function pedido(direto) {
    if (modoPronta) {   // prévia já enviada: uma imagem só; o Estúdio gera só o vídeo (Grok) e o "quem sobe" vai para a IA do roteiro
      return { origem: 'leona', chat: chatPainel.id ? chatPainel : chatAtual(), caso: casoDe(), pessoas: [{ n: 1, vivo: false, fotos: [prontaSrc] }],
        opcoes: { pronta: true, quem_sobe: quemSobe.trim(), ajuste: ajuste.trim(), direto: true } };
    }
    const idx = k => pessoas.map((p, i) => p[k] ? i + 1 : 0).filter(Boolean);
    let chegada = null;
    if (n >= 2 && n <= 4 && todasFalecidas() && pessoas.some(p => p.papel)) {
      chegada = { espera: pessoas.map((p, i) => p.papel === 'espera' ? i + 1 : 0).filter(Boolean), chega: pessoas.map((p, i) => p.papel === 'chega' ? i + 1 : 0).filter(Boolean) };
    }
    if (emJuntos()) {
      const p = pessoas[0];
      return { origem: 'leona', chat: chatPainel.id ? chatPainel : chatAtual(), caso: jq, juntos: true,
        pessoas: [{ n: 1, vivo: false, fotos: [fotosSel.find(f => f.id === p.foto).src], ...(p.editada ? { imagem: { tipo: 'image/jpeg', b64: p.editada.b64 } } : {}) }],
        opcoes: { ajuste: ajuste.trim(), direto } };
    }
    return {
      origem: 'leona', chat: chatPainel.id ? chatPainel : chatAtual(), caso: casoDe(),
      pessoas: pessoas.map((p, i) => ({ n: i + 1, vivo: p.vivo, fotos: [fotosSel.find(f => f.id === p.foto).src], ...(p.editada ? { imagem: { tipo: 'image/jpeg', b64: p.editada.b64 } } : {}) })),
      opcoes: { semcamisa: idx('semcamisa'), calca: idx('calca'), vestido: idx('vestido'), animal: idx('animal'), bebe: idx('bebe'), chegada, ajuste: ajuste.trim(), direto },
    };
  }
  function problema() {
    if (!casoDe()) return n === 1 ? '' : 'Todas estão marcadas como vivas. A homenagem precisa de pelo menos uma pessoa que faleceu.';
    if (!lista().every(p => p.foto)) return '';
    if (emJuntos()) return '';
    if (pessoas.some(p => p.papel)) {
      if (!todasFalecidas()) return '"No céu" e "Chegou" só valem quando todas estão como Faleceu.';
      if (pessoas.some(p => !p.papel) || !pessoas.some(p => p.papel === 'espera') || !pessoas.some(p => p.papel === 'chega'))
        return 'Marque cada pessoa: "No céu" (espera no meio da escada) ou "Chegou" (no pé da escada). Tem que ter pelo menos uma de cada.';
    }
    return '';
  }
  function dica() {
    if (n < 2) return '';
    if (emJuntos()) return '<b>Sobem:</b> ' + ({ '2f': 'as duas pessoas', '1f2v': 'a da esquerda', '1v2f': 'a da direita' })[jq] + '.';
    const l = letras(); if (!casoDe()) return '';
    const sobem = [], ficam = [];
    l.split('').forEach((x, i) => (x === 'f' ? sobem : ficam).push('Pessoa ' + (i + 1)));
    return '<b>Sobem:</b> ' + sobem.join(', ') + '.' + (ficam.length ? ' <b>Ficam e acompanham:</b> ' + ficam.join(', ') + '.' : '');
  }
  function setN(k) {
    n = k; if (k !== 2) juntos = false;
    while (pessoas.length < n) pessoas.push(nova());
    pessoas.length = n;
    const livre = pessoas.findIndex(p => !p.foto);   // o marcador vai para a primeira pessoa ainda sem foto
    ativa = livre >= 0 ? livre : Math.min(ativa, n - 1);
  }

  // ---------- recortar a pessoa: o botão ✂ de cada quadrado (P1, P2, P3...) abre esta tela ----------
  // O editor escolhe a foto do cliente, gira se precisar e recorta a pessoa; o recorte vai para aquele quadrado.
  const origens = new Map();   // endereço da foto -> imagem original carregada
  const giros = {};            // foto -> { rot, flip } lembrado: depois de girar uma vez, o próximo recorte já abre certo
  let ed = null;               // tela aberta: { i, fotoId, img, rot, flip, crop, carregando }
  const MIN_CORTE = 0.05;
  const CORTE_INICIAL = { x: .2, y: .1, w: .6, h: .8 };

  function carregarOriginal(src) {
    if (!origens.has(src)) {
      origens.set(src, (async () => {
        let r = await chrome.runtime.sendMessage({ tipo: 'baixar', url: src }).catch(() => null);
        let url = r && r.ok ? 'data:' + r.mime + ';base64,' + r.b64 : '';
        if (!url) {   // plano B: a própria página (só funciona se o servidor das fotos liberar)
          const resp = await fetch(src);
          if (!resp.ok) throw new Error('Não consegui abrir a foto (' + resp.status + ').');
          url = URL.createObjectURL(await resp.blob());
        }
        return await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('A foto não abriu.')); im.src = url; });
      })().catch(e => { origens.delete(src); throw e; }));
    }
    return origens.get(src);
  }

  // gira (em passos de 90°) e espelha; devolve a imagem inteira, antes do recorte
  function renderBase(img, e, maxSide) {
    const rot = ((e.rot % 4) + 4) % 4, sw = img.naturalWidth, sh = img.naturalHeight;
    const rw = rot % 2 ? sh : sw, rh = rot % 2 ? sw : sh;
    const k = Math.min(1, maxSide / Math.max(rw, rh));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(rw * k)); cv.height = Math.max(1, Math.round(rh * k));
    const c = cv.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.translate(cv.width / 2, cv.height / 2);
    if (e.flip) c.scale(-1, 1);          // espelhar: sempre de um lado para o outro, como se vê na tela
    c.rotate(rot * Math.PI / 2);
    c.scale(k, k);
    c.drawImage(img, -sw / 2, -sh / 2);
    return cv;
  }
  function renderFinal(img, e, maxSide) {
    const base = renderBase(img, e, 6000);
    const c = e.crop || { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.round(c.x * base.width), sy = Math.round(c.y * base.height);
    const sw = Math.max(1, Math.round(c.w * base.width)), sh = Math.max(1, Math.round(c.h * base.height));
    const k = Math.min(1, maxSide / Math.max(sw, sh));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
    const x = cv.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(base, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv;
  }
  const blobParaB64 = blob => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });

  async function aplicarEstado(i, img, estado) {
    const p = pessoas[i];
    const fim = renderFinal(img, estado, 1800);
    const blob = await new Promise(r => fim.toBlob(r, 'image/jpeg', 0.92));
    p.editada = { b64: await blobParaB64(blob), thumb: renderFinal(img, estado, 480).toDataURL('image/jpeg', 0.85) };
    p.edit = { rot: ((estado.rot % 4) + 4) % 4, flip: estado.flip, crop: estado.crop ? { ...estado.crop } : null };
  }

  async function abrirEditor(i) {
    if (!fotosSel.length) { msg = '!Não há fotos do cliente neste chat.'; return desenhar(); }
    const p = pessoas[i];
    // começa pela foto desta pessoa; se não tem, pela foto que as outras já usam (a de grupo); senão a primeira
    const fid = p.foto || (pessoas.find(q => q.foto) || {}).foto || fotosSel[0].id;
    ed = { i, fotoId: null, img: null, rot: 0, flip: false, crop: null, carregando: true };
    $('#edit').classList.add('on');
    await escolherFoto(fid);
  }
  async function escolherFoto(fid) {
    if (!ed) return;
    const f = fotosSel.find(x => x.id === fid), p = pessoas[ed.i];
    ed.fotoId = fid; ed.carregando = true; ed.erro = ''; desenharEditor();
    try {
      const img = await carregarOriginal(f.src);
      if (!ed || ed.fotoId !== fid) return;   // trocou de foto enquanto carregava
      const g = p.foto === fid && p.edit ? p.edit : (giros[fid] || { rot: 0, flip: false });
      ed.img = img; ed.rot = g.rot; ed.flip = g.flip;
      ed.crop = p.foto === fid && p.edit && p.edit.crop ? { ...p.edit.crop } : { ...CORTE_INICIAL };
      ed.carregando = false;
    } catch (er) { if (ed) { ed.carregando = false; ed.img = null; ed.erro = (er && er.message) || String(er); } }
    desenharEditor();
  }
  function fecharEditor() { ed = null; $('#edit').classList.remove('on'); $('#edit').innerHTML = ''; }

  function desenharEditor() {
    if (!ed) return;
    const rolagem = ($('#edit').querySelector('.edit-pes') || {}).scrollTop || 0;   // a coluna de fotos não volta ao topo a cada clique
    const miniaturas = fotosSel.map(f => `<button class="pick ${f.id === ed.fotoId ? 'at' : ''}" data-pick="${f.id}" title="Usar esta foto"><img src="${esc(f.src)}"></button>`).join('');
    $('#edit').innerHTML = `
      <div class="edit-top"><h4>Recortar a pessoa ${ed.i + 1}</h4>
        <button class="tb" data-ed="esq">${IC.girarEsq} Girar à esquerda</button><button class="tb" data-ed="dir">${IC.girarDir} Girar à direita</button>
        <button class="tb ${ed.flip ? 'on' : ''}" data-ed="flip">${IC.espelho} Espelhar</button>
        <button class="tb" data-ed="zero" style="margin-left:auto">Desfazer giro</button></div>
      <div class="edit-meio"><div class="edit-pes"><span>Fotos do cliente (${fotosSel.length})</span>${miniaturas}</div>
      <div class="edit-corpo" id="editcorpo">${ed.carregando ? '<div class="ocupado">Abrindo a foto…</div>' : ed.erro ? `<div class="aviso bad">${esc(ed.erro)}</div>` : '<div class="stage" id="stage"><canvas id="ec"></canvas></div>'}</div></div>
      <div class="edit-rod"><span class="res">Gire se precisar, depois arraste a moldura sobre a pessoa e ajuste pelas bolinhas.</span>
        <div style="display:flex;gap:8px"><button class="tb" data-ed="cancelar">Cancelar</button><button class="tb on" data-ed="usar" ${ed.img ? '' : 'disabled'} style="padding:9px 18px;font-weight:700">Usar como P${ed.i + 1}</button></div></div>`;
    const pes = $('#edit').querySelector('.edit-pes');
    if (pes) { pes.scrollTop = rolagem; if (!rolagem) { const at = pes.querySelector('.pick.at'); if (at) at.scrollIntoView({ block: 'nearest' }); } }
    if (ed.img && !ed.carregando) {
      const area = $('#editcorpo'), base0 = renderBase(ed.img, ed, 1600);
      const k = Math.min((area.clientWidth - 24) / base0.width, (area.clientHeight - 24) / base0.height, 4);   // ocupa toda a área livre (até 4x, para foto pequena também ficar grande)
      const ec = $('#ec'); ec.width = Math.max(1, Math.round(base0.width * k)); ec.height = Math.max(1, Math.round(base0.height * k));
      ec.getContext('2d').drawImage(base0, 0, 0, ec.width, ec.height);
      $('#stage').insertAdjacentHTML('beforeend', `<div class="crop ativo" id="crop"><b class="rot">P${ed.i + 1}</b>${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<i data-h="${h}"></i>`).join('')}</div>`);
      posCorte();
      $('#crop').addEventListener('pointerdown', ev => arrastar(ev, ev.target.dataset.h || 'move'));
    }
    $('#edit').querySelectorAll('[data-ed]').forEach(b => b.onclick = () => acaoEditor(b.dataset.ed));
    $('#edit').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { if (+b.dataset.pick !== ed.fotoId) escolherFoto(+b.dataset.pick); });
  }
  function posCorte() {
    const cv = $('#ec'), el = $('#crop'); if (!cv || !el || !ed.crop) return;
    const c = ed.crop;
    el.style.left = c.x * cv.width + 'px'; el.style.top = c.y * cv.height + 'px';
    el.style.width = c.w * cv.width + 'px'; el.style.height = c.h * cv.height + 'px';
  }
  function arrastar(ev, modo) {
    ev.preventDefault();
    const alvo = ev.currentTarget, st = $('#stage').getBoundingClientRect(), r0 = { ...ed.crop }, x0 = ev.clientX, y0 = ev.clientY;
    const lim = (v, a, b) => Math.min(Math.max(v, a), b);
    alvo.setPointerCapture(ev.pointerId);
    const mover = e => {
      const dx = (e.clientX - x0) / st.width, dy = (e.clientY - y0) / st.height;
      let x1 = r0.x, y1 = r0.y, x2 = r0.x + r0.w, y2 = r0.y + r0.h;
      if (modo === 'move') {
        const nx = lim(r0.x + dx, 0, 1 - r0.w), ny = lim(r0.y + dy, 0, 1 - r0.h);
        x1 = nx; y1 = ny; x2 = nx + r0.w; y2 = ny + r0.h;
      } else {
        if (modo.includes('w')) x1 = lim(r0.x + dx, 0, x2 - MIN_CORTE);
        if (modo.includes('e')) x2 = lim(x2 + dx, x1 + MIN_CORTE, 1);
        if (modo.includes('n')) y1 = lim(r0.y + dy, 0, y2 - MIN_CORTE);
        if (modo.includes('s')) y2 = lim(y2 + dy, y1 + MIN_CORTE, 1);
      }
      ed.crop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      posCorte();
    };
    const soltar = () => { alvo.removeEventListener('pointermove', mover); alvo.removeEventListener('pointerup', soltar); alvo.removeEventListener('pointercancel', soltar); };
    alvo.addEventListener('pointermove', mover); alvo.addEventListener('pointerup', soltar); alvo.addEventListener('pointercancel', soltar);
  }
  async function acaoEditor(a) {
    if (!ed) return;
    if (a === 'cancelar') return fecharEditor();
    const girou = () => { giros[ed.fotoId] = { rot: ed.rot, flip: ed.flip }; ed.crop = { ...CORTE_INICIAL }; desenharEditor(); };   // o giro fica lembrado para os próximos recortes desta foto
    if (a === 'esq' || a === 'dir') { ed.rot += a === 'dir' ? 1 : -1; return girou(); }
    if (a === 'flip') { ed.flip = !ed.flip; return girou(); }
    if (a === 'zero') { ed.rot = 0; ed.flip = false; return girou(); }
    if (a === 'usar' && ed.img) {
      const { i, fotoId, img, rot, flip } = ed, crop = { ...ed.crop };
      $('#edit').querySelectorAll('button').forEach(b => { b.disabled = true; });
      try {
        pessoas[i].foto = fotoId;      // o recorte vai para o quadrado que abriu esta tela
        await aplicarEstado(i, img, { rot, flip, crop });
        const prox = pessoas.findIndex(q => !q.foto);   // o marcador já pula para a próxima pessoa sem foto
        ativa = prox >= 0 ? prox : i;
        msg = '';
      } catch (er) { msg = '!' + (er && er.message || er); }
      fecharEditor(); desenhar();
    }
  }

  // ---------- desenho ----------
  const uso = id => { const u = pessoas.map((q, j) => q.foto === id ? 'P' + (j + 1) : '').filter(Boolean); return u.length ? `<span class="uso">${u.join(' + ')}</span>` : ''; };
  const BT = (cls, dado, txt, on) => `<button class="${cls}${on ? ' on' : ''}" ${dado}>${txt}</button>`;

  const contaOps = () => pessoas.reduce((a, p) => a + ['animal', 'bebe', 'semcamisa', 'calca', 'vestido'].filter(k => p[k]).length, 0) + (ajuste.trim() ? 1 : 0);
  const rotuloMais = () => { const k = contaOps(); return (mais ? IC.fecha : IC.abre) + ' Mais opções' + (k ? ` <span class="cnt">${k} ${k > 1 ? 'ligadas' : 'ligada'}</span>` : ''); };

  function desenhar() {
    const chat = chatPainel.id ? chatPainel : chatAtual();
    $('#cli').textContent = 'Cliente: ' + (chat.nome || '(nome não achado)') + ' · #' + (chat.id || '?') + ' (vem sozinho da Leona)';
    const usadas = pessoas.map(p => p.foto).filter(Boolean);
    const nOps = contaOps();
    const prob = modoPronta ? (casoDe() ? '' : 'Marque pelo menos uma pessoa que faleceu.') : problema(), ok = modoPronta ? (okPronta() && !prob) : (casoDe() && lista().every(p => p.foto) && !prob);
    const nossasSel = (lembrar() || {}).nossas || [];

    const cartoes = lista().map((p, i) => {
      const f = p.foto && fotosSel.find(x => x.id === p.foto);
      const livre = !p.animal && !p.bebe;
      return `<div class="pes">
        <div class="slot ${i === ativa ? 'ativa' : ''} ${f ? 'cheio' : ''}" data-slot="${i}">
          <b>${emJuntos() ? 'Foto com as duas pessoas' : 'P' + (i + 1)}</b>
          <div class="acs"><button data-edit="${i}" title="Recortar esta pessoa de uma foto do cliente" aria-label="Recortar">${IC.tesoura}</button>${f ? `<button data-lim="${i}" title="Tirar a foto" aria-label="Tirar a foto">${IC.fechar}</button>` : ''}</div>
          ${f ? `<img src="${esc(p.editada ? p.editada.thumb : f.src)}">${p.editada ? '<span class="etq">recortada</span>' : ''}` : '<span class="dica">Clique numa foto do chat ou use o botão de tesoura para recortar a pessoa</span>'}
          ${p.busy ? '<div class="ocupado">Abrindo a foto…</div>' : ''}
        </div>
        ${emJuntos() ? `<div class="jq">${['1f2v', '1v2f', '2f'].map(q => BT('', 'data-jq="' + q + '"', NOMEJQ[q], jq === q)).join('')}</div>` : ''}
        ${n >= 2 && !emJuntos() ? `<div class="par" data-est="${i}">${BT('', 'data-v="0"', IC.estrela + ' Faleceu', !p.vivo)}${BT('', 'data-v="1"', IC.coracao + ' Está viva', p.vivo)}</div>` : ''}
        ${n >= 2 && n <= 4 && !emJuntos() ? `<div class="par ${todasFalecidas() ? '' : 'escondido'}" data-papel="${i}">${BT('', 'data-pp="espera"', 'No céu', p.papel === 'espera')}${BT('', 'data-pp="chega"', 'Chegou', p.papel === 'chega')}</div>` : ''}
        ${mais && !emJuntos() ? `<div class="trio">${aniv ? '' : BT('sc', 'data-op="animal"', 'Animal', p.animal) + BT('sc', 'data-op="bebe"', 'Bebê', p.bebe)}${livre ? BT('sc', 'data-op="semcamisa"', 'Sem camisa', p.semcamisa) : ''}</div>
          ${livre ? `<div class="duo">${BT('sc', 'data-op="calca"', 'Calça', p.calca)}${BT('sc', 'data-op="vestido"', 'Vestido', p.vestido)}</div>` : ''}` : ''}
      </div>`;
    }).join('');

    const rolEsq = ($('#corpo .esq') || {}).scrollTop || 0, rolDir = ($('#corpo .dir') || {}).scrollTop || 0;   // redesenhar não pode levar as duas colunas de volta ao topo
    $('#corpo').innerHTML = `
      <div class="esq"><h5>Fotos que o cliente enviou (${fotosSel.length}) — clique para colocar na pessoa marcada <button class="troca ${buscando ? 'buscando' : ''}" id="antigas" style="margin-left:10px;text-transform:none;letter-spacing:0">${rotuloBusca()}</button></h5>
        <div class="fotos">${fotosSel.map(f => `<div class="foto" data-f="${f.id}"><img src="${esc(f.src)}">${uso(f.id)}</div>`).join('') || '<div class="vazio">Nenhuma foto achada neste chat.</div>'}</div>
        ${nossasSel.length ? `<h5 style="margin-top:16px">Prévias já enviadas neste chat — clique para gerar só o vídeo dela (${nossasSel.length})</h5><div class="fotos">${nossasSel.map(f => `<div class="foto" data-pronta="${f.id}" style="${modoPronta && prontaSrc === f.src ? 'outline:2px solid #4c8dff' : ''}"><img src="${esc(f.src)}">${modoPronta && prontaSrc === f.src ? '<span class="uso">escolhida</span>' : ''}</div>`).join('')}</div>` : ''}</div>
      <div class="dir" id="dir">
        ${modoPronta ? `<div class="aviso" style="border-color:#4c8dff"><b>Usando uma prévia já enviada:</b> só o vídeo será gerado (sem gastar prévia).${prontaSrc ? '' : ' Escolha a prévia na coluna ao lado.'} <button class="troca" id="tirapronta" style="margin-left:8px;text-transform:none;letter-spacing:0">Cancelar</button><div style="margin-top:8px"><label for="quem">Quem sobe a escada?${n >= 2 ? ' (obrigatório)' : ' (opcional)'}</label><input id="quem" maxlength="200" placeholder="Ex.: a senhora de blusa vermelha, à esquerda" value="${esc(quemSobe)}" style="width:100%"></div></div>` : ''}
        <div class="passo"><b>1</b><span>Quantas pessoas?</span>${n === 2 ? `<button class="troca" id="juntos" aria-pressed="${emJuntos()}" title="As duas pessoas aparecem na mesma foto: cole uma foto só e diga quem faleceu" style="${emJuntos() ? 'background:#4c8dff;color:#fff;border-color:#4c8dff' : ''}">${IC.pessoas} Mesma foto</button>` : ''}</div>
        <div class="seg">${(aniv ? [1] : [1, 2, 3, 4]).map(k => `<button data-n="${k}" class="${k === n ? 'on' : ''}">${k} ${k === 1 ? 'pessoa' : 'pessoas'}</button>`).join('')}${aniv ? '' : `<button data-n="5" class="mais ${n > 4 ? 'on' : ''}" title="Mais pessoas (5 a 8)" aria-label="Mais pessoas, de 5 a 8" style="flex:0 0 44px">+</button>`}<button id="aniv" class="${aniv ? 'on' : ''}" aria-pressed="${aniv}" title="Homenagem de ANIVERSÁRIO (1 pessoa): a foto entra numa festa com bolo e sopra as velas" style="flex:0 0 auto;padding:0 12px">🎂 Aniversário</button></div>
        ${n > 4 ? `<div class="seg">${[5, 6, 7, 8].map(k => `<button data-n="${k}" class="${k === n ? 'on' : ''}">${k} pessoas</button>`).join('')}</div>` : ''}
        <div class="passo"><b>2</b><span>${emJuntos() ? 'Cole a foto com as duas e diga quem faleceu' : n >= 2 ? 'Cole as fotos e marque quem faleceu' : 'Cole a foto'}</span>${n >= 2 && n <= 4 && !emJuntos() ? '<button class="troca" id="troca" title="Inverter a ordem (esquerda e direita)">' + IC.trocar + ' Trocar</button>' : ''}</div>
        <div class="grade ${n === 1 || emJuntos() ? 'um' : ''}${modoPronta ? ' pr' : ''}">${cartoes}</div>
        ${prob ? `<div class="aviso">${esc(prob)}</div>` : ''}
        <button class="maisop" id="mais">${rotuloMais()}</button>
        ${mais || modoPronta ? `<div class="aj"><label for="aj">${modoPronta ? 'Quer mudar algo no vídeo? (opcional)' : 'Quer mudar algo?'}</label><div style="display:flex;gap:8px;align-items:center"><input id="aj" maxlength="500" placeholder="${modoPronta ? 'Ex.: sem Jesus, ou tirar o copo da mão' : 'Ex.: tirar o copo da mão'}" value="${esc(ajuste)}" style="flex:1">${REC ? '<button class="micb" id="ajmic" type="button" title="Falar em vez de escrever" aria-label="Falar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' : ''}</div><div id="micmsg" class="aviso" style="display:none"></div></div>` : ''}
        <div class="passo" style="margin-top:14px"><b>3</b><span>Gerar</span></div>
        <div class="dicac">${dica()}</div>
        <label class="chv" title="Ligada: só aparecem os botões 'e enviar' (quando o arquivo fica pronto, vai sozinho para o cliente, mesmo que você já esteja em outro chat). Desligada: só aparecem os botões comuns e você envia à mão."><input type="checkbox" id="chaveauto" ${autoEnvio ? 'checked' : ''}><i></i><span>Envio automático ao cliente</span></label>
        ${casoDe() && !modoPronta ? '<button class="maisop" id="meuprompt" title="Seu texto do vídeo só para você (não muda o padrão dos outros)">Meu prompt</button>' : ''}
        <div class="bgrid">
          <button class="go" id="gdireto" ${ok ? '' : 'disabled'}>${modoPronta ? (autoEnvio ? 'Gerar só o vídeo e enviar' : 'Gerar só o vídeo') : (aniv ? (autoEnvio ? 'Gerar aniversário e enviar' : 'Gerar aniversário') : (autoEnvio ? 'Gerar homenagem e enviar' : 'Gerar homenagem'))}</button>
          ${modoPronta ? '' : `<button class="go sec" id="gprevia" ${ok ? '' : 'disabled'}>${autoEnvio ? 'Gerar só a prévia e enviar' : 'Gerar só a prévia'}</button>`}
        </div>
        <div class="msg ${msg.startsWith('!') ? 'bad' : ''}" id="msg">${esc(msg.replace(/^!/, ''))}</div>
      </div>`;
    { const e = $('#corpo .esq'), d = $('#corpo .dir'); if (e) e.scrollTop = rolEsq; if (d) d.scrollTop = rolDir; }
    ligar();
    agendarRascunho();
  }

  function ligar() {
    const c = $('#corpo');
    c.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { setN(+b.dataset.n); msg = ''; desenhar(); });
    const ba = $('#aniv'); if (ba) ba.onclick = () => { aniv = !aniv; if (aniv) setN(1); msg = ''; desenhar(); };   // aniversário é sempre 1 pessoa
    c.querySelectorAll('[data-slot]').forEach(e => e.onclick = () => { ativa = +e.dataset.slot; desenhar(); });
    c.querySelectorAll('[data-lim]').forEach(e => e.onclick = ev => { ev.stopPropagation(); const q = pessoas[+e.dataset.lim]; q.foto = null; q.edit = null; q.editada = null; ativa = +e.dataset.lim; desenhar(); });
    c.querySelectorAll('[data-edit]').forEach(e => e.onclick = ev => { ev.stopPropagation(); abrirEditor(+e.dataset.edit); });
    ligarFotos();
    c.querySelectorAll('[data-est] button').forEach(b => b.onclick = () => {
      const i = +b.closest('[data-est]').dataset.est;
      pessoas[i].vivo = b.dataset.v === '1';
      if (pessoas.some(p => p.vivo)) pessoas.forEach(p => { p.papel = ''; });   // quem está viva não tem "No céu / Chegou"
      desenhar();
    });
    c.querySelectorAll('[data-papel] button').forEach(b => b.onclick = () => {
      const p = pessoas[+b.closest('[data-papel]').dataset.papel], v = b.dataset.pp;
      p.papel = p.papel === v ? '' : v; desenhar();
    });
    c.querySelectorAll('[data-op]').forEach(b => b.onclick = () => {
      const i = +b.closest('.pes').querySelector('[data-slot]').dataset.slot, p = pessoas[i], k = b.dataset.op;
      p[k] = !p[k];
      if (p[k] && (k === 'animal' || k === 'bebe')) { p.semcamisa = p.calca = p.vestido = false; p[k === 'animal' ? 'bebe' : 'animal'] = false; }
      if (p[k] && k === 'calca') p.vestido = false;
      if (p[k] && k === 'vestido') p.calca = false;
      desenhar();
    });
    const ant = $('#antigas'); if (ant) ant.onclick = () => { if (buscando) return; const ch = chatAtual().id; completo.delete(ch); buscaFundo(ch); };
    const jb = $('#juntos'); if (jb) jb.onclick = () => { juntos = !juntos; ativa = 0; msg = ''; desenhar(); };
    c.querySelectorAll('[data-jq]').forEach(b => b.onclick = () => { jq = b.dataset.jq; desenhar(); });
    const troca = $('#troca'); if (troca) troca.onclick = () => { pessoas.reverse(); ativa = 0; desenhar(); };
    $('#mais').onclick = () => { mais = !mais; desenhar(); };
    const mic = $('#ajmic'); if (mic) mic.onclick = () => falar(mic, $('#aj'));
    const aj = $('#aj'); if (aj) aj.oninput = () => { ajuste = aj.value; $('#mais').innerHTML = rotuloMais(); };
    // chave ligada: só os botões "... e enviar" (o arquivo vai sozinho ao cliente); desligada: só os botões comuns (você envia à mão)
    $('#gdireto').onclick = () => enviar(true, autoEnvio);
    if ($('#gprevia')) $('#gprevia').onclick = () => enviar(false, autoEnvio);
    $('#corpo').querySelectorAll('[data-pronta]').forEach(e => e.onclick = () => { const f = ((lembrar() || {}).nossas || []).find(x => x.id === +e.dataset.pronta); if (!f) return; modoPronta = true; prontaSrc = f.src; msg = ''; desenhar(); });
    if ($('#tirapronta')) $('#tirapronta').onclick = () => { modoPronta = false; prontaSrc = ''; quemSobe = ''; desenhar(); };
    if ($('#meuprompt')) $('#meuprompt').onclick = abrirMeuPrompt;
    if ($('#quem')) $('#quem').oninput = e => { quemSobe = e.target.value; const g = $('#gdireto'); if (g) g.disabled = !(okPronta() && casoDe()); };
    $('#chaveauto').onchange = e => { autoEnvio = e.target.checked; try { chrome.storage.local.set({ autoEnvio }); } catch (x) {} desenhar(); };
  }

  function ligarFotos() {
    $('#corpo').querySelectorAll('[data-f]').forEach(e => e.onclick = () => {   // a foto vai para a pessoa marcada; o marcador pula para a próxima sem foto
      pessoas[ativa].foto = +e.dataset.f; pessoas[ativa].edit = null; pessoas[ativa].editada = null;   // outra foto: a edição da anterior não vale
      const prox = pessoas.findIndex(p => !p.foto);
      if (prox >= 0) ativa = prox;
      msg = ''; desenhar();
    });
  }
  const usoFoto = id => { const u = pessoas.map((q, j) => q.foto === id ? 'P' + (j + 1) : '').filter(Boolean); return u.length ? `<span class="uso">${u.join(' + ')}</span>` : ''; };
  function atualizarFotos() {   // põe as fotos novas na lista sem mexer no resto do menu (quem está montando a homenagem não é atrapalhado)
    const el = $('.fotos'), h = $('.esq h5'); if (!el || !h) return;
    fotosSel = lerFotos();
    el.innerHTML = fotosSel.map(f => `<div class="foto" data-f="${f.id}"><img src="${esc(f.src)}">${usoFoto(f.id)}</div>`).join('') || '<div class="vazio">Nenhuma foto achada neste chat.</div>';
    h.childNodes[0].textContent = 'Fotos que o cliente enviou (' + fotosSel.length + ') — clique para colocar na pessoa marcada ';
    ligarFotos();
  }
  let notaBusca = '';
  function rotuloBusca() { return buscando ? IC.atualizar + ' Buscando fotos antigas… (' + (fotosSel ? fotosSel.length : 0) + ')' : notaBusca ? IC.check + ' ' + notaBusca : IC.atualizar + ' Buscar fotos antigas'; }
  function pintarBusca() { const b = $('#antigas'); if (b) { b.innerHTML = rotuloBusca(); b.classList.toggle('buscando', buscando); } }
  const completo = new Set();   // chats cujas mensagens antigas já foram todas carregadas
  async function buscaFundo(ch) {   // roda sozinha, com o painel aberto, sem travar nada: só acrescenta as fotos que forem aparecendo
    if (buscando) return;
    buscando = true; notaBusca = ''; pintarBusca();
    try { await buscarAntigas(() => { if (chatAtual().id === ch) { atualizarFotos(); pintarBusca(); } }, () => $('#veu').classList.contains('on')); } catch (e) {}
    const terminou = $('#veu').classList.contains('on') && chatAtual().id === ch;
    buscando = false;
    if (terminou) {
      completo.add(ch);
      if (rascunho && $('#gdireto')) { fotosSel = lerFotos(); aplicarRascunho(true); desenhar(); }   // o rascunho esperava as fotos antigas
      else atualizarFotos();
      notaBusca = 'Todas as fotos carregadas'; pintarBusca();
      setTimeout(() => { notaBusca = ''; pintarBusca(); }, 3500);
    } else pintarBusca();
  }
  // ---- "Meu prompt": o editor muda o texto do vídeo SÓ para ele (por caso). O padrão dos outros não muda. ----
  async function abrirMeuPrompt() {
    const caso = casoDe(); if (!caso) return;
    let r = null; try { r = await chrome.runtime.sendMessage({ tipo: 'meu_prompt_get', caso }); } catch (e) {}
    if (!r || !r.ok) { msg = '!Não consegui abrir o seu prompt agora. ' + ((r && r.erro) || ''); return desenhar(); }
    const padrao = r.dados.padrao || '', meu = r.dados.meu || '';
    const d = document.createElement('div'); d.className = 'mpd'; d.id = 'mpd';
    d.innerHTML = `<div class="mpc"><h3>Meu prompt do vídeo · ${esc(caso)}</h3>
      <p>${meu ? 'Você está usando o SEU texto neste caso. Os outros editores continuam com o padrão.' : 'Hoje este caso usa o texto padrão. Se você mudar e salvar, só os SEUS vídeos deste caso usam o seu texto.'}</p>
      <textarea id="mptxt" spellcheck="false"></textarea>
      <div class="lin"><button class="go" id="mpsalva">Salvar só para mim</button><button class="go sec" id="mppadrao">Voltar ao padrão</button><button class="go sec" id="mpfecha">Fechar</button><span class="qtd" id="mpqtd"></span></div>
      <div class="msg" id="mpmsg"></div></div>`;
    ($('#veu') || document.body).appendChild(d);
    const ta = d.querySelector('#mptxt'); ta.value = meu || padrao;
    const conta = () => { const q = d.querySelector('#mpqtd'); q.textContent = ta.value.length + ' / 4096'; q.className = 'qtd' + (ta.value.length > 4096 ? ' bad' : ''); };
    ta.oninput = conta; conta();
    const fala = (t, ruim) => { const m = d.querySelector('#mpmsg'); m.textContent = t; m.className = 'msg' + (ruim ? ' bad' : ''); };
    d.querySelector('#mpfecha').onclick = () => { d.remove(); desenhar(); };
    d.querySelector('#mpsalva').onclick = async () => {
      if (ta.value.length > 4096) return fala('O texto passa de 4096 letras. O Grok recusa mais que isso.', true);
      const s = await chrome.runtime.sendMessage({ tipo: 'meu_prompt_set', caso, texto: ta.value }).catch(() => null);
      if (s && s.ok) fala(s.dados && s.dados.meu ? 'Salvo. Os seus próximos vídeos deste caso usam este texto.' : 'Este texto é igual ao padrão: voltou ao padrão.'); else fala((s && s.erro) || 'Não salvou. Tente de novo.', true);
    };
    d.querySelector('#mppadrao').onclick = async () => {
      const s = await chrome.runtime.sendMessage({ tipo: 'meu_prompt_set', caso, texto: '' }).catch(() => null);
      if (s && s.ok) { ta.value = padrao; conta(); fala('Voltou ao padrão.'); } else fala((s && s.erro) || 'Não salvou. Tente de novo.', true);
    };
  }
  // ---- "Deu certo / Deu erro" no vídeo pronto: ajuda o Misael a achar qual texto funciona ----
  const MOTIVOS_AVAL = ['Jesus não abraçou', 'Não subiu a escada', 'Rosto mudou', 'Roupa mudou', 'Pessoa errada subiu', 'Outro'];
  const avalLocal = {}; let avalAberto = '';
  function pintarAval(vid, servidor) {
    const c = $('#avc'); if (!c) return;
    const a = (vid in avalLocal) ? avalLocal[vid] : servidor;
    if (a) c.innerHTML = `<span class="${a === 'certo' ? 'ok' : 'bad'}" style="font-size:12px">${a === 'certo' ? 'Marcado: deu certo' : 'Marcado: deu erro'}</span><button class="avb" data-av="mudar">mudar</button>`;
    else c.innerHTML = `<span style="font-size:12px">O vídeo ficou bom?</span><button class="avb ok" data-av="certo">Deu certo</button><button class="avb bad" data-av="erro">Deu erro</button>` + (avalAberto === vid ? `<div class="avm">${MOTIVOS_AVAL.map(m => `<button class="avb" data-mot="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : '');
    c.querySelectorAll('[data-av]').forEach(b => { b.onclick = () => {
      if (b.dataset.av === 'mudar') { avalLocal[vid] = ''; avalAberto = ''; return pintarAval(vid, servidor); }
      if (b.dataset.av === 'erro') { avalAberto = avalAberto === vid ? '' : vid; return pintarAval(vid, servidor); }
      enviarAval(vid, 'certo', '', servidor);
    }; });
    c.querySelectorAll('[data-mot]').forEach(b => { b.onclick = () => enviarAval(vid, 'erro', b.dataset.mot, servidor); });
  }
  let ultimoVideo = { id: '', aval: '', perguntar: true };
  // Antes de enviar o vídeo ao cliente: "O vídeo ficou bom?". Deu certo envia; Deu erro marca o motivo e NÃO envia (a menos que o editor escolha "Enviar mesmo assim").
  function confirmarVideo() {
    return new Promise(resolve => {
      const v = ultimoVideo; if (!v.id || !v.perguntar) return resolve(true);
      const atual = (v.id in avalLocal) ? avalLocal[v.id] : v.aval;
      if (atual === 'certo') return resolve(true);
      const d = document.createElement('div'); d.className = 'mpd';
      const fim = ok => { d.remove(); resolve(ok); };
      const marcar = async (res, mot) => {
        const r = await chrome.runtime.sendMessage({ tipo: 'avaliar', id: v.id, resultado: res, motivo: mot || '' }).catch(() => null);
        if (!(r && r.ok)) { const m = d.querySelector('#cvmsg'); m.textContent = 'Não consegui marcar agora. ' + ((r && r.erro) || 'Tente de novo.'); m.className = 'msg bad'; return false; }
        avalLocal[v.id] = res; avalAberto = ''; pintarAval(v.id, res); return true;
      };
      const telaPergunta = () => {
        d.innerHTML = `<div class="mpc"><h3>O vídeo ficou bom?</h3><p>${atual === 'erro' ? 'Você marcou que este vídeo deu erro.' : 'Confira o vídeo antes de enviar ao cliente.'} Sua resposta ajuda a achar qual prompt funciona.</p>
          <div class="lin"><button class="go" id="cvok">Deu certo, enviar</button><button class="go sec" id="cverr">Deu erro</button><button class="go sec" id="cvfecha">Cancelar</button></div><div class="msg" id="cvmsg"></div></div>`;
        d.querySelector('#cvfecha').onclick = () => fim(false);
        d.querySelector('#cvok').onclick = async () => { if (await marcar('certo')) fim(true); };
        d.querySelector('#cverr').onclick = telaMotivo;
      };
      const telaMotivo = () => {
        d.innerHTML = `<div class="mpc"><h3>O que deu errado?</h3><div class="avm">${MOTIVOS_AVAL.map(m => `<button class="avb" data-mot="${esc(m)}">${esc(m)}</button>`).join('')}</div><div class="lin"><button class="go sec" id="cvvolta">Voltar</button></div><div class="msg" id="cvmsg"></div></div>`;
        d.querySelector('#cvvolta').onclick = telaPergunta;
        d.querySelectorAll('[data-mot]').forEach(b => { b.onclick = async () => { if (await marcar('erro', b.dataset.mot)) telaErro(); }; });
      };
      const telaErro = () => {
        d.innerHTML = `<div class="mpc"><h3>Marcado como erro</h3><p>O vídeo NÃO foi enviado ao cliente. Use Refazer para gerar outro.</p>
          <div class="lin"><button class="go" id="cvfecha2">Fechar</button><button class="go sec" id="cvmesmo">Enviar mesmo assim</button></div></div>`;
        d.querySelector('#cvfecha2').onclick = () => fim(false);
        d.querySelector('#cvmesmo').onclick = () => fim(true);
      };
      ($('#veu') || document.body).appendChild(d);
      telaPergunta();
    });
  }
  async function enviarAval(vid, resultado, motivo, servidor) {
    const r = await chrome.runtime.sendMessage({ tipo: 'avaliar', id: vid, resultado, motivo }).catch(() => null);
    if (r && r.ok) { avalLocal[vid] = resultado; avalAberto = ''; } else { msg = '!Não consegui marcar agora. ' + ((r && r.erro) || 'Tente de novo.'); }
    pintarAval(vid, servidor);
  }
  async function enviar(direto, auto) {
    if (chatPainel.id && chatAtual().id && chatAtual().id !== chatPainel.id) { msg = '!Você mudou de contato na Leona. Para não misturar as fotos, abra o Estúdio de novo no contato certo (#' + chatPainel.id + ').'; return desenhar(); }
    $('#corpo').querySelectorAll('.bgrid .go').forEach(b => { b.disabled = true; });
    $('#msg').className = 'msg'; $('#msg').textContent = 'Enviando ao Estúdio…';
    let r;
    const ped = pedido(direto);
    if (modoPronta) {   // app antigo não conhece "prévia já enviada" e geraria uma prévia nova (gasta crédito): confere a versão antes
      let v = 0; try { const pg = await chrome.runtime.sendMessage({ tipo: 'ping' }); const m = /^(\d+)\.(\d+)/.exec((pg && pg.dados && pg.dados.versao) || ''); if (m) v = +m[1] * 1000 + +m[2]; } catch (e) {}
      if (v < 8071) { msg = '!O aplicativo do Estúdio deste computador ainda é antigo para usar a prévia já enviada. Feche e abra o aplicativo (ele se atualiza sozinho) e tente de novo.'; return desenhar(); }
    }
    try { r = await chrome.runtime.sendMessage({ tipo: 'gerar', pedido: ped }); } catch (e) { r = { erro: String(e) }; }
    if (r && r.ok) { try { chrome.storage.local.set({ ['ped_' + r.id]: ped }); if (auto) chrome.storage.local.set({ ['auto_' + r.id]: direto ? 'video' : 'previa' }); } catch (e) {} limparRascunho(chatPainel.id || chatAtual().id); }
    if (!r || !r.ok) {
      msg = '!' + ((r && r.erro) || 'Não achei o Estúdio. Abra o aplicativo e confira a porta no ícone da extensão.');
      return desenhar();
    }
    msg = '';
    const ch = chatPainel.id || chatAtual().id;
    guardar(ch, r.id);
    acompanhar(r.id, ch);
  }

  // ---------- rascunho do menu por contato (fotos escolhidas, recortes, opções) ----------
  let rascunho = null, tRasc = null;
  const chaveRasc = ch => 'rasc_' + ch;
  async function lerRascunho(ch) { try { return (await chrome.storage.local.get(chaveRasc(ch)))[chaveRasc(ch)] || null; } catch (e) { return null; } }
  function limparRascunho(ch) { modoPronta = false; prontaSrc = ''; quemSobe = ''; marcas.clear(); marcasChat = ''; clearTimeout(tRasc); rascunho = null; try { chrome.storage.local.remove(chaveRasc(ch)); } catch (e) {} }
  function agendarRascunho() {
    if (!$('#veu').classList.contains('on') || !$('#gdireto')) return;   // só quando o menu está na tela (não no andamento)
    const ch = chatPainel.id || chatAtual().id; if (!ch) return;
    clearTimeout(tRasc);
    tRasc = setTimeout(() => {
      const algo = pessoas.some(p => p.foto || p.editada || p.animal || p.bebe || p.semcamisa || p.calca || p.vestido || p.papel) || ajuste.trim() || n > 1;
      if (!algo) { try { chrome.storage.local.remove(chaveRasc(ch)); } catch (e) {} return; }
      const dado = { t: Date.now(), n, juntos, jq, ajuste, mais, pessoas: pessoas.map(p => { const f = p.foto && fotosSel.find(x => x.id === p.foto); return { ...p, foto: null, busy: false, fotoSrc: f ? f.src : null }; }) };
      try { chrome.storage.local.set({ [chaveRasc(ch)]: dado }); } catch (e) {}
    }, 500);
  }
  function aplicarRascunho(final) {   // devolve ao menu o que estava sendo montado neste contato (as fotos são achadas pelo endereço)
    const r = rascunho; if (!r) return;
    if (!final && pessoas.some(p => p.foto)) return;
    setN(r.n || 1); juntos = !!r.juntos && n === 2; jq = r.jq || '2f'; ajuste = r.ajuste || ''; mais = !!r.mais;
    let faltou = false;
    pessoas = (r.pessoas || []).slice(0, n).map(q => {
      const f = q.fotoSrc ? fotosSel.find(x => x.src === q.fotoSrc) : null;
      if (q.fotoSrc && !f) faltou = true;
      const { fotoSrc, ...resto } = q;
      return { ...nova(), ...resto, foto: f ? f.id : null, edit: f ? resto.edit : null, editada: f ? resto.editada : null };
    });
    while (pessoas.length < n) pessoas.push(nova());
    const livre = pessoas.findIndex(p => !p.foto); ativa = livre >= 0 ? livre : 0;
    if (!faltou || final) rascunho = null;   // faltou foto: tenta de novo depois de buscar as antigas
  }

  // ---------- devolver ao chat de origem ----------
  let msgEnvio = '';
  const chaveChat = ch => 'leona_' + ch;
  // Cada chat guarda a lista das suas homenagens (a mais nova primeiro, até 20). O pedido em si fica no Estúdio.
  const chaveHist = ch => 'hist_' + ch;
  async function lerHist(ch) {
    try {
      const o = await chrome.storage.local.get([chaveHist(ch), chaveChat(ch)]);
      if (Array.isArray(o[chaveHist(ch)])) return o[chaveHist(ch)];
      return o[chaveChat(ch)] ? [{ id: o[chaveChat(ch)], t: Date.now() }] : [];   // formato antigo: um pedido só
    } catch (e) { return []; }
  }
  const guardar = async (ch, id) => {
    try {
      const h = (await lerHist(ch)).filter(x => x.id !== id); h.unshift({ id, t: Date.now() });
      await chrome.storage.local.set({ [chaveHist(ch)]: h.slice(0, 20) });
    } catch (e) {}
    vigiar(ch, id);
  };
  // ---- aviso no botão quando a prévia / o vídeo ficam prontos (mesmo com o menu fechado) ----
  const vigiar = (ch, id) => { vigia.set(ch, id); delete avisos[ch]; try { chrome.storage.local.remove('aviso_' + ch); } catch (e) {} };
  const limparAviso = ch => { if (avisos[ch]) { delete avisos[ch]; try { chrome.storage.local.remove('aviso_' + ch); } catch (e) {} } };
  (async function () {
    try {   // a chave do envio automático (padrão: ligada)
      autoEnvio = (await chrome.storage.local.get({ autoEnvio: true })).autoEnvio !== false;
      if ($('#gdireto')) desenhar();
    } catch (e) {}
    try {
      const todo = await chrome.storage.local.get(null);
      for (const [k, v] of Object.entries(todo)) {
        if (k.startsWith('hist_') && Array.isArray(v) && v[0] && Date.now() - v[0].t < 864e5 && !vigia.has(k.slice(5))) vigia.set(k.slice(5), v[0].id);
        if (k.startsWith('aviso_')) avisos[k.slice(6)] = v;
      }
    } catch (e) {}
    // ---- limpeza diária: apaga o que passou de 7 dias (pedidos guardados, rascunhos, avisos, históricos) para a memória do Tampermonkey não crescer ----
    try {
      const ULT = '__limpeza', VALE = 7 * 864e5, agora = Date.now();
      const feita = (await chrome.storage.local.get(ULT))[ULT] || 0;
      if (agora - feita > 864e5) {
        const todo = await chrome.storage.local.get(null), apagar = [], gravar = {};
        const idade = id => { const m = /^[a-z]?(\d{12,})$/.exec(String(id)); return m ? agora - Number(m[1]) : 0; };   // os números dos pedidos (l17954...) são a hora em milissegundos
        for (const [k, v] of Object.entries(todo)) {
          if (/^(ped_|auto_|lock_)/.test(k)) { if (idade(k.replace(/^[a-z]+_/, '')) > VALE) apagar.push(k); }
          else if (k.startsWith('hist_') && Array.isArray(v)) {
            const novos = v.filter(x => x && agora - (x.t || 0) < VALE);
            if (!novos.length) { apagar.push(k, 'aviso_' + k.slice(5)); } else if (novos.length !== v.length) gravar[k] = novos;
          } else if (k.startsWith('rasc_') && v && typeof v === 'object') {
            if (!v.t) gravar[k] = { ...v, t: agora };                 // rascunho antigo sem data: começa a contar agora
            else if (agora - v.t > VALE) apagar.push(k);
          }
        }
        gravar[ULT] = agora;
        await chrome.storage.local.set(gravar);
        if (apagar.length) await chrome.storage.local.remove([...new Set(apagar)]);
      }
    } catch (e) { console.warn('[Estúdio] limpeza da memória não rodou:', e); }
    const tentando = new Set();
    setInterval(async () => {
      for (const [ch, id] of [...vigia]) {
        let r; try { r = await chrome.runtime.sendMessage({ tipo: 'status', id }); } catch (e) { continue; }
        const d = r && r.dados; if (!d) continue;
        if (!d.id) { vigia.delete(ch); continue; }
        const pronta = !!(d.previa && (d.previa.estado === 'pronto' || d.previa.estado === 'pronta'));
        const videoPronto = d.direto !== false && !!(d.video && d.video.estado === 'pronto');
        // erro (prévia, vídeo, montagem...) não encerra a vigia nem apaga o envio automático: o editor pode clicar em "Tentar novamente" e o pedido novo vai sozinho ao cliente; só desiste depois de 3 h
        const velho = !!(d.inicio && Date.now() / 1000 - d.inicio > 3 * 3600);
        const erro = !!(velho && (d.erro || (d.previa && d.previa.estado === 'erro') || (d.video && d.video.estado === 'erro')));
        const vendo = $('#veu').classList.contains('on') && chatAtual().id === ch;
        let novo = videoPronto ? 'video' : pronta ? 'previa' : '';
        if (novo && !vendo && avisos[ch] !== novo && !(avisos[ch] === 'video')) { avisos[ch] = novo; try { chrome.storage.local.set({ ['aviso_' + ch]: novo }); } catch (e) {} }
        // envio automático ("... e enviar"): quando o arquivo escolhido fica pronto e o chat está aberto, vai sozinho para o cliente
        let alvo = ''; try { alvo = (await chrome.storage.local.get('auto_' + id))['auto_' + id] || ''; } catch (e) {}
        if (alvo) {
          const vidAv = d.video && d.video.id ? ((d.video.id in avalLocal) ? avalLocal[d.video.id] : (d.video.aval || '')) : '';
          const pronto = alvo === 'video' ? (videoPronto && (vidAv === 'certo' || d.perguntar_antes === false)) : pronta;   // o vídeo só vai sozinho depois que o editor marca "Deu certo"
          if (erro) { try { chrome.storage.local.remove('auto_' + id); } catch (e) {} vigia.delete(ch); continue; }
          if (pronto && !tentando.has(id)) {   // não precisa do chat aberto: o envio vai direto pela API da Leona
            tentando.add(id);
            let livre = true;   // outra aba da Leona aberta também vigia: só uma envia
            try { const lk = (await chrome.storage.local.get('lock_' + id))['lock_' + id]; if (lk && Date.now() - lk < 10 * 60 * 1000) livre = false; else await chrome.storage.local.set({ ['lock_' + id]: Date.now() }); } catch (e) {}
            if (livre) {
              try { chrome.storage.local.remove('auto_' + id); } catch (e) {}   // uma tentativa só: se falhar, o botão Enviar da tela continua valendo (nada é enviado duas vezes)
              if (!(d.entregas && d.entregas[alvo])) {
                entregasAtual = d.entregas || {};
                try { await devolver(id, ch, alvo, false, true); } catch (e) {}
                try { toast(msgEnvio.startsWith('!') ? msgEnvio.slice(1) : 'Chat #' + ch + ': ' + msgEnvio); } catch (e) {}
              }
              vigia.delete(ch);
            }
            tentando.delete(id);
          }
          continue;   // com envio automático pendente, continua vigiando até o chat abrir
        }
        if (videoPronto || erro || (d.direto === false && pronta)) vigia.delete(ch);
      }
    }, 4000);
  })();

  async function pegarArquivo(id, tipo) {
    const r = await chrome.runtime.sendMessage({ tipo: 'arquivo', id, arquivo: tipo });
    if (!r || !r.ok) throw new Error((r && r.erro) || 'Não consegui buscar o arquivo no Estúdio.');
    const bin = atob(r.b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], tipo === 'video' ? 'homenagem.mp4' : 'previa.png', { type: r.mime.split(';')[0] });
  }
  function acharInputArquivo(mime) {
    const casa = a => !a || a.split(',').some(x => { x = x.trim().toLowerCase(); return x === mime || x === mime.split('/')[0] + '/*' || x === '*/*' || (x[0] === '.' && mime.endsWith(x.slice(1))); });
    const lista = [...document.querySelectorAll('input[type=file]')].filter(i => !i.closest('#estudio-leona-raiz') && casa(i.getAttribute('accept')));
    return lista.find(i => i.getAttribute('accept')) || lista[0] || null;   // prefere o que declara o tipo
  }
  function acharCaixa() {
    const c = [...document.querySelectorAll('textarea, input[type=text], [contenteditable="true"], [role="textbox"]')]
      .filter(e => !e.closest('#estudio-leona-raiz') && e.getBoundingClientRect().height > 0 && /mensagem/i.test((e.getAttribute('placeholder') || '') + (e.getAttribute('aria-label') || '') + (e.getAttribute('data-placeholder') || '')));
    return c[c.length - 1] || null;
  }
  function anexar(file) {          // poe o arquivo no chat aberto (sem apertar enviar)
    const dt = new DataTransfer(); dt.items.add(file);
    const inp = acharInputArquivo(file.type);
    if (inp) {
      inp.files = dt.files;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return 'anexo';
    }
    const caixa = acharCaixa();
    if (caixa) {
      caixa.focus();
      caixa.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return 'colar';
    }
    return null;
  }
  function baixarArquivo(file) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  let autoEnviar = true, entregasAtual = {};
  try {
    chrome.storage.local.get({ autoEnviar: true }).then(c => { autoEnviar = c.autoEnviar !== false; });
    chrome.storage.onChanged.addListener(ch => { if (ch.autoEnviar) autoEnviar = ch.autoEnviar.newValue !== false; });
  } catch (e) {}

  const visivel = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  // Depois de anexar, a Leona mostra um botão "Enviar" (azul, h-10). Se não aparecer, tenta o botão de enviar da caixa de mensagem.
  async function apertarEnviar(chatId, limiteMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < limiteMs) {
      if (chatAtual().id !== chatId) return 'chat';   // trocou de chat no meio: não envia
      const botoes = [...document.querySelectorAll('button')].filter(b => !b.closest('#estudio-leona-raiz') && !b.disabled && visivel(b));
      const confirma = botoes.find(b => (b.textContent || '').trim() === 'Enviar');
      if (confirma) { confirma.click(); return 'ok'; }
      const caixa = botoes.find(b => b.type === 'submit' && /enviar/i.test(b.getAttribute('aria-label') || ''));
      if (caixa && Date.now() - t0 > 2500) { caixa.click(); return 'ok'; }   // reserva: só depois de esperar o botão da janela de anexo
      await esperar(250);
    }
    return 'nao';
  }

  const ocupado = d => { try { janelaPagina.__estudioOcupado = Math.max(0, (janelaPagina.__estudioOcupado || 0) + d); } catch (e) {} };   // o carregador não recarrega a Leona enquanto envia
  async function devolver(...a) { ocupado(1); try { return await devolverReal(...a); } finally { ocupado(-1); } }
  // Envio direto pela API da Leona (o mesmo que o clipe faz): sobe o arquivo e posta a mensagem no chat PELO NÚMERO, então funciona
  // com qualquer chat aberto (ou nenhum). O editor pode largar o pedido, ir para o próximo cliente, e a homenagem sai sozinha.
  const API_LEONA = 'https://apiaws.leonasolutions.io/api/v1';
  async function enviarPelaApi(chatId, file, tipo) {
    let tk = ''; try { tk = janelaPagina.localStorage.getItem('auth_token') || ''; } catch (e) {}
    if (!tk) throw new Error('Não achei o login da Leona nesta aba.');
    const aut = { Authorization: /^Bearer /i.test(tk) ? tk : 'Bearer ' + tk };
    const tp = tipo === 'video' ? 'video' : 'image';
    const fd = new FormData(); fd.append('file', file, file.name); fd.append('message_type', tp); fd.append('meta_cloud', '1');
    const up = await fetch(API_LEONA + '/media/upload', { method: 'POST', headers: aut, body: fd });
    if (!up.ok) throw new Error('A Leona recusou o arquivo (upload ' + up.status + ').');
    const u = await up.json().catch(() => null);
    if (!u || !u.url) throw new Error('A Leona não devolveu o endereço do arquivo.');
    const msg = await fetch(API_LEONA + '/chats/' + encodeURIComponent(chatId) + '/messages', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, aut),
      body: JSON.stringify({ message: { content: '', message_type: tp, media_url: u.url, caption: '', filename: u.filename || file.name, file_size: u.file_size || file.size, reply_to_message_id: null, is_reply: false } }),
    });
    if (!msg.ok) { let t = ''; try { t = (await msg.text()).slice(0, 160); } catch (e) {} throw new Error('A Leona recusou a mensagem (' + msg.status + '). ' + t); }
    return true;
  }
  // ---------- aviso direto ao Misael (WhatsApp pela Leona) ----------
  // O Estúdio guarda o aviso quando o Grok falha de um jeito que só o Misael resolve (a tela do Grok mudou). Esta aba (se a Leona estiver aberta) pega o aviso
  // e manda no chat de alertas pela API da Leona, igual ao envio da prévia. O servidor entrega cada aviso a uma aba só e no máximo 1 a cada 2 minutos.
  let alertaOcupado = false;
  async function alertasVerificar() {
    if (alertaOcupado) return; alertaOcupado = true;
    try {
      const r = await chrome.runtime.sendMessage({ tipo: 'alerta_pegar' }).catch(() => null);
      const a = r && r.dados; if (!a || !a.id || !a.chat) return;
      let ok = false;
      try {
        let tk = ''; try { tk = janelaPagina.localStorage.getItem('auth_token') || ''; } catch (e) {}
        if (!tk) throw new Error('sem login da Leona nesta aba');
        const aut = { Authorization: /^Bearer /i.test(tk) ? tk : 'Bearer ' + tk, 'Content-Type': 'application/json' };
        const msg = await fetch(API_LEONA + '/chats/' + encodeURIComponent(a.chat) + '/messages', { method: 'POST', headers: aut,
          body: JSON.stringify({ message: { content: a.texto, message_type: 'text', media_url: null, caption: '', reply_to_message_id: null, is_reply: false } }) });
        ok = msg.ok;
        if (!ok) { let t = ''; try { t = (await msg.text()).slice(0, 160); } catch (e) {} console.warn('[Estúdio] aviso ao Misael recusado pela Leona (' + msg.status + '): ' + t); }
      } catch (e) { console.warn('[Estúdio] aviso ao Misael não enviado:', e && e.message || e); }
      chrome.runtime.sendMessage({ tipo: 'alerta_enviado', id: a.id, ok });
    } finally { alertaOcupado = false; }
  }
  setTimeout(alertasVerificar, 20000); setInterval(alertasVerificar, 60000);
  // Depois de ENVIAR O VÍDEO ao cliente: dispara na Leona o fluxo de finalização (o mesmo de "Disparar fluxo" no chat). O id do fluxo vem do servidor
  // (config fluxo_leona_final); sem id, não faz nada. Uma vez só por pedido (um "Enviar de novo" do vídeo não dispara outra vez).
  // Plano B (e prova visual): clica no botão "Disparar fluxo" do chat aberto e no fluxo pelo NOME, igual ao editor faria. Só vale com o chat aberto.
  async function dispararFluxoPelaTela(nome) {
    const norm = t => (t || '').replace(/\s+/g, ' ').trim().toLowerCase(), alvo = norm(nome), dorme = ms => new Promise(r => setTimeout(r, ms));
    if (!alvo) return false;
    const clicar = el => { for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) { const C = t.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent; el.dispatchEvent(new C(t, { bubbles: true, cancelable: true, button: 0, view: janelaPagina })); } };
    const campo = () => [...document.querySelectorAll('input')].find(i => /nome do fluxo/i.test(i.getAttribute('placeholder') || '') && i.getBoundingClientRect().height > 0);   // só o campo VISÍVEL (lista aberta)
    if (!campo()) {
      const botao = [...document.querySelectorAll('button,[role=button]')].find(b => norm(b.getAttribute('title') || b.getAttribute('aria-label') || '') === 'disparar fluxo');
      if (!botao) return false;
      clicar(botao);
      for (let i = 0; i < 20 && !campo(); i++) await dorme(200);
    }
    const inp = campo(); if (!inp) return false;
    const ri = inp.getBoundingClientRect();
    let item = null;
    for (let i = 0; i < 25 && !item; i++) {
      item = [...document.querySelectorAll('body *')].filter(e => norm(e.textContent) === alvo && e.getBoundingClientRect().top >= ri.bottom - 4 && e.getBoundingClientRect().height > 0)
        .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;   // o menor elemento com exatamente esse nome, abaixo do campo de busca
      if (!item) await dorme(200);
    }
    if (!item) return false;
    clicar(item.closest('button,[role=option],[role=menuitem],li') || item);
    for (let i = 0; i < 20 && campo(); i++) await dorme(200);   // a lista fecha quando o fluxo é disparado
    return !campo();
  }
  async function dispararFluxoFinal(id, chatId) {
    const k = 'fluxo_' + id;
    if (/^aniv-/.test(casosPedido[id] || '')) return '';   // aniversário não dispara o fluxo "Finalização Homenagem" (é de falecidos)
    try {
      if ((await chrome.storage.local.get(k))[k]) return '';
      const c = await chrome.runtime.sendMessage({ tipo: 'leona_config' }).catch(() => null);
      const fluxo = c && c.dados && String(c.dados.fluxo_final || '').replace(/\D/g, ''); if (!fluxo) return '';
      const nomeFluxo = String((c && c.dados && c.dados.fluxo_nome) || '');
      const soChat = c && c.dados && String(c.dados.so_chat || '').replace(/\D/g, ''); if (soChat && String(chatId) !== soChat) return '';   // fase de teste: só nesse chat
      let tk = ''; try { tk = janelaPagina.localStorage.getItem('auth_token') || ''; } catch (e) {}
      if (!tk) return '';
      await chrome.storage.local.set({ [k]: Date.now() });
      const r = await fetch(API_LEONA + '/flows/' + fluxo + '/trigger', { method: 'POST',
        headers: { Authorization: /^Bearer /i.test(tk) ? tk : 'Bearer ' + tk, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: /^\d+$/.test(String(chatId)) ? Number(chatId) : chatId }) });
      if (r.ok) return ' Fluxo de finalização disparado.';
      if (chatAtual().id === String(chatId) && await dispararFluxoPelaTela(nomeFluxo)) return ' Fluxo de finalização disparado (pelo botão do chat).';   // plano B: clica no fluxo na tela
      try { chrome.storage.local.remove(k); } catch (e) {}   // não disparou: um novo envio pode tentar de novo
      let t = ''; try { t = (await r.text()).slice(0, 120); } catch (e) {}
      console.warn('[Estúdio] fluxo de finalização recusado (' + r.status + '): ' + t);
      return ' (O fluxo de finalização não disparou: ' + r.status + '. Dispare pelo chat.)';
    } catch (e) { console.warn('[Estúdio] fluxo de finalização:', e); return ''; }
  }
  async function devolverReal(id, chatId, tipo, soBaixar, forcar) {
    const nomeTipo = tipo === 'video' ? 'o vídeo' : 'a prévia';
    try {
      if (!soBaixar && (forcar || autoEnviar)) {   // envio automático: direto pela API, com qualquer chat aberto
        msgEnvio = 'Buscando ' + nomeTipo + ' no Estúdio…'; mostrarMsg();
        const file = await pegarArquivo(id, tipo);
        try {
          msgEnvio = 'Enviando ' + nomeTipo + ' ao cliente…'; mostrarMsg();
          await enviarPelaApi(chatId, file, tipo);
          const jaTinha = !!(entregasAtual && entregasAtual[tipo]);
          chrome.runtime.sendMessage({ tipo: 'entregue', id, arquivo: tipo }); msgEnvio = 'Enviei ' + nomeTipo + ' ao cliente.';
          if (tipo === 'video' && !jaTinha) { msgEnvio += await dispararFluxoFinal(id, chatId); }
          return;
        } catch (e) {
          if (chatAtual().id !== chatId) { msgEnvio = '!Não consegui enviar ' + nomeTipo + ' ao chat #' + chatId + ': ' + (e && e.message || e) + ' Abra esse chat e use o botão Enviar.'; return; }
          console.warn('[Estúdio] envio direto falhou, tentando pela tela:', e);   // chat aberto: tenta pelo jeito antigo
        }
      }
      if (!soBaixar && chatAtual().id !== chatId) { msgEnvio = '!Este pedido é do chat #' + chatId + '. Abra esse chat para colocar ' + nomeTipo + ' nele.'; return; }
      msgEnvio = 'Buscando ' + nomeTipo + ' no Estúdio…'; mostrarMsg();
      const file = await pegarArquivo(id, tipo);
      if (soBaixar) { baixarArquivo(file); msgEnvio = 'Arquivo baixado.'; return; }
      if (false) { msgEnvio = 'Cancelado: nada foi enviado.'; return; }
      const como = anexar(file);
      if (!como) { baixarArquivo(file); msgEnvio = '!Não achei onde anexar nesta tela da Leona. Baixei o arquivo: anexe pelo clipe.'; return; }
      if (!autoEnviar && !forcar) {
        chrome.runtime.sendMessage({ tipo: 'entregue', id, arquivo: tipo });
        msgEnvio = 'Coloquei ' + nomeTipo + ' no chat. Confira e aperte enviar.'; return;
      }
      msgEnvio = 'Anexado. Apertando enviar…'; mostrarMsg();
      const res = await apertarEnviar(chatId, tipo === 'video' ? 25000 : 12000);
      if (res === 'ok') { const jaTinha = !!(entregasAtual && entregasAtual[tipo]); chrome.runtime.sendMessage({ tipo: 'entregue', id, arquivo: tipo }); msgEnvio = 'Enviei ' + nomeTipo + ' ao cliente.'; if (tipo === 'video' && !jaTinha) msgEnvio += await dispararFluxoFinal(id, chatId); }
      else if (res === 'chat') msgEnvio = '!Você trocou de chat antes de enviar. Nada foi enviado ao cliente errado; volte ao chat #' + chatId + ' e tente de novo.';
      else msgEnvio = '!Anexei ' + nomeTipo + ', mas não achei o botão Enviar. Aperte você.';
    } catch (e) {
      msgEnvio = '!' + (e && e.message || e);
    } finally { mostrarMsg(); }
  }
  function mostrarMsg() {
    const el = $('#msgenv'); if (!el) return;
    el.className = 'aviso' + (msgEnvio.startsWith('!') ? ' bad' : ''); el.textContent = msgEnvio.replace(/^!/, '');
  }

  // ---------- andamento: a tela de detalhe do Estúdio, adaptada à extensão ----------
  let cronAtual = null;
  const casosPedido = {};   // pedido -> caso (o fluxo final da Leona é só de falecidos)
  const previas = {};   // pedido -> { previa, video, orig: [urls] } (buscados uma vez só, para o vídeo não reiniciar)
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const legenda = (c, juntos) => {
    if (!c) return '';
    if (c === '1p') return '1 pessoa';
    if (/^aniv-/.test(c)) return 'Aniversário · 1 pessoa';
    const l = c.includes('-') ? c.split('-')[1] : ({ '2f': 'ff', '1f2v': 'fv', '1v2f': 'vf' })[c];
    if (!l) return c;
    return l.split('').map((x, i) => 'Pessoa ' + (i + 1) + (x === 'f' ? ' faleceu' : ' viva')).join(' · ') + (juntos ? ' · mesma foto' : '');
  };
  function acompanhar(id, chatId) {
    clearInterval(relogio);
    previas[id] = previas[id] || {};
    const nomeChat = chatAtual().nome;
    $('#corpo').innerHTML = `<div class="andam">
      <div class="dh"><h3 id="d-nome">Homenagem</h3><select id="d-hist" hidden aria-label="Homenagens deste chat" title="Homenagens deste chat"></select><small id="d-sub">Chat #${esc(chatId)}${nomeChat ? ' · ' + esc(nomeChat) : ''}</small><button class="bt" id="novo">Nova homenagem neste chat</button></div>
      <div class="cols">
        <section class="col"><div class="ct"><span>1 · Original e refazer</span></div>
          <div class="cartao" id="c-orig"><div class="espera">Abrindo as fotos…</div></div>
          <div id="jqs" class="jqs-l"></div>
          <div class="aj"><label for="r-aj">Quer mudar algo?</label><input id="r-aj" maxlength="300" placeholder="Ex.: trocar a roupa, tirar o copo da mão"></div>
          <div class="lin2"><button class="gr" id="r-direto">Gerar homenagem</button><button class="gr sec" id="r-previa">Só a prévia</button></div>
          <div class="stt" id="r-msg"></div></section>
        <section class="col"><div class="ct"><span>2 · Prévia · cliente</span><span id="p-pill"></span></div>
          <div class="cartao" id="c-previa"></div>
          <div class="lin2"><button class="gr" id="e-previa" disabled>Enviar prévia ao cliente</button><button class="gr sec ic" id="f-previa" title="Tela cheia" aria-label="Tela cheia" disabled>${IC.telaCheia}</button><button class="gr sec ic" id="b-previa" title="Baixar a prévia" aria-label="Baixar" disabled>${IC.baixar}</button></div>
          <div class="stt" id="s-previa"></div></section>
        <section class="col"><div class="ct"><span id="v-tit">3 · Vídeo</span><span id="v-pill"></span></div>
          <div class="cartao" id="c-video"></div>
          <div class="lin2"><button class="gr" id="e-video" disabled>Enviar vídeo ao cliente</button><button class="gr sec ic" id="f-video" title="Tela cheia" aria-label="Tela cheia" disabled>${IC.telaCheia}</button><button class="gr sec ic" id="b-video" title="Baixar o vídeo" aria-label="Baixar" disabled>${IC.baixar}</button></div>
          <div class="stt" id="s-video"></div></section>
      </div>
      <div class="rodape"><div id="erro"></div><div class="dicac" id="dicaenv"></div><div id="msgenv" class="aviso"></div></div></div>`;
    $('#novo').onclick = () => { clearInterval(relogio); abrir(true); };
    limparAviso(chatId);
    let autoDe = ''; chrome.storage.local.get('auto_' + id).then(o => { autoDe = o['auto_' + id] || ''; }).catch(() => {});
    (async () => {   // lista das homenagens deste chat, com o nome de cada uma
      const h = await lerHist(chatId), sel = $('#d-hist'); if (!sel || h.length < 2) return;
      const hh = t => { const d = new Date(t); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
      sel.hidden = false;
      sel.innerHTML = h.map(x => `<option value="${esc(x.id)}" ${x.id === id ? 'selected' : ''}>Homenagem · ${hh(x.t)}</option>`).join('');
      sel.onchange = () => { clearInterval(relogio); acompanhar(sel.value, chatId); };
      for (const x of h.slice(0, 12)) {   // troca o texto pelo nome do Estúdio (M - Homenagem 21)
        try { const r = await chrome.runtime.sendMessage({ tipo: 'status', id: x.id }); const d = r && r.dados, o = [...sel.options].find(q => q.value === x.id);
          if (o) o.textContent = (d && d.id ? ((d.previa && d.previa.rotulo) || 'Homenagem') : 'Homenagem apagada') + ' · ' + hh(x.t); } catch (e) {}
      }
    })();
    let ultimaPintura = null, dados = null, jqRef = null;
    const buscar = async (tipo, n) => {
      const ch = tipo === 'original' ? 'orig' + n : tipo;
      if (previas[id][ch] !== undefined) return;
      previas[id][ch] = null;
      try { const r = await chrome.runtime.sendMessage({ tipo: 'arquivo', id, arquivo: tipo, n });
        if (r && r.ok) { const bin = atob(r.b64), by = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) by[i] = bin.charCodeAt(i);
          previas[id][ch] = URL.createObjectURL(new Blob([by], { type: String(r.mime).split(';')[0] })); delete previas[id]['err_' + ch]; }
        else { previas[id][ch] = ''; previas[id]['err_' + ch] = (r && r.erro) || 'O Estúdio não respondeu.'; } } catch (e) { previas[id][ch] = ''; previas[id]['err_' + ch] = String((e && e.message) || e); }
      if (previas[id][ch] === '') { const n2 = (previas[id]['n_' + ch] = (previas[id]['n_' + ch] || 0) + 1); if (n2 < 40) setTimeout(() => { if (previas[id] && previas[id][ch] === '') delete previas[id][ch]; }, 4000); }   // falhou: tenta de novo a cada 4 s (antes ficava "Abrindo…" para sempre)
      ultimaPintura && ultimaPintura();
    };
    const tela = (el, id2) => { const e = $(id2); if (e && e.requestFullscreen) e.requestFullscreen().catch(() => {}); };
    const pinta = async () => {
      let r;
      try { r = await chrome.runtime.sendMessage({ tipo: 'status', id }); } catch (e) { return; }
      const d = r && r.dados; if (!d) return;
      if (!d.id) {   // o Estúdio não tem mais este pedido (os arquivos de mais de 7 dias são apagados)
        clearInterval(relogio);
        $('#c-previa').innerHTML = $('#c-video').innerHTML = '<div class="espera erro" style="color:#8e8e9a">Esta homenagem não existe mais no Estúdio.<br>Os arquivos são apagados depois de 7 dias.</div>';
        $('#c-orig').innerHTML = '';
        return;
      }
      dados = d; casosPedido[id] = d.caso || '';
      entregasAtual = d.entregas || {};
      const direto = d.direto !== false, ent = d.entregas || {};
      const pronta = !!(d.previa && (d.previa.estado === 'pronto' || d.previa.estado === 'pronta'));
      const videoPronto = !!(direto && d.video && d.video.estado === 'pronto');
      const erro = d.estado === 'duplicado' && !d.previa ? '' : (d.erro || (d.previa && d.previa.erro) || (d.video && d.video.erro) || '');   // "duplicado" não é erro: é uma pergunta com botões, e a consulta continua
      if (pronta) buscar('previa');
      if (videoPronto) buscar('video');
      for (let k = 0; k < (d.fotos || 0); k++) buscar('original', k);
      if (!jqRef) jqRef = d.caso;
      ultimaPintura = () => {
        const agora = Date.now(), ini = ultimaPintura.ini = ultimaPintura.ini || {};
        // o tempo conta desde a hora em que o Estúdio criou o pedido (vem do servidor), não desde que esta tela abriu
        const cron = (k, desde) => { if (desde) return mmss(agora - desde * 1000); if (!ini[k]) ini[k] = agora; return mmss(agora - ini[k]); };
        const hora = t => (t || '').slice(-8, -3);
        // título
        const nome = (d.previa && d.previa.rotulo) || 'Homenagem';
        if ($('#d-nome').textContent !== nome) $('#d-nome').textContent = nome;
        const sub = [legenda(d.caso, d.juntos), d.previa && d.previa.criado ? d.previa.criado.slice(0, 11) : ''].filter(Boolean).join(' · ') || ('Chat #' + chatId);
        if ($('#d-sub').textContent !== sub) $('#d-sub').textContent = sub;
        // 1 · original
        const fotos = []; for (let k = 0; k < (d.fotos || 0); k++) fotos.push(previas[id]['orig' + k]);
        const sigO = fotos.join('|');
        if ($('#c-orig').dataset.sig !== sigO) { $('#c-orig').dataset.sig = sigO;
          $('#c-orig').innerHTML = fotos.some(Boolean) ? `<div class="orig">${fotos.filter(Boolean).map(u => `<img src="${u}" alt="">`).join('')}</div>` : '<div class="espera">Abrindo as fotos…</div>'; }
        // refazer: só para quem tem o pedido guardado neste computador
        if (d.juntos && !$('#jqs').dataset.ok) { $('#jqs').dataset.ok = '1';
          $('#jqs').innerHTML = `<div class="jqs">${['1f2v', '1v2f', '2f'].map(q => `<button data-jq="${q}" class="${q === jqRef ? 'on' : ''}">${NOMEJQ[q]}</button>`).join('')}</div>`;
          $('#jqs').querySelectorAll('[data-jq]').forEach(b => b.onclick = () => { jqRef = b.dataset.jq; $('#jqs').querySelectorAll('[data-jq]').forEach(x => x.classList.toggle('on', x === b)); }); }
        // 2 · prévia
        const erroPed = !d.previa && d.estado === 'erro';   // o pedido nem chegou a virar prévia (foto não baixou, texto vazio, pedido repetido...): mostra o motivo em vez de girar para sempre
        const demora = !d.previa && d.inicio && (Date.now() / 1000 - d.inicio) > 45;
        const msgEspera = d.previa ? 'Gerando a prévia…'
          : ({ baixando: 'Baixando as fotos do chat…', novo: 'Esperando o aplicativo do Estúdio pegar o pedido…', enviado: 'Pedindo a prévia ao gerador…' })[d.estado] || 'Enviando as fotos ao Estúdio…';
        const dupPed = !d.previa && d.estado === 'duplicado';   // mesmas fotos pedidas há menos de 2 min: a pergunta "Pedir de novo?" aparece aqui, com botões
        const pe = !d.previa ? (erroPed ? 'erro' : 'agora') : pronta ? 'ok' : d.previa.estado === 'erro' ? 'erro' : 'agora';
        const pp = pe === 'ok' ? 'Pronto' : pe === 'erro' ? 'Erro' : (d.previa && d.previa.estado === 'fila') ? 'Na fila' : d.previa ? 'Gerando' : 'Enviando';
        $('#p-pill').innerHTML = `<span class="pill ${pe}">${pp}</span>`;
        const cp = $('#c-previa'), up = previas[id].previa;
        const sigP = pronta ? 'img|' + up + '|' + (previas[id].err_previa || '') : pe + '|' + (d.previa ? d.previa.estado : 'x' + (d.estado || '') + (demora ? 'd' : '') + (erroPed ? d.erro : '')) + '|' + (pe === 'agora' && !dupPed ? cron('previa', d.previa ? d.previa.inicio : d.inicio) : '');
        if (cp.dataset.sig !== sigP) { cp.dataset.sig = sigP;
          cp.innerHTML = pronta && up ? `<img id="im-previa" src="${up}" alt="Prévia">`
            : pronta ? '<div class="espera">' + (previas[id].err_previa ? 'Não consegui abrir a prévia: ' + esc(previas[id].err_previa) + '<br><small>Tentando de novo…</small>' : 'Abrindo a prévia…') + '</div>'
            : dupPed ? `<div class="espera"><b style="font-size:15px">Esse pedido já foi feito agora há pouco.</b><span>Pedir de novo mesmo assim?</span><div style="display:flex;gap:8px;margin-top:10px;justify-content:center"><button class="tb on" data-rep="sim">Pedir de novo</button><button class="tb" data-rep="nao">Cancelar</button></div></div>`
            : erroPed ? `<div class="espera erro">${esc(d.erro || 'Não consegui preparar o pedido.')}<br>Use "Gerar homenagem" ao lado para tentar de novo.</div>`
            : pe === 'erro' ? `<div class="espera erro">A prévia deu erro.</div>`
            : `<div class="espera"><i class="gira"></i><b>${cron('previa', d.previa ? d.previa.inicio : d.inicio)}</b>${msgEspera}${demora && !d.previa ? '<br><small>Está demorando. Confira se o aplicativo do Estúdio está aberto e com a conta entrada.</small>' : ''}</div>`; }
        cp.querySelectorAll('[data-rep]').forEach(b => b.onclick = async () => {   // "Pedir de novo" / "Cancelar" (o Estúdio avisou que o pedido é repetido)
          cp.querySelectorAll('[data-rep]').forEach(x => { x.disabled = true; });
          const r = await chrome.runtime.sendMessage({ tipo: 'repetir', id, cancelar: b.dataset.rep === 'nao' }).catch(() => null);
          if (!r || !r.ok) cp.querySelectorAll('[data-rep]').forEach(x => { x.disabled = false; });
          else cp.dataset.sig = '';   // redesenha já com o novo estado
        });
        $('#e-previa').disabled = !pronta; $('#f-previa').disabled = !(pronta && up); $('#b-previa').disabled = !pronta;
        $('#e-previa').textContent = ent.previa ? 'Enviar a prévia de novo' : 'Enviar prévia ao cliente';
        $('#s-previa').className = 'stt' + (ent.previa ? ' ok' : ''); $('#s-previa').innerHTML = ent.previa ? IC.check + ' enviada ao cliente às ' + esc(hora(ent.previa)) : '';
        // 3 · vídeo
        const cv = $('#c-video');
        $('#v-tit').textContent = '3 · Vídeo' + (d.video && d.video.criado ? ' · ' + d.video.criado.slice(0, 11) : '');
        if (!direto) { $('#v-pill').innerHTML = ''; cv.dataset.sig = 'nv'; cv.innerHTML = '<div class="espera">Este pedido é só da prévia.<br>Para o vídeo, use "Gerar homenagem" ao lado.</div>'; }
        else {
          const ve = !d.video ? 'espera' : videoPronto ? 'ok' : d.video.estado === 'erro' ? 'erro' : 'agora';
          $('#v-pill').innerHTML = ve === 'espera' ? '' : `<span class="pill ${ve}">${ve === 'ok' ? 'Pronto' : ve === 'erro' ? 'Erro' : d.video.estado === 'fila' ? 'Na fila' : 'Gerando'}</span>`;
          const uv = previas[id].video;
          const sigV = videoPronto ? 'vid|' + uv : ve + '|' + (ve === 'agora' ? cron('video', d.video.inicio) : '');
          if (cv.dataset.sig !== sigV) { cv.dataset.sig = sigV;
            cv.innerHTML = videoPronto && uv ? `<video id="im-video" src="${uv}" controls muted loop playsinline autoplay></video>`
              : videoPronto ? '<div class="espera">Abrindo o vídeo…</div>'
              : ve === 'erro' ? '<div class="espera erro">O vídeo deu erro.</div>'
              : ve === 'agora' ? `<div class="espera"><i class="gira"></i><b>${cron('video', d.video.inicio)}</b>Gerando o vídeo…</div>`
              : '<div class="espera">O vídeo começa quando a prévia ficar pronta.</div>'; }
          $('#e-video').disabled = !videoPronto; $('#f-video').disabled = !(videoPronto && uv); $('#b-video').disabled = !videoPronto;
          $('#e-video').textContent = ent.video ? 'Enviar o vídeo de novo' : 'Enviar vídeo ao cliente';
          $('#s-video').className = 'stt' + (ent.video ? ' ok' : ''); $('#s-video').innerHTML = (ent.video ? '<span class="env">' + IC.check + ' Enviado ao cliente às ' + esc(hora(ent.video)) + '</span>' : '') + (videoPronto && d.video && d.video.id ? '<span class="avc" id="avc"></span>' : '');
          if (videoPronto && d.video && d.video.id) { ultimoVideo = { id: d.video.id, aval: d.video.aval || '', perguntar: d.perguntar_antes !== false }; pintarAval(d.video.id, d.video.aval || ''); }
        }
        if (!direto) { $('#e-video').disabled = true; $('#f-video').disabled = true; $('#b-video').disabled = true; }
        $('#erro').innerHTML = erro ? `<div class="erro">${esc(erro)}</div>` : '';
        $('#dicaenv').textContent = (autoDe && !ent[autoDe]) ? 'Envio automático ligado: ' + (autoDe === 'video' ? 'o vídeo' : 'a prévia') + (autoDe === 'video' && ultimoVideo.perguntar ? ' vai ao cliente depois que você marcar "Deu certo"' : ' vai ao cliente sozinho quando ficar pronta') + '.' : (pronta || videoPronto) ? (autoEnviar ? 'Ao clicar em Enviar, o arquivo vai direto para o chat de origem, mesmo que você esteja em outro.' : 'O arquivo é colocado no chat de origem; você confere e aperta enviar.') : '';
        mostrarMsg();
      };
      ultimaPintura();
      // erro (prévia, vídeo, montagem...) não encerra a consulta: o editor pode clicar em "Tentar novamente" / "Refazer" no Estúdio e o pedido novo precisa aparecer aqui. Só desiste depois de 3 h.
      const velhoTela = !!(d.inicio && Date.now() / 1000 - d.inicio > 3 * 3600);
      if (videoPronto || (!direto && pronta) || (erro && velhoTela)) clearInterval(relogio);
    };
    $('#e-previa').onclick = () => devolver(id, chatId, 'previa', false);
    $('#b-previa').onclick = () => devolver(id, chatId, 'previa', true);
    $('#f-previa').onclick = () => tela(null, '#im-previa');
    $('#e-video').onclick = async () => { if (await confirmarVideo()) devolver(id, chatId, 'video', false); };
    $('#b-video').onclick = () => devolver(id, chatId, 'video', true);
    $('#f-video').onclick = () => tela(null, '#im-video');
    // refazer: manda o mesmo pedido de novo (com o caso escolhido, na foto única), igual aos botões da primeira coluna do Estúdio
    const refazer = async direto => {
      const m = $('#r-msg'); m.className = 'stt';
      if (chatAtual().id !== chatId) { m.className = 'stt bad'; m.textContent = 'Abra o chat #' + chatId + ' para refazer.'; return; }
      let g; try { const k = 'ped_' + id; g = (await chrome.storage.local.get(k))[k]; } catch (e) {}
      if (!g) { m.className = 'stt bad'; m.textContent = 'Este pedido é antigo: use "Nova homenagem neste chat".'; return; }
      const ped = JSON.parse(JSON.stringify(g)); ped.opcoes = ped.opcoes || {}; ped.opcoes.direto = direto;
      const aj2 = (($('#r-aj') || {}).value || '').trim(); if (aj2) ped.opcoes.ajuste = aj2;   // o que o editor escreveu em "Quer mudar algo?" entra na nova prévia/vídeo
      ped.refazer_de = id;   // é a MESMA homenagem (mesmo cliente): o Estúdio mantém o nome e não conta como pedido novo
      if (ped.juntos && jqRef) ped.caso = jqRef;
      m.textContent = 'Enviando ao Estúdio…';
      let r; try { r = await chrome.runtime.sendMessage({ tipo: 'gerar', pedido: ped }); } catch (e) { r = { erro: String(e) }; }
      if (!r || !r.ok) { m.className = 'stt bad'; m.textContent = (r && r.erro) || 'Não achei o Estúdio.'; return; }
      try { chrome.storage.local.set({ ['ped_' + r.id]: ped }); if (autoEnvio) chrome.storage.local.set({ ['auto_' + r.id]: direto ? 'video' : 'previa' }); } catch (e) {}   // com a chave do envio automático ligada, refazer também envia sozinho
      guardar(chatId, r.id); acompanhar(r.id, chatId);
    };
    $('#r-direto').onclick = () => refazer(true);
    $('#r-previa').onclick = () => refazer(false);
    pinta(); relogio = setInterval(pinta, 3000);
    clearInterval(cronAtual);
    const cron = cronAtual = setInterval(() => { if (!$('#d-nome')) return clearInterval(cron); if (ultimaPintura && dados) ultimaPintura(); }, 1000);
  }

  async function abrir(novo) {
    clearInterval(relogio);
    for (let i = 0; i < 14; i++) { lembrar(); if (Date.now() - chatDesde >= ESTAVEL_MS) break; await esperar(200); }   // acabou de trocar de contato: espera a Leona terminar de redesenhar
    chatPainel = chatAtual();
    fotosSel = lerFotos();
    pessoas = []; aniv = false; juntos = false; jq = '2f'; ativa = 0; mais = false; ajuste = ''; msg = ''; msgEnvio = ''; if (ed) fecharEditor();
    setN(1);
    $('#veu').classList.add('on');
    const ch = chatPainel.id;
    limparAviso(ch);
    if (novo !== true && ch) {   // ja tem homenagem pedida deste chat: mostra o andamento (e os botoes de enviar)
      try {
        const h = await lerHist(ch);
        if (h.length) return acompanhar(h[0].id, ch);
      } catch (e) {}
    }
    rascunho = await lerRascunho(ch); aplicarRascunho(false);
    desenhar();
    if (ch && !completo.has(ch)) buscaFundo(ch);   // segundo plano: continua até acabar as mensagens antigas
  }
  btn.onclick = () => abrir();
  // o ícone da extensão pergunta aqui se o script está vivo nesta aba
  try {
    chrome.runtime.onMessage.addListener((m, _r, responder) => {
      if (m && m.tipo === 'ola') responder({ ok: true, noCabecalho: !!acharTraduzir(), fotos: lerFotos().length, chat: chatAtual().id, botaoNaPagina: document.contains(btn) });
    });
  } catch (e) {}
  // ---------- menu das fotos do chat (as setinhas ao lado da foto): "Marcar como P1 / P2 / P3 / P4" ----------
  const toastEl = document.createElement('div'); toastEl.className = 'toast'; sombra.appendChild(toastEl);
  let toastT = null;
  function toast(texto) { toastEl.textContent = texto; toastEl.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.style.display = 'none'; }, 3200); }

  async function carregarMarcas() {
    try {
      const ch = chatAtual().id; marcasChat = ch; marcas = new Map();
      if (!ch) return;
      const d = await lerRascunho(ch);
      if (d && Array.isArray(d.pessoas)) {
        d.pessoas.forEach((q, i) => { if (q && q.fotoSrc) { const l = marcas.get(q.fotoSrc) || []; l.push('P' + (i + 1)); marcas.set(q.fotoSrc, l); } });
        if (d.juntos && d.n === 2) marcas.forEach((l, k) => marcas.set(k, ['Mesma foto']));
      }
      pintarMarcas();
    } catch (e) {}
  }
  function pintarMarcas() {   // carimbo azul no canto da foto: "P1", "P2"...
    const ch = chatAtual().id;
    if (ch !== marcasChat) { marcasChat = ch; carregarMarcas(); return; }
    document.querySelectorAll('[data-message-id].justify-start img').forEach(img => {
      if (img.closest('[role="button"]') || img.closest('#estudio-leona-raiz')) return;
      const src = img.currentSrc || img.src, pai = img.parentElement; if (!pai) return;
      const lista = marcas.get(src), atual = pai.querySelector(':scope > [data-estudio-marca]');
      if (!lista) { if (atual) atual.remove(); return; }
      const texto = lista.join(' + ');
      if (atual) { if (atual.textContent !== texto) atual.textContent = texto; return; }
      if (getComputedStyle(pai).position === 'static') pai.style.position = 'relative';
      const c = document.createElement('span'); c.setAttribute('data-estudio-marca', '1'); c.textContent = texto;
      c.style.cssText = 'position:absolute;top:4px;left:4px;background:#4c8dff;color:#fff;font:700 11px/1 system-ui,sans-serif;padding:3px 7px;border-radius:6px;pointer-events:none;box-shadow:0 1px 4px #0006';
      pai.appendChild(c);
    });
  }
  async function marcarFoto(src, k) {   // k = 1..4 (a pessoa); com o painel fechado grava no rascunho do chat
    const ch = chatAtual().id; if (!ch) return;
    lembrar();
    if ($('#veu').classList.contains('on') && $('#gdireto')) {   // o menu do Estúdio está aberto: aplica direto
      fotosSel = lerFotos(); const f = fotosSel.find(x => x.src === src); if (!f) return;
      setN(Math.max(n, k)); pessoas[k - 1].foto = f.id; pessoas[k - 1].edit = null; pessoas[k - 1].editada = null; desenhar();
    } else {
      const d = (await lerRascunho(ch)) || { n: 1, juntos: false, jq: '2f', ajuste: '', mais: false, pessoas: [] };
      d.n = Math.max(d.n || 1, k); if (d.n !== 2) d.juntos = false;
      while (d.pessoas.length < d.n) d.pessoas.push({ ...nova(), fotoSrc: null });
      d.pessoas[k - 1] = { ...d.pessoas[k - 1], foto: null, fotoSrc: src, edit: null, editada: null, busy: false };
      await chrome.storage.local.set({ [chaveRasc(ch)]: d });
      rascunho = d;
    }
    await carregarMarcas();
    toast('Foto marcada como P' + k + '. Abra o Estúdio (estrela) para continuar.');
  }
  async function soltarFoto(src) {
    const ch = chatAtual().id; if (!ch) return;
    const d = await lerRascunho(ch); if (!d) return;
    d.pessoas.forEach(q => { if (q && q.fotoSrc === src) { q.fotoSrc = null; q.edit = null; q.editada = null; } });
    await chrome.storage.local.set({ [chaveRasc(ch)]: d });
    rascunho = d; await carregarMarcas(); toast('Marca tirada da foto.');
  }
  function fecharMenuLeona() {
    for (const t of ['pointerdown', 'mousedown', 'mouseup', 'click']) document.body.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: 2, clientY: 2 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  let ultimaSeta = null;   // a mensagem cuja seta ("Mais opções") foi clicada por último
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('button[title="Mais opções"]');
    if (b) ultimaSeta = b.closest('[data-message-id]');
  }, true);
  function tratarMenu(no) {
    if (no.nodeType !== 1) return;
    const cands = no.matches && no.matches('div.fixed') ? [no] : [...no.querySelectorAll('div.fixed')];
    for (const menu of cands) {
      if (menu.dataset.estudio || menu.closest('#estudio-leona-raiz')) continue;
      const botoes = [...menu.querySelectorAll('button')];
      const enc = botoes.find(b => /^\s*Encaminhar\s*$/.test(b.textContent || ''));
      if (!enc || !botoes.some(b => /^\s*Baixar\s*$/.test(b.textContent || ''))) continue;
      menu.dataset.estudio = '1';
      const msg = menu.closest('[data-message-id]') || (menu.parentElement && menu.parentElement.closest('[data-message-id]')) || ultimaSeta;
      if (!msg || !msg.classList.contains('justify-start')) continue;   // só fotos que o cliente mandou
      const img = [...msg.querySelectorAll('img')].find(i => !i.closest('[role="button"]') && !i.closest('#estudio-leona-raiz'));
      if (!img) continue;
      const src = img.currentSrc || img.src; if (!/^https:/.test(src)) continue;
      const lista = marcas.get(src) || [];
      const sec = document.createElement('div'); sec.className = 'border-b border-border-default px-3 py-2'; sec.setAttribute('data-estudio-menu', '1');
      sec.style.cssText = 'display:flex;align-items:center;gap:10px';
      const rot = document.createElement('div'); rot.className = 'text-sm text-text-secondary';
      rot.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;white-space:nowrap';
      rot.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + OURO + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex:none" aria-hidden="true">' + ESTRELA + '</svg><span>Marcar como</span>';
      const grade = document.createElement('div'); grade.style.cssText = 'display:flex;gap:4px';
      for (let k = 1; k <= 4; k++) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = 'P' + k;
        b.title = 'Usar esta foto na pessoa ' + k + ' do Estúdio';
        b.style.cssText = 'height:30px;min-width:34px;padding:0 6px;display:flex;align-items:center;justify-content:center';
        b.className = 'rounded text-sm font-semibold leading-none transition-colors cursor-pointer ' + (lista.includes('P' + k) ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface-interactive');
        b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fecharMenuLeona(); marcarFoto(src, k); });
        grade.appendChild(b);
      }
      sec.append(rot, grade);
      if (lista.length) {
        const t = document.createElement('button'); t.type = 'button';
        t.className = 'w-full px-3 py-2 flex items-center gap-2.5 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-surface-interactive transition-colors cursor-pointer';
        t.innerHTML = '<span>Tirar a marca do Estúdio</span>';
        t.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fecharMenuLeona(); soltarFoto(src); });
        menu.insertBefore(sec, menu.firstChild); sec.after(t);
      } else menu.insertBefore(sec, menu.firstChild);
    }
  }
  new MutationObserver(muts => { for (const m of muts) for (const no of m.addedNodes) { try { tratarMenu(no); } catch (e) {} } }).observe(document.body, { childList: true, subtree: true });

  // largura do painel: arraste a borda azul da esquerda (o tamanho fica guardado; duplo clique volta ao padrão)
  (function () {
    const gav = sombra.querySelector('.gav'), alca = $('#alca'); if (!gav || !alca) return;
    const larguraTela = () => document.documentElement.clientWidth || window.innerWidth;
    const aplicar = w => { if (w) gav.style.setProperty('--larg', Math.max(640, Math.min(larguraTela(), Math.round(w))) + 'px'); else gav.style.removeProperty('--larg'); };
    chrome.storage.local.get({ largPainel: 0 }).then(c => aplicar(c.largPainel)).catch(() => {});
    alca.addEventListener('pointerdown', e => { try { alca.setPointerCapture(e.pointerId); } catch (x) {} alca.classList.add('arr'); e.preventDefault(); });
    alca.addEventListener('pointermove', e => { if (alca.classList.contains('arr')) aplicar(larguraTela() - e.clientX); });
    const solta = e => { if (!alca.classList.contains('arr')) return; alca.classList.remove('arr'); try { alca.releasePointerCapture(e.pointerId); } catch (x) {} try { chrome.storage.local.set({ largPainel: Math.round(gav.getBoundingClientRect().width) }); } catch (x) {} };
    alca.addEventListener('pointerup', solta); alca.addEventListener('pointercancel', solta);
    alca.addEventListener('dblclick', () => { aplicar(0); try { chrome.storage.local.set({ largPainel: 0 }); } catch (x) {} });
  })();
  console.log('[Estúdio Eternize] extensão ativa nesta aba');
  let trocas = 0;
  setInterval(() => {   // o painel é de UM contato: se a Leona mudar de chat com ele aberto, fecha (o rascunho já ficou guardado no contato certo)
    if (!$('#veu').classList.contains('on') || !chatPainel.id) { trocas = 0; return; }
    const atual = chatAtual().id;
    if (atual && atual !== chatPainel.id) { if (++trocas >= 2) { trocas = 0; $('#veu').classList.remove('on'); toast('Você mudou de contato: fechei o painel para não misturar as fotos. Abra o Estúdio de novo no contato certo.'); } } else trocas = 0;
  }, 600);
  $('#fechar').onclick = () => $('#veu').classList.remove('on');
  // clicar fora do painel (na área escura) fecha
  $('#veu').addEventListener('mousedown', e => { if (e.target === $('#veu')) $('#veu').classList.remove('on'); });
})();

})();
