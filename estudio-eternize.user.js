// ==UserScript==
// @name         Estúdio Eternize
// @namespace    eternize.estudio
// @icon         https://raw.githubusercontent.com/omisael-crypto/estudio-eternize-controle-remoto/main/icone.png
// @version      0.12.3
// @description  Mostra as fotos que o cliente enviou no chat da Leona, separa por pessoa e manda para o Estúdio Eternize.
// @updateURL    https://raw.githubusercontent.com/omisael-crypto/estudio-eternize-controle-remoto/main/estudio-eternize.user.js
// @downloadURL  https://raw.githubusercontent.com/omisael-crypto/estudio-eternize-controle-remoto/main/estudio-eternize.user.js
// @match        https://app.leonasolutions.io/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @connect      *.b-cdn.net
// ==/UserScript==

// Gerado por leona/gerar.py (não edite aqui: edite extensao-estudio/content.js e leona/shim.js).
(function () {
'use strict';
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
        const r = await pedir(msg.url, { binario: true, tempo: 60000 });
        if (r.status !== 200) return { ok: false, erro: 'O servidor da foto respondeu ' + r.status + '.' };
        const by = new Uint8Array(r.response);
        const mime = by[0] === 0xff ? 'image/jpeg' : by[0] === 0x89 ? 'image/png' : by[0] === 0x52 ? 'image/webp' : (cab(r, 'content-type') || 'image/jpeg');
        return { ok: true, mime, b64: b64(r.response) };
      }
      if (msg.tipo === 'entregue') { const r = await estudio('/api/leona/entregue', { method: 'POST', body: JSON.stringify({ id: msg.id, tipo: msg.arquivo }) }); return { ok: r.status === 200 }; }
      return { ok: false, erro: 'Mensagem desconhecida.' };
    } catch (e) { return { ok: false, erro: String((e && e.message) || e) }; }
  }

  // ---- ajustes no menu do Tampermonkey (no lugar do ícone da extensão) ----
  try {
    const auto = () => GM_getValue('autoEnviar', true) !== false;
    GM_registerMenuCommand('Apertar Enviar sozinha: ' + (auto() ? 'LIGADO' : 'desligado') + ' (clique para trocar)', () => { storage.set({ autoEnviar: !auto() }); location.reload(); });
    GM_registerMenuCommand('Testar conexão com o Estúdio', async () => {
      const r = await tratar({ tipo: 'ping' });
      alert(r.ok ? 'Estúdio ligado (versão ' + ((r.dados && r.dados.versao) || '?') + ') na porta ' + r.porta + '.' : 'Não achei o Estúdio. Abra o aplicativo do Estúdio.');
    });
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
  let n, pessoas, ativa, fotosSel, mais, ajuste, relogio = null, msg = '';
  let buscando = false;
  let autoEnvio = true;   // chave "Envio automático ao cliente" (liga/desliga os botões "e enviar")
  const janelaPagina = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
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
  function lerNaTela() {
    const vistos = new Set(), lista = [];
    document.querySelectorAll('[data-message-id]').forEach(msg => {
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
    let m = memoria.get(ch); if (!m) { m = { lista: [], por: new Map() }; memoria.set(ch, m); }
    for (const src of lerNaTela()) if (!m.por.has(src)) { const f = { id: m.lista.length + 1, src }; m.lista.push(f); m.por.set(src, f.id); }
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
  async function buscarAntigas(aoAndar) {   // rola o chat até o começo para a Leona carregar as mensagens antigas
    const sc = rolagemDoChat(); if (!sc) return 0;
    const ch = chatAtual().id, antes = lembrar().lista.length;
    let parados = 0, alt = -1;
    for (let i = 0; i < 40 && parados < 3; i++) {
      if (chatAtual().id !== ch) break;
      sc.scrollTop = 0;
      await new Promise(r => setTimeout(r, 700));
      lembrar(); if (aoAndar) aoAndar(lembrar().lista.length);
      if (sc.scrollHeight === alt) parados++; else { parados = 0; alt = sc.scrollHeight; }
    }
    sc.scrollTop = sc.scrollHeight;   // volta para o fim do chat
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
    .edit-corpo{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto}
    .stage{position:relative;line-height:0;user-select:none;touch-action:none}
    .stage canvas{display:block;border-radius:6px}
    .crop{position:absolute;border:2px dashed #4c8dff;cursor:pointer;box-sizing:border-box;touch-action:none;background:rgba(255,255,255,.04)}
    .crop.ativo{border-style:solid;box-shadow:0 0 0 9999px rgba(0,0,0,.62);cursor:move;background:transparent}
    .crop .rot{position:absolute;left:0;top:0;color:#fff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 0;line-height:1.3}
    .edit-pes{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 18px;background:#14151a;border-bottom:1px solid #2a2c35;font-size:13px;color:#9aa0b2}
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
    .veu{position:fixed;inset:0;background:#000a;z-index:2147483001;display:none;justify-content:flex-end}
    .veu.on{display:flex}
    .gav{width:min(1020px,100%);height:100%;background:#121317;color:#e6e8ee;border-left:2px solid #4c8dff;display:flex;flex-direction:column;font-size:14px;position:relative}
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
    .troca{white-space:nowrap;font-size:12px;font-weight:600;border:1px solid #2a2c35;background:#191a20;border-radius:8px;padding:4px 10px;cursor:pointer;color:#c9cdda;line-height:1.4}
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
    .dicac{font-size:13px;color:#9aa0b2;margin:4px 0 12px}.dicac b{color:#e6e8ee}
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
    .cols{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:auto minmax(0,1fr) auto auto auto;column-gap:20px;row-gap:10px}
    .col{display:contents}
    .col:nth-child(1)>*{grid-column:1}.col:nth-child(2)>*{grid-column:2}.col:nth-child(3)>*{grid-column:3}
    .col>.ct{grid-row:1}.col>.cartao{grid-row:2}.col>.jqs-l{grid-row:3}.col>.lin2{grid-row:4}.col>.stt{grid-row:5}
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
    .stt{font-size:.85rem;color:#8e8e9a;min-height:20px}.stt.ok{color:#22d366}.stt.bad{color:#f2686a}
    .andam .erro{color:#f2686a;font-size:.85rem}
    @media(max-width:1100px){.cols{grid-template-columns:1fr;grid-template-rows:none;overflow:auto}.col{display:flex;flex-direction:column;gap:10px}.col>*{grid-column:auto!important;grid-row:auto!important}.cartao{min-height:360px}}
  </style>
  <div class="veu" id="veu"><div class="gav">
    <header><div class="tit"><svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#161d4a"/><stop offset="1" stop-color="#262b73"/></linearGradient><radialGradient id="lb"><stop offset="0" stop-color="#fcd679" stop-opacity=".55"/><stop offset="1" stop-color="#fcd679" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" rx="110" fill="url(#lg)"/><circle cx="256" cy="256" r="175" fill="url(#lb)"/><polygon fill="#fcd679" points="256,92 282,236 420,256 282,276 256,420 230,276 92,256 230,236"/><polygon fill="#fff6dc" points="256,150 270,242 372,256 270,270 256,370 242,270 140,256 242,242"/><polygon fill="#fcd679" points="385,100 392,128 420,135 392,142 385,170 378,142 350,135 378,128"/><polygon fill="#fcd679" points="131,355 136,375 156,380 136,385 131,405 126,385 106,380 126,375"/></svg><div><h3>Estúdio Eternize · Nova homenagem</h3><small id="cli"></small></div></div><button class="x" id="fechar">×</button></header>
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
    const av = avisos[chatAtual().id];
    pontoEl.style.display = av ? 'block' : 'none';
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
    if (n === 1) return '1p';
    if (emJuntos()) return jq;
    if (n === 2) return ({ ff: '2f', fv: '1f2v', vf: '1v2f' })[l] || null;
    return l.includes('f') ? n + '-' + l : null;
  }
  const todasFalecidas = () => pessoas.every(p => !p.vivo);
  const lista = () => emJuntos() ? pessoas.slice(0, 1) : pessoas;   // com "Mesma foto" só o 1º quadrado conta
  function pedido(direto) {
    const idx = k => pessoas.map((p, i) => p[k] ? i + 1 : 0).filter(Boolean);
    let chegada = null;
    if (n >= 2 && n <= 4 && todasFalecidas() && pessoas.some(p => p.papel)) {
      chegada = { espera: pessoas.map((p, i) => p.papel === 'espera' ? i + 1 : 0).filter(Boolean), chega: pessoas.map((p, i) => p.papel === 'chega' ? i + 1 : 0).filter(Boolean) };
    }
    if (emJuntos()) {
      const p = pessoas[0];
      return { origem: 'leona', chat: chatAtual(), caso: jq, juntos: true,
        pessoas: [{ n: 1, vivo: false, fotos: [fotosSel.find(f => f.id === p.foto).src], ...(p.editada ? { imagem: { tipo: 'image/jpeg', b64: p.editada.b64 } } : {}) }],
        opcoes: { ajuste: ajuste.trim(), direto } };
    }
    return {
      origem: 'leona', chat: chatAtual(), caso: casoDe(),
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
    const miniaturas = fotosSel.map(f => `<button class="pick ${f.id === ed.fotoId ? 'at' : ''}" data-pick="${f.id}" title="Usar esta foto"><img src="${esc(f.src)}"></button>`).join('');
    $('#edit').innerHTML = `
      <div class="edit-top"><h4>Recortar a pessoa ${ed.i + 1}</h4>
        <button class="tb" data-ed="esq">↺ Girar à esquerda</button><button class="tb" data-ed="dir">↻ Girar à direita</button>
        <button class="tb ${ed.flip ? 'on' : ''}" data-ed="flip">⇄ Espelhar</button>
        <button class="tb" data-ed="zero" style="margin-left:auto">Desfazer giro</button></div>
      <div class="edit-pes"><span>Foto do cliente:</span>${miniaturas}</div>
      <div class="edit-corpo" id="editcorpo">${ed.carregando ? '<div class="ocupado">Abrindo a foto…</div>' : ed.erro ? `<div class="aviso bad">${esc(ed.erro)}</div>` : '<div class="stage" id="stage"><canvas id="ec"></canvas></div>'}</div>
      <div class="edit-rod"><span class="res">Gire se precisar, depois arraste a moldura sobre a pessoa e ajuste pelas bolinhas.</span>
        <div style="display:flex;gap:8px"><button class="tb" data-ed="cancelar">Cancelar</button><button class="tb on" data-ed="usar" ${ed.img ? '' : 'disabled'} style="padding:9px 18px;font-weight:700">Usar como P${ed.i + 1}</button></div></div>`;
    if (ed.img && !ed.carregando) {
      const area = $('#editcorpo'), base0 = renderBase(ed.img, ed, 1600);
      const k = Math.min((area.clientWidth - 36) / base0.width, (area.clientHeight - 36) / base0.height, 1);
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
  const rotuloMais = () => { const k = contaOps(); return (mais ? '▾' : '▸') + ' Mais opções' + (k ? ` <span class="cnt">${k} ${k > 1 ? 'ligadas' : 'ligada'}</span>` : ''); };

  function desenhar() {
    const chat = chatAtual();
    $('#cli').textContent = 'Cliente: ' + (chat.nome || '(nome não achado)') + ' · #' + (chat.id || '?') + ' (vem sozinho da Leona)';
    const usadas = pessoas.map(p => p.foto).filter(Boolean);
    const nOps = contaOps();
    const prob = problema(), ok = casoDe() && lista().every(p => p.foto) && !prob;

    const cartoes = lista().map((p, i) => {
      const f = p.foto && fotosSel.find(x => x.id === p.foto);
      const livre = !p.animal && !p.bebe;
      return `<div class="pes">
        <div class="slot ${i === ativa ? 'ativa' : ''} ${f ? 'cheio' : ''}" data-slot="${i}">
          <b>${emJuntos() ? 'Foto com as duas pessoas' : 'P' + (i + 1)}</b>
          <div class="acs"><button data-edit="${i}" title="Recortar esta pessoa de uma foto do cliente" aria-label="Recortar">✂</button>${f ? `<button data-lim="${i}" title="Tirar a foto" aria-label="Tirar a foto">×</button>` : ''}</div>
          ${f ? `<img src="${esc(p.editada ? p.editada.thumb : f.src)}">${p.editada ? '<span class="etq">recortada</span>' : ''}` : '<span class="dica">Clique numa foto do chat ou use o ✂ para recortar a pessoa</span>'}
          ${p.busy ? '<div class="ocupado">Abrindo a foto…</div>' : ''}
        </div>
        ${emJuntos() ? `<div class="jq">${['1f2v', '1v2f', '2f'].map(q => BT('', 'data-jq="' + q + '"', NOMEJQ[q], jq === q)).join('')}</div>` : ''}
        ${n >= 2 && !emJuntos() ? `<div class="par" data-est="${i}">${BT('', 'data-v="0"', '★ Faleceu', !p.vivo)}${BT('', 'data-v="1"', '♥ Está viva', p.vivo)}</div>` : ''}
        ${n >= 2 && n <= 4 && !emJuntos() ? `<div class="par ${todasFalecidas() ? '' : 'escondido'}" data-papel="${i}">${BT('', 'data-pp="espera"', 'No céu', p.papel === 'espera')}${BT('', 'data-pp="chega"', 'Chegou', p.papel === 'chega')}</div>` : ''}
        ${mais && !emJuntos() ? `<div class="trio">${BT('sc', 'data-op="animal"', 'Animal', p.animal)}${BT('sc', 'data-op="bebe"', 'Bebê', p.bebe)}${livre ? BT('sc', 'data-op="semcamisa"', 'Sem camisa', p.semcamisa) : ''}</div>
          ${livre ? `<div class="duo">${BT('sc', 'data-op="calca"', 'Calça', p.calca)}${BT('sc', 'data-op="vestido"', 'Vestido', p.vestido)}</div>` : ''}` : ''}
      </div>`;
    }).join('');

    $('#corpo').innerHTML = `
      <div class="esq"><h5>Fotos que o cliente enviou (${fotosSel.length}) — clique para colocar na pessoa marcada <button class="troca" id="antigas" style="margin-left:10px;text-transform:none;letter-spacing:0">${buscando ? 'Buscando…' : '⟳ Buscar fotos antigas'}</button></h5>
        <div class="fotos">${fotosSel.map(f => `<div class="foto" data-f="${f.id}"><img src="${esc(f.src)}">${uso(f.id)}</div>`).join('') || '<div class="vazio">Nenhuma foto achada neste chat.</div>'}</div></div>
      <div class="dir" id="dir">
        <div class="passo"><b>1</b><span>Quantas pessoas?</span>${n === 2 ? `<button class="troca" id="juntos" aria-pressed="${emJuntos()}" title="As duas pessoas aparecem na mesma foto: cole uma foto só e diga quem faleceu" style="${emJuntos() ? 'background:#4c8dff;color:#fff;border-color:#4c8dff' : ''}">👥 Mesma foto</button>` : ''}</div>
        <div class="seg">${[1, 2, 3, 4].map(k => `<button data-n="${k}" class="${k === n ? 'on' : ''}">${k} ${k === 1 ? 'pessoa' : 'pessoas'}</button>`).join('')}<button data-n="5" class="mais ${n > 4 ? 'on' : ''}" title="Mais pessoas (5 a 8)" aria-label="Mais pessoas, de 5 a 8" style="flex:0 0 44px">+</button></div>
        ${n > 4 ? `<div class="seg">${[5, 6, 7, 8].map(k => `<button data-n="${k}" class="${k === n ? 'on' : ''}">${k} pessoas</button>`).join('')}</div>` : ''}
        <div class="passo"><b>2</b><span>${emJuntos() ? 'Cole a foto com as duas e diga quem faleceu' : n >= 2 ? 'Cole as fotos e marque quem faleceu' : 'Cole a foto'}</span>${n >= 2 && n <= 4 && !emJuntos() ? '<button class="troca" id="troca" title="Inverter a ordem (esquerda e direita)">⇄ Trocar</button>' : ''}</div>
        <div class="grade ${n === 1 || emJuntos() ? 'um' : ''}">${cartoes}</div>
        ${prob ? `<div class="aviso">${esc(prob)}</div>` : ''}
        <button class="maisop" id="mais">${rotuloMais()}</button>
        ${mais ? `<div class="aj"><label for="aj">Quer mudar algo?</label><div style="display:flex;gap:8px;align-items:center"><input id="aj" maxlength="500" placeholder="Ex.: tirar o copo da mão" value="${esc(ajuste)}" style="flex:1">${REC ? '<button class="micb" id="ajmic" type="button" title="Falar em vez de escrever" aria-label="Falar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' : ''}</div><div id="micmsg" class="aviso" style="display:none"></div></div>` : ''}
        <div class="passo" style="margin-top:14px"><b>3</b><span>Gerar</span></div>
        <div class="dicac">${dica()}</div>
        <label class="chv" title="Ligada: aparecem os botões 'e enviar' (quando o arquivo fica pronto, vai sozinho para o cliente, com este chat aberto). Desligada: você envia à mão."><input type="checkbox" id="chaveauto" ${autoEnvio ? 'checked' : ''}><i></i><span>Envio automático ao cliente</span></label>
        <div class="bgrid ${autoEnvio ? 'dois' : ''}">
          <button class="go" id="gdireto" ${ok ? '' : 'disabled'}>Gerar homenagem</button>
          ${autoEnvio ? `<button class="go" id="gdiretoenv" ${ok ? '' : 'disabled'}>Gerar homenagem e enviar</button>` : ''}
          <button class="go sec" id="gprevia" ${ok ? '' : 'disabled'}>Gerar só a prévia</button>
          ${autoEnvio ? `<button class="go sec" id="gpreviaenv" ${ok ? '' : 'disabled'}>Gerar só a prévia e enviar</button>` : ''}
        </div>
        <div class="msg ${msg.startsWith('!') ? 'bad' : ''}" id="msg">${esc(msg.replace(/^!/, ''))}</div>
      </div>`;
    ligar();
    agendarRascunho();
  }

  function ligar() {
    const c = $('#corpo');
    c.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { setN(+b.dataset.n); msg = ''; desenhar(); });
    c.querySelectorAll('[data-slot]').forEach(e => e.onclick = () => { ativa = +e.dataset.slot; desenhar(); });
    c.querySelectorAll('[data-lim]').forEach(e => e.onclick = ev => { ev.stopPropagation(); const q = pessoas[+e.dataset.lim]; q.foto = null; q.edit = null; q.editada = null; ativa = +e.dataset.lim; desenhar(); });
    c.querySelectorAll('[data-edit]').forEach(e => e.onclick = ev => { ev.stopPropagation(); abrirEditor(+e.dataset.edit); });
    c.querySelectorAll('[data-f]').forEach(e => e.onclick = () => {   // a foto vai para a pessoa marcada; o marcador pula para a próxima sem foto
      pessoas[ativa].foto = +e.dataset.f; pessoas[ativa].edit = null; pessoas[ativa].editada = null;   // outra foto: a edição da anterior não vale
      const prox = pessoas.findIndex(p => !p.foto);
      if (prox >= 0) ativa = prox;
      msg = ''; desenhar();
    });
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
    const ant = $('#antigas'); if (ant) ant.onclick = async () => {
      if (buscando) return; buscando = true; desenhar();
      const n0 = fotosSel.length;
      try { await buscarAntigas(); } catch (e) {}
      buscando = false; fotosSel = lerFotos();
      msg = fotosSel.length > n0 ? 'Achei ' + (fotosSel.length - n0) + ' foto(s) a mais.' : 'Não achei fotos mais antigas neste chat.'; desenhar();
    };
    const jb = $('#juntos'); if (jb) jb.onclick = () => { juntos = !juntos; ativa = 0; msg = ''; desenhar(); };
    c.querySelectorAll('[data-jq]').forEach(b => b.onclick = () => { jq = b.dataset.jq; desenhar(); });
    const troca = $('#troca'); if (troca) troca.onclick = () => { pessoas.reverse(); ativa = 0; desenhar(); };
    $('#mais').onclick = () => { mais = !mais; desenhar(); };
    const mic = $('#ajmic'); if (mic) mic.onclick = () => falar(mic, $('#aj'));
    const aj = $('#aj'); if (aj) aj.oninput = () => { ajuste = aj.value; $('#mais').innerHTML = rotuloMais(); };
    $('#gdireto').onclick = () => enviar(true, false);
    $('#gprevia').onclick = () => enviar(false, false);
    const ge = $('#gdiretoenv'); if (ge) ge.onclick = () => enviar(true, true);
    const gp = $('#gpreviaenv'); if (gp) gp.onclick = () => enviar(false, true);
    $('#chaveauto').onchange = e => { autoEnvio = e.target.checked; try { chrome.storage.local.set({ autoEnvio }); } catch (x) {} desenhar(); };
  }

  async function enviar(direto, auto) {
    $('#corpo').querySelectorAll('.bgrid .go').forEach(b => { b.disabled = true; });
    $('#msg').className = 'msg'; $('#msg').textContent = 'Enviando ao Estúdio…';
    let r;
    const ped = pedido(direto);
    try { r = await chrome.runtime.sendMessage({ tipo: 'gerar', pedido: ped }); } catch (e) { r = { erro: String(e) }; }
    if (r && r.ok) { try { chrome.storage.local.set({ ['ped_' + r.id]: ped }); if (auto) chrome.storage.local.set({ ['auto_' + r.id]: direto ? 'video' : 'previa' }); } catch (e) {} limparRascunho(chatAtual().id); }
    if (!r || !r.ok) {
      msg = '!' + ((r && r.erro) || 'Não achei o Estúdio. Abra o aplicativo e confira a porta no ícone da extensão.');
      return desenhar();
    }
    msg = '';
    const ch = chatAtual().id;
    guardar(ch, r.id);
    acompanhar(r.id, ch);
  }

  // ---------- rascunho do menu por contato (fotos escolhidas, recortes, opções) ----------
  let rascunho = null, tRasc = null;
  const chaveRasc = ch => 'rasc_' + ch;
  async function lerRascunho(ch) { try { return (await chrome.storage.local.get(chaveRasc(ch)))[chaveRasc(ch)] || null; } catch (e) { return null; } }
  function limparRascunho(ch) { clearTimeout(tRasc); rascunho = null; try { chrome.storage.local.remove(chaveRasc(ch)); } catch (e) {} }
  function agendarRascunho() {
    if (!$('#veu').classList.contains('on') || !$('#gdireto')) return;   // só quando o menu está na tela (não no andamento)
    const ch = chatAtual().id; if (!ch) return;
    clearTimeout(tRasc);
    tRasc = setTimeout(() => {
      const algo = pessoas.some(p => p.foto || p.editada || p.animal || p.bebe || p.semcamisa || p.calca || p.vestido || p.papel) || ajuste.trim() || n > 1;
      if (!algo) { try { chrome.storage.local.remove(chaveRasc(ch)); } catch (e) {} return; }
      const dado = { n, juntos, jq, ajuste, mais, pessoas: pessoas.map(p => { const f = p.foto && fotosSel.find(x => x.id === p.foto); return { ...p, foto: null, busy: false, fotoSrc: f ? f.src : null }; }) };
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
    const tentando = new Set();
    setInterval(async () => {
      for (const [ch, id] of [...vigia]) {
        let r; try { r = await chrome.runtime.sendMessage({ tipo: 'status', id }); } catch (e) { continue; }
        const d = r && r.dados; if (!d) continue;
        if (!d.id) { vigia.delete(ch); continue; }
        const pronta = !!(d.previa && (d.previa.estado === 'pronto' || d.previa.estado === 'pronta'));
        const videoPronto = d.direto !== false && !!(d.video && d.video.estado === 'pronto');
        const erro = !!(d.erro || (d.previa && d.previa.estado === 'erro') || (d.video && d.video.estado === 'erro'));
        const vendo = $('#veu').classList.contains('on') && chatAtual().id === ch;
        let novo = videoPronto ? 'video' : pronta ? 'previa' : '';
        if (novo && !vendo && avisos[ch] !== novo && !(avisos[ch] === 'video')) { avisos[ch] = novo; try { chrome.storage.local.set({ ['aviso_' + ch]: novo }); } catch (e) {} }
        // envio automático ("... e enviar"): quando o arquivo escolhido fica pronto e o chat está aberto, vai sozinho para o cliente
        let alvo = ''; try { alvo = (await chrome.storage.local.get('auto_' + id))['auto_' + id] || ''; } catch (e) {}
        if (alvo) {
          const pronto = alvo === 'video' ? videoPronto : pronta;
          if (erro) { try { chrome.storage.local.remove('auto_' + id); } catch (e) {} vigia.delete(ch); continue; }
          if (pronto && chatAtual().id === ch && !tentando.has(id)) {
            tentando.add(id);
            try { chrome.storage.local.remove('auto_' + id); } catch (e) {}   // uma tentativa só: se falhar, o botão Enviar da tela continua valendo (nada é enviado duas vezes)
            if (!(d.entregas && d.entregas[alvo])) { entregasAtual = d.entregas || {}; try { await devolver(id, ch, alvo, false, true); } catch (e) {} }
            tentando.delete(id); vigia.delete(ch);
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

  async function devolver(id, chatId, tipo, soBaixar, forcar) {
    const nomeTipo = tipo === 'video' ? 'o vídeo' : 'a prévia';
    try {
      if (!soBaixar && chatAtual().id !== chatId) { msgEnvio = '!Este pedido é do chat #' + chatId + '. Abra esse chat para colocar ' + nomeTipo + ' nele.'; return; }
      msgEnvio = 'Buscando ' + nomeTipo + ' no Estúdio…'; mostrarMsg();
      const file = await pegarArquivo(id, tipo);
      if (soBaixar) { baixarArquivo(file); msgEnvio = 'Arquivo baixado.'; return; }
      if (entregasAtual[tipo] && !window.confirm('Já enviei ' + nomeTipo + ' a este chat às ' + entregasAtual[tipo].slice(-8) + '. Enviar de novo?')) { msgEnvio = 'Cancelado: nada foi enviado.'; return; }
      const como = anexar(file);
      if (!como) { baixarArquivo(file); msgEnvio = '!Não achei onde anexar nesta tela da Leona. Baixei o arquivo: anexe pelo clipe.'; return; }
      if (!autoEnviar && !forcar) {
        chrome.runtime.sendMessage({ tipo: 'entregue', id, arquivo: tipo });
        msgEnvio = 'Coloquei ' + nomeTipo + ' no chat. Confira e aperte enviar.'; return;
      }
      msgEnvio = 'Anexado. Apertando enviar…'; mostrarMsg();
      const res = await apertarEnviar(chatId, tipo === 'video' ? 25000 : 12000);
      if (res === 'ok') { chrome.runtime.sendMessage({ tipo: 'entregue', id, arquivo: tipo }); msgEnvio = 'Enviei ' + nomeTipo + ' ao cliente.'; }
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
  const previas = {};   // pedido -> { previa, video, orig: [urls] } (buscados uma vez só, para o vídeo não reiniciar)
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const legenda = (c, juntos) => {
    if (!c) return '';
    if (c === '1p') return '1 pessoa';
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
          <div class="lin2"><button class="gr" id="r-direto">Gerar homenagem</button><button class="gr sec" id="r-previa">Só a prévia</button></div>
          <div class="stt" id="r-msg"></div></section>
        <section class="col"><div class="ct"><span>2 · Prévia · cliente</span><span id="p-pill"></span></div>
          <div class="cartao" id="c-previa"></div>
          <div class="lin2"><button class="gr" id="e-previa" disabled>Enviar prévia ao cliente</button><button class="gr sec ic" id="f-previa" title="Tela cheia" aria-label="Tela cheia" disabled>⛶</button><button class="gr sec ic" id="b-previa" title="Baixar a prévia" aria-label="Baixar" disabled>⬇</button></div>
          <div class="stt" id="s-previa"></div></section>
        <section class="col"><div class="ct"><span id="v-tit">3 · Vídeo</span><span id="v-pill"></span></div>
          <div class="cartao" id="c-video"></div>
          <div class="lin2"><button class="gr" id="e-video" disabled>Enviar vídeo ao cliente</button><button class="gr sec ic" id="f-video" title="Tela cheia" aria-label="Tela cheia" disabled>⛶</button><button class="gr sec ic" id="b-video" title="Baixar o vídeo" aria-label="Baixar" disabled>⬇</button></div>
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
          previas[id][ch] = URL.createObjectURL(new Blob([by], { type: String(r.mime).split(';')[0] })); } else previas[id][ch] = ''; } catch (e) { previas[id][ch] = ''; }
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
      dados = d;
      entregasAtual = d.entregas || {};
      const direto = d.direto !== false, ent = d.entregas || {};
      const pronta = !!(d.previa && (d.previa.estado === 'pronto' || d.previa.estado === 'pronta'));
      const videoPronto = !!(direto && d.video && d.video.estado === 'pronto');
      const erro = d.erro || (d.previa && d.previa.erro) || (d.video && d.video.erro) || '';
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
        const pe = !d.previa ? 'agora' : pronta ? 'ok' : d.previa.estado === 'erro' ? 'erro' : 'agora';
        const pp = pe === 'ok' ? 'Pronto' : pe === 'erro' ? 'Erro' : (d.previa && d.previa.estado === 'fila') ? 'Na fila' : 'Gerando';
        $('#p-pill').innerHTML = `<span class="pill ${pe}">${pp}</span>`;
        const cp = $('#c-previa'), up = previas[id].previa;
        const sigP = pronta ? 'img|' + up : pe + '|' + (d.previa ? d.previa.estado : 'x') + '|' + (pe === 'agora' ? cron('previa', d.previa ? d.previa.inicio : d.inicio) : '');
        if (cp.dataset.sig !== sigP) { cp.dataset.sig = sigP;
          cp.innerHTML = pronta && up ? `<img id="im-previa" src="${up}" alt="Prévia">`
            : pronta ? '<div class="espera">Abrindo a prévia…</div>'
            : pe === 'erro' ? `<div class="espera erro">A prévia deu erro.</div>`
            : `<div class="espera"><i class="gira"></i><b>${cron('previa', d.previa ? d.previa.inicio : d.inicio)}</b>${d.previa ? 'Gerando a prévia…' : 'Enviando as fotos ao Estúdio…'}</div>`; }
        $('#e-previa').disabled = !pronta; $('#f-previa').disabled = !(pronta && up); $('#b-previa').disabled = !pronta;
        $('#e-previa').textContent = ent.previa ? 'Enviar a prévia de novo' : 'Enviar prévia ao cliente';
        $('#s-previa').className = 'stt' + (ent.previa ? ' ok' : ''); $('#s-previa').textContent = ent.previa ? '✓ enviada ao cliente às ' + hora(ent.previa) : '';
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
          $('#s-video').className = 'stt' + (ent.video ? ' ok' : ''); $('#s-video').textContent = ent.video ? '✓ enviado ao cliente às ' + hora(ent.video) : '';
        }
        if (!direto) { $('#e-video').disabled = true; $('#f-video').disabled = true; $('#b-video').disabled = true; }
        $('#erro').innerHTML = erro ? `<div class="erro">${esc(erro)}</div>` : '';
        $('#dicaenv').textContent = (autoDe && !ent[autoDe]) ? 'Envio automático ligado: ' + (autoDe === 'video' ? 'o vídeo' : 'a prévia') + ' vai ao cliente sozinho quando ficar pronto' + (chatAtual().id === chatId ? '.' : ' (abra o chat #' + chatId + ' para enviar).') : (pronta || videoPronto) ? (autoEnviar ? 'Ao clicar em Enviar, o arquivo vai para o chat de origem e a extensão aperta Enviar sozinha.' : 'O arquivo é colocado no chat de origem; você confere e aperta enviar.') : '';
        mostrarMsg();
      };
      ultimaPintura();
      if (erro || videoPronto || (!direto && pronta)) clearInterval(relogio);
    };
    $('#e-previa').onclick = () => devolver(id, chatId, 'previa', false);
    $('#b-previa').onclick = () => devolver(id, chatId, 'previa', true);
    $('#f-previa').onclick = () => tela(null, '#im-previa');
    $('#e-video').onclick = () => devolver(id, chatId, 'video', false);
    $('#b-video').onclick = () => devolver(id, chatId, 'video', true);
    $('#f-video').onclick = () => tela(null, '#im-video');
    // refazer: manda o mesmo pedido de novo (com o caso escolhido, na foto única), igual aos botões da primeira coluna do Estúdio
    const refazer = async direto => {
      const m = $('#r-msg'); m.className = 'stt';
      if (chatAtual().id !== chatId) { m.className = 'stt bad'; m.textContent = 'Abra o chat #' + chatId + ' para refazer.'; return; }
      let g; try { const k = 'ped_' + id; g = (await chrome.storage.local.get(k))[k]; } catch (e) {}
      if (!g) { m.className = 'stt bad'; m.textContent = 'Este pedido é antigo: use "Nova homenagem neste chat".'; return; }
      const ped = JSON.parse(JSON.stringify(g)); ped.opcoes = ped.opcoes || {}; ped.opcoes.direto = direto;
      if (ped.juntos && jqRef) ped.caso = jqRef;
      m.textContent = 'Enviando ao Estúdio…';
      let r; try { r = await chrome.runtime.sendMessage({ tipo: 'gerar', pedido: ped }); } catch (e) { r = { erro: String(e) }; }
      if (!r || !r.ok) { m.className = 'stt bad'; m.textContent = (r && r.erro) || 'Não achei o Estúdio.'; return; }
      try { chrome.storage.local.set({ ['ped_' + r.id]: ped }); } catch (e) {}
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
    fotosSel = lerFotos();
    pessoas = []; juntos = false; jq = '2f'; ativa = 0; mais = false; ajuste = ''; msg = ''; msgEnvio = ''; if (ed) fecharEditor();
    setN(1);
    $('#veu').classList.add('on');
    const ch = chatAtual().id;
    limparAviso(ch);
    if (novo !== true && ch) {   // ja tem homenagem pedida deste chat: mostra o andamento (e os botoes de enviar)
      try {
        const h = await lerHist(ch);
        if (h.length) return acompanhar(h[0].id, ch);
      } catch (e) {}
    }
    rascunho = await lerRascunho(ch); aplicarRascunho(false);
    desenhar();
    if (!jaBuscou.has(ch)) {   // a primeira vez em cada chat: rola o chat até o começo para a Leona carregar todas as fotos
      jaBuscou.add(ch); buscando = true; desenhar();
      try { await buscarAntigas(); } catch (e) {}
      buscando = false;
      if ($('#veu').classList.contains('on') && chatAtual().id === ch) { const n0 = fotosSel.length; fotosSel = lerFotos(); aplicarRascunho(true); if (fotosSel.length !== n0) msg = ''; desenhar(); }
    }
  }
  const jaBuscou = new Set();
  btn.onclick = () => abrir();
  // o ícone da extensão pergunta aqui se o script está vivo nesta aba
  try {
    chrome.runtime.onMessage.addListener((m, _r, responder) => {
      if (m && m.tipo === 'ola') responder({ ok: true, noCabecalho: !!acharTraduzir(), fotos: lerFotos().length, chat: chatAtual().id, botaoNaPagina: document.contains(btn) });
    });
  } catch (e) {}
  console.log('[Estúdio Eternize] extensão ativa nesta aba');
  $('#fechar').onclick = () => $('#veu').classList.remove('on');
  // clicar fora do painel (na área escura) fecha
  $('#veu').addEventListener('mousedown', e => { if (e.target === $('#veu')) $('#veu').classList.remove('on'); });
})();

})();
