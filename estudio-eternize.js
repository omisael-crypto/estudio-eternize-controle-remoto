// Estúdio Eternize — controle remoto, versão 0.17.39 (gerado por leona/gerar.py)
(function () {
'use strict';
const VERSAO_SCRIPT = '0.17.39';
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
      if (msg.tipo === 'video_novo') {
        const r = await estudio('/api/video', { method: 'POST', body: JSON.stringify({ previa_id: msg.previa_id, ajuste: msg.ajuste, forcar: true }), tempo: 120000 });
        return { ok: r.status === 200 && !!(r.json && r.json.pedido), erro: (r.json && r.json.erro) || (r.status !== 200 ? 'O Estúdio respondeu ' + r.status + '.' : '') };
      }
      if (msg.tipo === 'previa_correcao') {
        const r = await estudio('/api/previa-correcao', { method: 'POST', body: JSON.stringify({ id: msg.id, correcao: msg.correcao }) });
        return { ok: r.status === 200 && !!(r.json && r.json.ok), erro: (r.json && r.json.erro) || '' };
      }
      if (msg.tipo === 'diario') {
        const r = await estudio('/api/leona/diario', { method: 'POST', body: JSON.stringify({ eventos: msg.eventos }) });
        return { ok: r.status === 200 };
      }
      if (msg.tipo === 'ponto') { const r = await estudio('/api/ponto/meu'); return { ok: r.status === 200, dados: r.json, porta: r.porta, erro: (r.json && r.json.erro) || '' }; }
      if (msg.tipo === 'ponto_acao') {
        const r = await estudio(msg.acao === 'encerrar' ? '/api/ponto/encerrar' : '/api/ponto/bater', { method: 'POST', body: '{}' });
        return { ok: r.status === 200, erro: (r.json && r.json.erro) || (r.status !== 200 ? 'O Estúdio respondeu ' + r.status + '.' : '') };
      }
      if (msg.tipo === 'status') { const r = await estudio('/api/leona/status?id=' + encodeURIComponent(msg.id)); return { ok: r.status === 200, dados: r.json }; }
      if (msg.tipo === 'arquivo') {
        const porta = await acharPorta();
        const r = await pedir('http://127.0.0.1:' + porta + '/api/leona/arquivo?id=' + encodeURIComponent(msg.id) + '&tipo=' + encodeURIComponent(msg.arquivo) + (msg.n != null ? '&n=' + Number(msg.n) : '') + (msg.ver ? '&ver=1' : '') + (msg.vid && /^v\d+$/.test(msg.vid) ? '&vid=' + msg.vid : ''), { binario: true, tempo: 180000 });
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
      if (msg.tipo === 'avaliar') { const r = await estudio('/api/avaliar', { method: 'POST', body: JSON.stringify({ id: msg.id, resultado: msg.resultado, motivo: msg.motivo || '', nota: msg.nota || '' }) }); return ({ ok: r.status === 200, erro: (r.json && r.json.erro) || '' }); }
      if (msg.tipo === 'rostos') { const r = await estudio('/api/rostos?id=' + encodeURIComponent(String(msg.id || ''))); return ({ ok: r.status === 200, dados: r.json, erro: (r.json && r.json.erro) || '' }); }
      if (msg.tipo === 'prompt_usado') { const r = await estudio('/api/prompt-usado?id=' + encodeURIComponent(String(msg.id || ''))); return ({ ok: r.status === 200, dados: r.json, erro: (r.json && r.json.erro) || '' }); }
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
  var modoPronta = false, prontaSrc = '';   // "prévia já enviada": usa uma imagem que NÓS mandamos no chat e gera só o vídeo dela
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
  // "Mesma foto" com 3 pessoas: o caso é "3-" + uma letra por posição (esquerda, meio, direita; f = faleceu, v = viva)
  const POS3 = ['a da esquerda', 'a do meio', 'a da direita'];
  const sobem3 = q => (q || '').slice(2).split('').map((x, i) => x === 'f' ? POS3[i] : '').filter(Boolean);
  const nomeJq = q => { if (NOMEJQ[q]) return NOMEJQ[q]; const f = sobem3(q); if (f.length === 3) return 'As três faleceram'; return (f.length === 1 ? 'Só ' + f[0] + ' faleceu' : (f[0].charAt(0).toUpperCase() + f[0].slice(1)) + ' e ' + f[1] + ' faleceram'); };
  const emJuntos = () => juntos && (n === 2 || n === 3);
  let chatPainel = { id: '', nome: '' };   // o contato em que o painel foi aberto: tudo o que o painel faz vale para ELE, mesmo que a Leona mude de chat

  const nova = () => ({ vivo: false, foto: null, animal: false, bebe: false, crianca: false, semcamisa: false, calca: false, vestido: false, papel: '', edit: null, editada: null, busy: false });

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
    .paises{display:flex;align-items:center;gap:8px;margin-left:auto;margin-right:14px}.paises[hidden]{display:none}
    .pais{width:38px;height:32px;padding:0;border:1px solid #2a2c35;border-radius:8px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:.6}
    .pais svg{width:22px;height:22px;display:block}.pais:hover{opacity:1;border-color:#4c8dff}.pais.on{opacity:1;border-color:#4c8dff;box-shadow:0 0 0 1px #4c8dff;background:#1d2233}
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
    .grade.um:has(.jq,.jq3){max-width:none}
    .jq3{display:flex;flex-direction:column;gap:6px}.j3l{display:grid;grid-template-columns:84px 1fr;align-items:center;gap:8px}.j3l>span{font-size:12px;color:#8b90a0}
    .jqs3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.jqs3>div{display:flex;flex-direction:column;gap:4px}.jqs3 span{font-size:.72rem;color:#8e8e9a;text-align:center}
    .jqs3 button{border:1px solid #2a2a31;background:#16161a;color:#9a9aa6;border-radius:8px;padding:7px 4px;font-size:.78rem;cursor:pointer}.jqs3 button.on{background:#4c8dff;color:#fff;font-weight:700;border-color:#4c8dff}
    .par{display:grid;grid-template-columns:1fr 1fr;border:1px solid #2a2c35;border-radius:9px;overflow:hidden}
    .par button{border:0;border-right:1px solid #2a2c35;background:#16171c;color:#9aa0b2;padding:7px 2px;cursor:pointer;font-size:12px}
    .par button:last-child{border-right:0}
    .par button.on{background:#4c8dff;color:#fff;font-weight:700}
    .par.escondido{visibility:hidden}
    .trio{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}.duo{display:grid;grid-template-columns:1fr 1fr;gap:4px}
    .sc{border:1px solid #2a2c35;background:#16171c;color:#9aa0b2;border-radius:8px;padding:6px 2px;cursor:pointer;font-size:12px}
    .sc.on{background:#4c8dff;color:#fff;border-color:#4c8dff;font-weight:700}
    .duo.um{grid-template-columns:1fr}.sc.oc,.duo.oc{visibility:hidden}
    .maisop{background:none;border:0;color:#9aa0b2;cursor:pointer;padding:6px 0;font-size:13px}
    .maisop .cnt{background:#4c8dff;color:#fff;border-radius:9px;padding:1px 7px;font-size:11px;margin-left:4px}
    .aj label{display:block;font-size:12px;color:#8b90a0;margin:6px 0 4px}
    .aj input{width:100%;height:36px;box-sizing:border-box;padding:0 14px;border-radius:18px;border:1px solid #2a2c35;background:#16171c;color:#fff;outline:none}
    .aj input:focus{border-color:#4c8dff}
    .sec-t{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 4px;min-height:28px}.sec-t h5{margin:0}.sec-t.seg2{margin-top:20px}
    .sec-s{color:#6f7486;font-size:12px;margin:0 0 10px}
    .avpr{background:#16171c;border:1px solid #2a2c35;border-left:3px solid #4c8dff;border-radius:10px;padding:10px 12px 12px;margin:0 0 16px;font-size:13px;color:#9aa0b2}
    .avpr .l1{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#e6e8ee;font-weight:700}
    .avpr .l2{margin-top:2px}
    .avpr .aj label{margin-top:10px}
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
    .col>.ct{grid-row:1}.col>.cartao{grid-row:2}.col>.r3{grid-row:3}.col>.lin2{grid-row:4}.col>.stt{grid-row:5}.col>.aj{grid-row:5}.col:nth-child(1)>.stt{grid-row:6}.col:nth-child(1)>.stt:empty{display:none}
    .jqs-l:empty,.aj:empty{display:none}
    .r3{display:flex;flex-direction:column;gap:8px}.r3>.gr{flex:none}.r3>.gr[hidden]{display:none}
    /* "Mais opções": a janelinha com o menu de cada pessoa (igual ao "Original e refazer" do Estúdio) */
    .mop{background:#17181f;border:1px solid #2a2c35;border-radius:12px;padding:14px;max-width:100%;max-height:92vh;display:flex;flex-direction:column;gap:10px;color:#e6e8f0}
    .mop h3{margin:0;font-size:15px;display:flex;align-items:center;justify-content:space-between;gap:10px}
    .mop .x{width:30px;height:30px;padding:0;border:1px solid #2a2c35;background:#1d1f27;color:#ececf0;border-radius:8px;cursor:pointer;display:grid;place-items:center}
    .mopg{display:grid;gap:8px;overflow:auto;min-height:0;justify-content:center}
    .mopp{display:flex;flex-direction:column;gap:6px;min-width:0;padding:8px;border:1px solid #2a2a31;border-radius:8px;background:#16161a}
    .mopp small{color:#9a9aa6;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:14px}
    .mopf{position:relative;height:110px;background:#000;border-radius:6px;overflow:hidden;flex:none}
    .mopf img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.mopf img.esp{transform:scaleX(-1)}
    .mopl{display:grid;gap:4px}.mopl.c1{grid-template-columns:1fr}.mopl.c2{grid-template-columns:repeat(2,minmax(0,1fr))}.mopl.c3{grid-template-columns:repeat(3,minmax(0,1fr))}.mopl.some{visibility:hidden}
    .mop button.o{display:flex;align-items:center;justify-content:center;gap:5px;height:28px;padding:0 4px;border:1px solid #2a2c35;background:#1d1f27;color:#9aa0b2;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap}
    .mop button.o:hover:not([disabled]){border-color:#4c8dff;color:#ececf0}.mop button.o[disabled]{opacity:.3;cursor:default}
    .mop button.o.on{background:#4c8dff;border-color:#4c8dff;color:#fff;font-weight:700}
    .mop button.o.oc{visibility:hidden}
    .mop button.o svg{width:15px;height:15px;flex:none}
    .mopr{display:flex;flex-direction:column;gap:6px}.mopr.junto{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.mopr.junto>.mopl{display:contents}
    .mopj{display:flex;flex-direction:column;gap:6px}.mopj .j3l{display:grid;grid-template-columns:90px 1fr 1fr;gap:4px;align-items:center;font-size:12px;color:#9aa0b2}
    .mop .lin2 .gr{height:38px;font-size:.88rem}
    .mop .stt{min-height:0}.mop .stt:empty{display:none}
    .col:nth-child(1)>.lin2.cor{grid-row:6}.col:nth-child(1)>.stt{grid-row:7}.col:nth-child(n+2)>.lin2.rf{grid-row:6}   /* botão "Gerar vídeo corrigido" abaixo do campo; a mensagem desce uma linha */
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
    .avn{flex:1;min-width:140px;height:30px;box-sizing:border-box;border:1px solid #2a2a31;background:#16161a;color:#ececf0;border-radius:8px;padding:0 10px;font-size:.8rem;outline:none}.avn:focus{border-color:#4c8dff}
    .mpc .avn{height:38px;font-size:.88rem;width:100%}
    #s-video{flex-wrap:wrap}
    .andam{position:relative}
    .gdet{position:absolute;top:0;right:0;bottom:0;width:min(560px,100%);z-index:6;background:#121317;border-left:1px solid #2a2a31;box-shadow:-14px 0 34px rgba(0,0,0,.5);padding:18px 22px;overflow:auto;display:flex;flex-direction:column;gap:22px}
    .gdet[hidden]{display:none}
    .gdet .gt{display:flex;align-items:center;justify-content:space-between;font-size:1.1rem;font-weight:700;color:#ececf0}
    .gdet .gx{height:34px;width:34px;border:1px solid #2a2a31;background:#1d1d22;color:#ececf0;border-radius:8px;cursor:pointer;font-size:15px}
    .gdet .cel{display:flex;flex-direction:column;gap:8px}
    .gdet .ctit{font-size:.74rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9a9aa6}
    .gdet .tempo{font-size:.95rem;color:#ececf0;line-height:1.6}.gdet .mut{font-size:.85rem;color:#8e8e9a}
    .gdet .lp{align-self:flex-start;border:0;background:none;padding:0;color:#c9cdda;font:inherit;font-size:.9rem;text-decoration:underline;cursor:pointer}.gdet .lp:hover{color:#7aa9ff}
    .gdet .pbox{display:flex;flex-direction:column;gap:8px;padding:10px;background:#16161a;border:1px solid #2a2a31;border-radius:10px}
    .gdet .pbox .row{display:flex;align-items:center;gap:10px}
    .gdet .etq{position:static;font-size:.72rem;font-weight:600;padding:2px 8px;border-radius:6px;background:rgba(76,141,255,.15);color:#7aa9ff}.gdet .etq.ed{background:rgba(250,204,21,.14);color:#facc15}
    .gdet textarea{width:100%;min-height:220px;resize:vertical;background:#0f1015;color:#c9cdda;border:1px solid #2a2a31;border-radius:8px;padding:10px;font:12px/1.5 ui-monospace,Consolas,monospace;box-sizing:border-box}
    .gdet .cp{align-self:flex-start;height:30px;padding:0 14px;border:1px solid #2a2a31;background:#1d1d22;color:#ececf0;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer}
    .gdet .cp:hover,.gdet .gx:hover{border-color:#4c8dff}
    .gdet .rost img{width:100%;display:block;border-radius:10px;border:1px solid #2a2a31;cursor:zoom-in}
    .gdet .avs{font-size:.8rem;color:#f0a030}
    .rostzoom{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out}.rostzoom img{max-width:94vw;max-height:94vh;border-radius:10px}
    .stt{font-size:.85rem;color:#8e8e9a;min-height:22px;line-height:1.3}.stt.ok{color:#22d366}.stt.bad{color:#f2686a}
    .andam .erro{color:#f2686a;font-size:.85rem}
    @media(max-width:1100px){.cols{grid-template-columns:1fr;grid-template-rows:none;overflow:auto}.col{display:flex;flex-direction:column;gap:10px}.col>*{grid-column:auto!important;grid-row:auto!important}.cartao{min-height:360px}}
  </style>
  <div class="veu" id="veu"><div class="gav"><div class="alca" id="alca" title="Arraste para mudar a largura do painel (duplo clique volta ao tamanho padrão)"></div>
    <header><div class="tit"><svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#161d4a"/><stop offset="1" stop-color="#262b73"/></linearGradient><radialGradient id="lb"><stop offset="0" stop-color="#fcd679" stop-opacity=".55"/><stop offset="1" stop-color="#fcd679" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" rx="110" fill="url(#lg)"/><circle cx="256" cy="256" r="175" fill="url(#lb)"/><polygon fill="#fcd679" points="256,92 282,236 420,256 282,276 256,420 230,276 92,256 230,236"/><polygon fill="#fff6dc" points="256,150 270,242 372,256 270,270 256,370 242,270 140,256 242,242"/><polygon fill="#fcd679" points="385,100 392,128 420,135 392,142 385,170 378,142 350,135 378,128"/><polygon fill="#fcd679" points="131,355 136,375 156,380 136,385 131,405 126,385 106,380 126,375"/></svg><div><h3>Estúdio Eternize · Nova homenagem</h3><small id="cli"></small></div></div><div class="paises" id="paises"><button type="button" class="pais" id="aniv" aria-pressed="false" aria-label="Aniversário" title="Homenagem de ANIVERSÁRIO (1 pessoa): a foto entra numa festa com bolo e sopra as velas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18v1.6H3z" fill="#e8dcc8"/><rect x="4" y="15" width="16" height="6" rx="1.2" fill="#ff8fb3"/><rect x="6" y="10.5" width="12" height="5" rx="1.2" fill="#fff3d6"/><path d="M4 15.4c1.3 1.6 2.6 1.6 4 0 1.4 1.6 2.6 1.6 4 0 1.4 1.6 2.6 1.6 4 0 1.3 1.6 2.5 1.6 4 0v1.2H4z" fill="#fff"/><rect x="7.2" y="6.5" width="1.6" height="4" rx=".5" fill="#4fa3ff"/><rect x="11.2" y="5.5" width="1.6" height="5" rx=".5" fill="#ffd34d"/><rect x="15.2" y="6.5" width="1.6" height="4" rx=".5" fill="#6fd16f"/><path d="M8 3.2c.9 1 .9 2-0 2.8-.9-.8-.9-1.8 0-2.8zM12 2c.9 1 .9 2 0 2.8-.9-.8-.9-1.8 0-2.8zM16 3.2c.9 1 .9 2 0 2.8-.9-.8-.9-1.8 0-2.8z" fill="#ff9a1f"/></svg></button></div><button class="x" id="fechar" aria-label="Fechar" title="Fechar">${IC.fecharG}</button></header>
    <div class="corpo" id="corpo"></div>
    <div class="edit" id="edit"></div>
  </div></div>`;
  const $ = s => sombra.querySelector(s);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // ---- Diário de ocorrências: manda ao Estúdio o que o editor clicou, o que o painel avisou e as mudanças de estado dos pedidos.
  // É só um registro (sem comandos de volta); serve para entender o que aconteceu quando algo "não funcionou". Sem nomes nem telefones de clientes.
  const diarioBuf = []; let diarioT = null;
  const diarioEnviar = () => {
    clearTimeout(diarioT); diarioT = null;
    if (!diarioBuf.length) return;
    const eventos = diarioBuf.splice(0, 40);
    try { chrome.runtime.sendMessage({ tipo: 'diario', eventos }).then(r => { if (!(r && r.ok) && diarioBuf.length < 100) diarioBuf.unshift(...eventos); }).catch(() => { if (diarioBuf.length < 100) diarioBuf.unshift(...eventos); }); } catch (e) {}
    if (diarioBuf.length) diarioT = setTimeout(diarioEnviar, 5000);
  };
  const diario = (ev, dados) => {
    try {
      const r = { t: Math.round(Date.now() / 1000), ev: String(ev).slice(0, 30) };
      try { const c = chatAtual(); if (c && c.id) r.chat = String(c.id).slice(0, 20); } catch (e) {}
      for (const k in (dados || {})) { const v = dados[k]; r[k] = typeof v === 'string' ? v.slice(0, 200) : v; }
      diarioBuf.push(r); if (diarioBuf.length > 200) diarioBuf.shift();
      if (diarioBuf.length >= 15) diarioEnviar(); else if (!diarioT) diarioT = setTimeout(diarioEnviar, 15000);
    } catch (e) {}
  };
  sombra.addEventListener('click', e => {   // qualquer botão do painel
    const b = e.target && e.target.closest && e.target.closest('button, select, a');
    if (b) diario('clique', { b: (b.id || b.className || b.tagName || '').toString().slice(0, 40), txt: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) });
  }, true);
  const diarioVisto = new Map();
  let diarioObsT = null;
  new MutationObserver(() => {   // texto vermelho na tela (erro ou aviso que o editor viu)
    clearTimeout(diarioObsT);
    diarioObsT = setTimeout(() => {
      sombra.querySelectorAll('.stt.bad, .espera.erro, .bad').forEach(el => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        if (!t) return;
        const ult = diarioVisto.get(t) || 0;
        if (Date.now() - ult > 60000) { diarioVisto.set(t, Date.now()); diario('erro_tela', { txt: t }); }
      });
      if (diarioVisto.size > 200) diarioVisto.clear();
    }, 400);
  }).observe(sombra, { subtree: true, childList: true, characterData: true });

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
  const okPronta = () => !!prontaSrc && !!casoDe();
  function pedido(direto) {
    if (modoPronta) {   // prévia já enviada: uma imagem só; o Estúdio gera só o vídeo (Grok); quem sobe vem das marcações
      return { origem: 'leona', chat: chatPainel.id ? chatPainel : chatAtual(), caso: casoDe(), pessoas: [{ n: 1, vivo: false, fotos: [prontaSrc] }],
        opcoes: { pronta: true, ajuste: ajuste.trim(), direto: true } };
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
      opcoes: { semcamisa: idx('semcamisa'), calca: idx('calca'), vestido: idx('vestido'), animal: idx('animal'), bebe: idx('bebe'), crianca: idx('crianca'), chegada, ajuste: ajuste.trim(), direto },
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
    if (emJuntos()) return '<b>Sobem:</b> ' + (n === 3 ? (sobem3(jq).length === 3 ? 'as três pessoas' : sobem3(jq).join(' e ')) : ({ '2f': 'as duas pessoas', '1f2v': 'a da esquerda', '1v2f': 'a da direita' })[jq]) + '.';
    const l = letras(); if (!casoDe()) return '';
    const sobem = [], ficam = [];
    l.split('').forEach((x, i) => (x === 'f' ? sobem : ficam).push('Pessoa ' + (i + 1)));
    return '<b>Sobem:</b> ' + sobem.join(', ') + '.' + (ficam.length ? ' <b>Ficam e acompanham:</b> ' + ficam.join(', ') + '.' : '');
  }
  function setN(k) {
    n = k; if (k !== 2 && k !== 3) juntos = false;
    if (k === 3 && !/^3-[fv]{3}$/.test(jq)) jq = '3-fff'; else if (k === 2 && /^3-/.test(jq)) jq = '2f';   // cada quantidade começa com o seu padrão
    while (pessoas.length < n) pessoas.push(nova());
    pessoas.length = n;
    const livre = pessoas.findIndex(p => !p.foto);   // o marcador vai para a primeira pessoa ainda sem foto
    ativa = livre >= 0 ? livre : Math.min(ativa, n - 1);
  }

  // ---------- recortar a pessoa: o botão ✂ de cada quadrado (P1, P2, P3...) abre esta tela ----------
  // O editor escolhe a foto do cliente, gira se precisar e recorta a pessoa; o recorte vai para aquele quadrado.
  const origens = new Map();   // endereço da foto -> imagem original carregada
  const giros = {};            // endereço da foto -> { rot, flip } lembrado (o número da foto se repete entre contatos): depois de girar uma vez, o próximo recorte já abre certo
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
      ed.src = f.src;
      const g = p.foto === fid && p.edit ? p.edit : (giros[f.src] || { rot: 0, flip: false });
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
        <div style="display:flex;gap:8px"><button class="tb" data-ed="cancelar">Cancelar</button><button class="tb on" data-ed="usar" ${ed.img && !ed.carregando ? '' : 'disabled'} style="padding:9px 18px;font-weight:700">Usar como P${ed.i + 1}</button></div></div>`;
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
    if (ed.carregando) return;   // a foto escolhida ainda está abrindo: a imagem em memória é a ANTERIOR (outra pessoa), não dá para girar nem usar
    const girou = () => { giros[ed.src] = { rot: ed.rot, flip: ed.flip }; ed.crop = { ...CORTE_INICIAL }; desenharEditor(); };   // o giro fica lembrado para os próximos recortes desta foto
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

  const contaOps = () => pessoas.reduce((a, p) => a + ['animal', 'bebe', 'crianca', 'semcamisa', 'calca', 'vestido'].filter(k => p[k]).length, 0) + (ajuste.trim() ? 1 : 0);
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
          <b>${emJuntos() ? (n === 3 ? 'Foto com as três pessoas' : 'Foto com as duas pessoas') : 'P' + (i + 1)}</b>
          <div class="acs"><button data-edit="${i}" title="Recortar esta pessoa de uma foto do cliente" aria-label="Recortar">${IC.tesoura}</button>${f ? `<button data-lim="${i}" title="Tirar a foto" aria-label="Tirar a foto">${IC.fechar}</button>` : ''}</div>
          ${f ? `<img src="${esc(p.editada ? p.editada.thumb : f.src)}">${p.editada ? '<span class="etq">recortada</span>' : ''}` : '<span class="dica">Clique numa foto do chat ou use o botão de tesoura para recortar a pessoa</span>'}
          ${p.busy ? '<div class="ocupado">Abrindo a foto…</div>' : ''}
        </div>
        ${emJuntos() && n === 2 ? `<div class="jq">${['1f2v', '1v2f', '2f'].map(q => BT('', 'data-jq="' + q + '"', NOMEJQ[q], jq === q)).join('')}</div>` : ''}
        ${emJuntos() && n === 3 ? `<div class="jq3">${['Da esquerda', 'Do meio', 'Da direita'].map((nm, k) => `<div class="j3l"><span>${nm}</span><div class="par">${BT('', 'data-j3="' + k + '" data-v="f"', IC.estrela + ' Faleceu', jq[2 + k] === 'f')}${BT('', 'data-j3="' + k + '" data-v="v"', IC.coracao + ' Está viva', jq[2 + k] === 'v')}</div></div>`).join('')}</div>` : ''}
        ${n >= 2 && !emJuntos() ? `<div class="par" data-est="${i}">${BT('', 'data-v="0"', IC.estrela + ' Faleceu', !p.vivo)}${BT('', 'data-v="1"', IC.coracao + ' Está viva', p.vivo)}</div>` : ''}
        ${n >= 2 && n <= 4 && !emJuntos() ? `<div class="par ${todasFalecidas() ? '' : 'escondido'}" data-papel="${i}">${BT('', 'data-pp="espera"', 'No céu', p.papel === 'espera')}${BT('', 'data-pp="chega"', 'Chegou', p.papel === 'chega')}</div>` : ''}
        ${mais && !emJuntos() ? `<div class="duo${aniv ? ' um' : ''}">${BT('sc', 'data-op="crianca"', 'Criança', p.crianca)}${aniv ? '' : BT('sc', 'data-op="bebe"', 'Bebê', p.bebe)}</div>
          <div class="duo${aniv ? ' um' : ''}">${aniv ? '' : BT('sc', 'data-op="animal"', 'Animal', p.animal)}${BT('sc' + (livre ? '' : ' oc'), 'data-op="semcamisa"', 'Sem camisa', p.semcamisa)}</div>
          <div class="duo${livre ? '' : ' oc'}">${BT('sc', 'data-op="calca"', 'Calça', p.calca)}${BT('sc', 'data-op="vestido"', 'Vestido', p.vestido)}</div>` : ''}
      </div>`;
    }).join('');

    const rolEsq = ($('#corpo .esq') || {}).scrollTop || 0, rolDir = ($('#corpo .dir') || {}).scrollTop || 0;   // redesenhar não pode levar as duas colunas de volta ao topo
    $('#corpo').innerHTML = `
      <div class="esq"><div class="sec-t"><h5>Fotos do cliente <span id="nfotos">(${fotosSel.length})</span></h5><button class="troca ${buscando ? 'buscando' : ''}" id="antigas">${rotuloBusca()}</button></div>
        <div class="sec-s">Clique numa foto para colocar na pessoa marcada.</div>
        <div class="fotos">${fotosSel.map(f => `<div class="foto" data-f="${f.id}"><img src="${esc(f.src)}">${uso(f.id)}</div>`).join('') || '<div class="vazio">Nenhuma foto achada neste chat.</div>'}</div>
        ${nossasSel.length ? `<div class="sec-t seg2"><h5>Prévias já enviadas (${nossasSel.length})</h5></div><div class="sec-s">Clique numa prévia para gerar só o vídeo dela.</div><div class="fotos">${nossasSel.map(f => `<div class="foto" data-pronta="${f.id}" style="${modoPronta && prontaSrc === f.src ? 'outline:2px solid #4c8dff' : ''}"><img src="${esc(f.src)}">${modoPronta && prontaSrc === f.src ? '<span class="uso">escolhida</span>' : ''}</div>`).join('')}</div>` : ''}</div>
      <div class="dir" id="dir">
        ${modoPronta ? `<div class="avpr"><div class="l1"><span>Usando uma prévia já enviada</span><button class="troca" id="tirapronta">Cancelar</button></div><div class="l2">${prontaSrc ? 'Só o vídeo será gerado (sem gastar prévia).' : 'Escolha a prévia na coluna ao lado.'}</div></div>` : ''}
        <div class="passo"><b>1</b><span>Quantas pessoas?</span>${n === 2 || n === 3 ? `<button class="troca" id="juntos" aria-pressed="${emJuntos()}" title="As ${n === 3 ? 'três' : 'duas'} pessoas aparecem na mesma foto: cole uma foto só e diga quem faleceu" style="${emJuntos() ? 'background:#4c8dff;color:#fff;border-color:#4c8dff' : ''}">${IC.pessoas} Mesma foto</button>` : ''}</div>
        <div class="seg">${(aniv ? [1] : [1, 2, 3, 4]).map(k => `<button data-n="${k}" class="${k === n ? 'on' : ''}">${k} ${k === 1 ? 'pessoa' : 'pessoas'}</button>`).join('')}${aniv ? '' : `<button data-n="5" class="mais ${n > 4 ? 'on' : ''}" title="Mais pessoas (5 a 8)" aria-label="Mais pessoas, de 5 a 8" style="flex:0 0 44px">+</button>`}</div>
        ${n > 4 ? `<div class="seg">${[5, 6, 7, 8].map(k => `<button data-n="${k}" class="${k === n ? 'on' : ''}">${k} pessoas</button>`).join('')}</div>` : ''}
        ${modoPronta && n < 2 ? '' : `<div class="passo"><b>2</b><span>${modoPronta ? 'Marque quem faleceu' : emJuntos() ? 'Cole a foto com ' + (n === 3 ? 'as três' : 'as duas') + ' e diga quem faleceu' : n >= 2 ? 'Cole as fotos e marque quem faleceu' : 'Cole a foto'}</span>${n >= 2 && n <= 4 && !emJuntos() ? '<button class="troca" id="troca" title="Inverter a ordem (esquerda e direita)">' + IC.trocar + ' Trocar</button>' : ''}</div>`}
        <div class="grade ${n === 1 || emJuntos() ? 'um' : ''}${modoPronta ? ' pr' : ''}">${cartoes}</div>
        ${prob ? `<div class="aviso">${esc(prob)}</div>` : ''}
        <button class="maisop" id="mais">${rotuloMais()}</button>
        ${mais || modoPronta ? `<div class="aj"><label for="aj">${modoPronta ? 'Quer mudar algo no vídeo? (opcional)' : 'Quer mudar algo?'}</label><div style="display:flex;gap:8px;align-items:center"><input id="aj" maxlength="500" placeholder="${modoPronta ? 'Ex.: sem Jesus, ou tirar o copo da mão' : 'Ex.: tirar o copo da mão'}" value="${esc(ajuste)}" style="flex:1">${REC ? '<button class="micb" id="ajmic" type="button" title="Falar em vez de escrever" aria-label="Falar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' : ''}</div><div id="micmsg" class="aviso" style="display:none"></div></div>` : ''}
        <div class="passo" style="margin-top:14px"><b>${modoPronta && n < 2 ? 2 : 3}</b><span>Gerar</span></div>
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
    { const ba = $('#aniv'); if (ba) { ba.classList.toggle('on', aniv); ba.setAttribute('aria-pressed', String(aniv)); $('#paises').hidden = false; } }   // o bolo fica no topo (ligado = pedido de aniversário)
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
      if (p[k] && (k === 'animal' || k === 'bebe')) { p.semcamisa = p.calca = p.vestido = p.crianca = false; p[k === 'animal' ? 'bebe' : 'animal'] = false; }
      if (p[k] && k === 'crianca') p.animal = p.bebe = false;
      if (p[k] && k === 'calca') p.vestido = false;
      if (p[k] && k === 'vestido') p.calca = false;
      desenhar();
    });
    const ant = $('#antigas'); if (ant) ant.onclick = () => { if (buscando) return; const ch = chatAtual().id; completo.delete(ch); buscaFundo(ch); };
    const jb = $('#juntos'); if (jb) jb.onclick = () => { juntos = !juntos; ativa = 0; msg = ''; desenhar(); };
    c.querySelectorAll('[data-jq]').forEach(b => b.onclick = () => { jq = b.dataset.jq; desenhar(); });
    c.querySelectorAll('[data-j3]').forEach(b => b.onclick = () => {   // 3 pessoas na mesma foto: marca quem faleceu em cada posição
      const l = jq.slice(2).split(''); l[+b.dataset.j3] = b.dataset.v;
      if (!l.includes('f')) { msg = '!Pelo menos uma pessoa precisa ter falecido.'; desenhar(); return; }
      jq = '3-' + l.join(''); msg = ''; desenhar(); });
    const troca = $('#troca'); if (troca) troca.onclick = () => { pessoas.reverse(); ativa = 0; desenhar(); };
    $('#mais').onclick = () => { mais = !mais; desenhar(); };
    const mic = $('#ajmic'); if (mic) mic.onclick = () => falar(mic, $('#aj'));
    const aj = $('#aj'); if (aj) aj.oninput = () => { ajuste = aj.value; $('#mais').innerHTML = rotuloMais(); };
    // chave ligada: só os botões "... e enviar" (o arquivo vai sozinho ao cliente); desligada: só os botões comuns (você envia à mão)
    $('#gdireto').onclick = () => enviar(true, autoEnvio);
    if ($('#gprevia')) $('#gprevia').onclick = () => enviar(false, autoEnvio);
    $('#corpo').querySelectorAll('[data-pronta]').forEach(e => e.onclick = () => { const f = ((lembrar() || {}).nossas || []).find(x => x.id === +e.dataset.pronta); if (!f) return; modoPronta = true; prontaSrc = f.src; msg = ''; desenhar(); });
    if ($('#tirapronta')) $('#tirapronta').onclick = () => { modoPronta = false; prontaSrc = ''; desenhar(); };
    if ($('#meuprompt')) $('#meuprompt').onclick = abrirMeuPrompt;
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
    const nf = $('#nfotos'); if (nf) nf.textContent = '(' + fotosSel.length + ')';
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
  const avalLocal = {}; let avalAberto = '', avMot = '', refazerHook = null;   // refazerHook: o botão "Refazer homenagem" do Deu erro chama o refazer da tela aberta
  function pintarAval(vid, servidor) {
    const c = $('#avc'); if (!c) return;
    const a = (vid in avalLocal) ? avalLocal[vid] : servidor;
    let h; const refBt = '<button class="avb" data-av="refazer" title="Gera a prévia e o vídeo de novo">Refazer homenagem</button>';
    if (a) h = `<span class="${a === 'certo' ? 'ok' : 'bad'}" style="font-size:12px">${a === 'certo' ? 'Marcado: deu certo' : 'Marcado: deu erro'}</span><button class="avb" data-av="mudar">mudar</button>` + (a === 'erro' ? refBt : '');
    else h = `<span style="font-size:12px">O vídeo ficou bom?</span><button class="avb ok" data-av="certo">Deu certo</button><button class="avb bad" data-av="erro">Deu erro</button>` + (avalAberto === vid ? (avMot ? `<div class="avm"><span style="font-size:12px;width:100%">Motivo: <b>${esc(avMot)}</b></span><input class="avn" id="avnota" maxlength="300" placeholder="Quer explicar melhor? (opcional)"><button class="avb bad" data-av="enviarerro">Marcar erro</button><button class="avb" data-av="voltar">voltar</button>${refBt}</div>` : `<div class="avm">${MOTIVOS_AVAL.map(m => `<button class="avb" data-mot="${esc(m)}">${esc(m)}</button>`).join('')}${refBt}</div>`) : '');
    if (c.dataset.h === h && c.firstChild) return;   // nada mudou: não redesenha (o campo de texto perdia o que o editor digitava)
    c.dataset.h = h; c.innerHTML = h;
    c.querySelectorAll('[data-av]').forEach(b => { b.onclick = () => {
      if (b.dataset.av === 'refazer') { if (refazerHook) refazerHook(); return; }
      if (b.dataset.av === 'mudar') { avalLocal[vid] = ''; avalAberto = ''; avMot = ''; return pintarAval(vid, servidor); }
      if (b.dataset.av === 'erro') { avalAberto = avalAberto === vid ? '' : vid; avMot = ''; return pintarAval(vid, servidor); }
      if (b.dataset.av === 'voltar') { avMot = ''; return pintarAval(vid, servidor); }
      if (b.dataset.av === 'enviarerro') { const nota = ((c.querySelector('#avnota') || {}).value || '').trim(), mot = avMot; avMot = ''; return enviarAval(vid, 'erro', mot, servidor, nota); }
      enviarAval(vid, 'certo', '', servidor);
    }; });
    c.querySelectorAll('[data-mot]').forEach(b => { b.onclick = () => { avMot = b.dataset.mot; pintarAval(vid, servidor); }; });
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
      const marcar = async (res, mot, nota) => {
        const r = await chrome.runtime.sendMessage({ tipo: 'avaliar', id: v.id, resultado: res, motivo: mot || '', nota: nota || '' }).catch(() => null);
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
        d.querySelectorAll('[data-mot]').forEach(b => { b.onclick = () => telaNota(b.dataset.mot); });
      };
      const telaNota = mot => {
        d.innerHTML = `<div class="mpc"><h3>Motivo: ${esc(mot)}</h3><p>Quer explicar melhor? Ajuda a corrigir o prompt (opcional).</p><input class="avn" id="cvnota" maxlength="300" placeholder="Ex.: Jesus ficou parado no topo e não desceu"><div class="lin"><button class="go" id="cvmarca">Marcar erro</button><button class="go sec" id="cvvolta2">Voltar</button></div><div class="msg" id="cvmsg"></div></div>`;
        d.querySelector('#cvvolta2').onclick = telaMotivo;
        d.querySelector('#cvmarca').onclick = async () => { const bt = d.querySelector('#cvmarca'); bt.disabled = true; bt.textContent = 'Marcando…'; if (await marcar('erro', mot, (d.querySelector('#cvnota').value || '').trim())) telaErro(); else { bt.disabled = false; bt.textContent = 'Marcar erro'; } };
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
  async function enviarAval(vid, resultado, motivo, servidor, nota) {
    const r = await chrome.runtime.sendMessage({ tipo: 'avaliar', id: vid, resultado, motivo, nota: nota || '' }).catch(() => null);
    if (r && r.ok) { avalLocal[vid] = resultado; avalAberto = ''; } else { msg = '!Não consegui marcar agora. ' + ((r && r.erro) || 'Tente de novo.'); }
    pintarAval(vid, servidor);
  }
  // o aplicativo antigo ignora a marcação "Criança" sem avisar: confere a versão antes (devolve o aviso, ou '')
  async function avisoCrianca(ped) {
    if (!((ped.opcoes || {}).crianca || []).length) return '';
    let v = 0; try { const pg = await chrome.runtime.sendMessage({ tipo: 'ping' }); const m = /^(\d+)\.(\d+)/.exec((pg && pg.dados && pg.dados.versao) || ''); if (m) v = +m[1] * 1000 + +m[2]; } catch (e) {}
    return v < 9010 ? 'O aplicativo do Estúdio deste computador ainda não conhece o botão Criança. Feche e abra o aplicativo (ele se atualiza sozinho), ou desmarque Criança.' : '';
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
    { const av = await avisoCrianca(ped); if (av) { msg = '!' + av; return desenhar(); } }
    try { r = await chrome.runtime.sendMessage({ tipo: 'gerar', pedido: ped }); } catch (e) { r = { erro: String(e) }; }
    if (r && r.ok) { try { chrome.storage.local.set({ ['ped_' + r.id]: ped }); if (auto) chrome.storage.local.set({ ['auto_' + r.id]: direto ? 'video' : 'previa' }); } catch (e) {} limparRascunho(chatPainel.id || chatAtual().id); }
    if (!r || !r.ok) {
      msg = '!' + ((r && r.erro) || 'Não achei o Estúdio. Abra o aplicativo e confira a porta no ícone da extensão.');
      return desenhar();
    }
    msg = '';
    const ch = chatPainel.id || chatAtual().id;
    await guardar(ch, r.id);
    acompanhar(r.id, ch);
  }

  // ---------- rascunho do menu por contato (fotos escolhidas, recortes, opções) ----------
  let rascunho = null, tRasc = null;
  const chaveRasc = ch => 'rasc_' + ch;
  async function lerRascunho(ch) { try { return (await chrome.storage.local.get(chaveRasc(ch)))[chaveRasc(ch)] || null; } catch (e) { return null; } }
  function limparRascunho(ch) { modoPronta = false; prontaSrc = ''; marcas.clear(); marcasChat = ''; clearTimeout(tRasc); rascunho = null; try { chrome.storage.local.remove(chaveRasc(ch)); } catch (e) {} }
  function agendarRascunho() {
    if (!$('#veu').classList.contains('on') || !$('#gdireto')) return;   // só quando o menu está na tela (não no andamento)
    const ch = chatPainel.id || chatAtual().id; if (!ch) return;
    clearTimeout(tRasc);
    tRasc = setTimeout(() => {
      const algo = pessoas.some(p => p.foto || p.editada || p.animal || p.bebe || p.crianca || p.semcamisa || p.calca || p.vestido || p.papel) || ajuste.trim() || n > 1;
      if (!algo) { try { chrome.storage.local.remove(chaveRasc(ch)); } catch (e) {} return; }
      const dado = { t: Date.now(), n, juntos, jq, ajuste, mais, pessoas: pessoas.map(p => { const f = p.foto && fotosSel.find(x => x.id === p.foto); return { ...p, foto: null, busy: false, fotoSrc: f ? f.src : null }; }) };
      try { chrome.storage.local.set({ [chaveRasc(ch)]: dado }); } catch (e) {}
    }, 500);
  }
  function aplicarRascunho(final) {   // devolve ao menu o que estava sendo montado neste contato (as fotos são achadas pelo endereço)
    const r = rascunho; if (!r) return;
    if (!final && pessoas.some(p => p.foto)) return;
    jq = r.jq || '2f'; setN(r.n || 1); juntos = !!r.juntos && (n === 2 || n === 3); ajuste = r.ajuste || ''; mais = !!r.mais;
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
        if (alvo === 'video') { try { chrome.storage.local.remove('auto_' + id); } catch (e) {} alvo = ''; }   // o vídeo NÃO vai sozinho: o editor confere e clica em Enviar
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
    const r = await chrome.runtime.sendMessage({ tipo: 'arquivo', id, arquivo: tipo, vid: tipo === 'video' ? (videoMostrado[id] || '') : '' });   // vid: o vídeo que o editor está VENDO é o que vai
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
  // Depois de ENVIAR A PRÉVIA: dispara o fluxo da Leona que manda as mensagens de cobrança (config fluxo_leona_previa; vazio = não faz nada).
  // Só Brasil por enquanto (México e aniversário ficam de fora). Uma vez por chat a cada 24 h: "Refazer prévia" não cobra o cliente de novo.
  async function dispararFluxoPrevia(id, chatId) {
    const k = 'fluxop_chat_' + chatId;
    if (/^aniv-/.test(casosPedido[id] || '')) return '';
    try {
      const ult = (await chrome.storage.local.get(k))[k]; if (ult && Date.now() - ult < 86400000) return '';
      const c = await chrome.runtime.sendMessage({ tipo: 'leona_config' }).catch(() => null);
      const fluxo = c && c.dados && String(c.dados.fluxo_previa || '').replace(/\D/g, ''); if (!fluxo) return '';
      const nomeFluxo = String((c && c.dados && c.dados.fluxo_previa_nome) || '');
      const soChat = c && c.dados && String(c.dados.so_chat || '').replace(/\D/g, ''); if (soChat && String(chatId) !== soChat) return '';   // fase de teste: só nesse chat
      let tk = ''; try { tk = janelaPagina.localStorage.getItem('auth_token') || ''; } catch (e) {}
      if (!tk) return '';
      await chrome.storage.local.set({ [k]: Date.now() });
      const r = await fetch(API_LEONA + '/flows/' + fluxo + '/trigger', { method: 'POST',
        headers: { Authorization: /^Bearer /i.test(tk) ? tk : 'Bearer ' + tk, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: /^\d+$/.test(String(chatId)) ? Number(chatId) : chatId }) });
      if (r.ok) return ' Fluxo de cobrança disparado.';
      if (chatAtual().id === String(chatId) && await dispararFluxoPelaTela(nomeFluxo)) return ' Fluxo de cobrança disparado (pelo botão do chat).';
      try { chrome.storage.local.remove(k); } catch (e) {}
      let t = ''; try { t = (await r.text()).slice(0, 120); } catch (e) {}
      console.warn('[Estúdio] fluxo de cobrança recusado (' + r.status + '): ' + t);
      return ' (O fluxo de cobrança não disparou: ' + r.status + '. Dispare pelo chat.)';
    } catch (e) { console.warn('[Estúdio] fluxo de cobrança:', e); return ''; }
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
          if (tipo !== 'video') { msgEnvio += await dispararFluxoPrevia(id, chatId); }
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
      if (res === 'ok') { const jaTinha = !!(entregasAtual && entregasAtual[tipo]); chrome.runtime.sendMessage({ tipo: 'entregue', id, arquivo: tipo }); msgEnvio = 'Enviei ' + nomeTipo + ' ao cliente.'; if (tipo === 'video' && !jaTinha) msgEnvio += await dispararFluxoFinal(id, chatId); if (tipo !== 'video') msgEnvio += await dispararFluxoPrevia(id, chatId); }
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
  const previas = {};   // pedido -> { previa, video, orig: [urls] } (buscados uma vez só, para o vídeo não reiniciar; recomeça quando o pedido ganha prévia/vídeo NOVO)
  const videoMostrado = {};   // pedido -> id do vídeo que está na tela: é ESSE que o botão Enviar manda ao cliente
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const legenda = (c, juntos) => {
    if (!c) return '';
    if (c === '1p') return '1 pessoa';
    if (/^aniv-/.test(c)) return 'Aniversário · 1 pessoa';
    const l = c.includes('-') ? c.split('-')[1] : ({ '2f': 'ff', '1f2v': 'fv', '1v2f': 'vf' })[c];
    if (!l) return c;
    return l.split('').map((x, i) => 'Pessoa ' + (i + 1) + (x === 'f' ? ' faleceu' : ' viva')).join(' · ') + (juntos ? ' · mesma foto' : '');
  };
  // ---------- "Mais opções": mudar as marcações e gerar de novo com as MESMAS fotos (e recortes) ----------
  const cheio = d => '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + d + '</svg>';
  const IM = {   // os mesmos desenhos dos botões do Estúdio
    fal: cheio('<path d="M12 2.5l2.9 6.2 6.7.8-5 4.6 1.4 6.7L12 17.4l-6 3.4 1.4-6.7-5-4.6 6.7-.8z"/>'),
    viva: cheio('<path d="M12 21l-1.5-1.3C5.4 15.2 2 12.1 2 8.3 2 5.2 4.4 3 7.3 3c1.7 0 3.3.8 4.7 2.2C13.4 3.8 15 3 16.7 3 19.6 3 22 5.2 22 8.3c0 3.8-3.4 6.9-8.5 11.4z"/>'),
    animal: cheio('<ellipse cx="5.5" cy="11" rx="2" ry="2.6" transform="rotate(-20 5.5 11)"/><ellipse cx="9.5" cy="5.8" rx="2.1" ry="2.8"/><ellipse cx="14.5" cy="5.8" rx="2.1" ry="2.8"/><ellipse cx="18.5" cy="11" rx="2" ry="2.6" transform="rotate(20 18.5 11)"/><path d="M12 11.5c-3.2 0-6 3.4-6 6.1 0 2 1.6 2.9 3.3 2.9 1 0 1.8-.5 2.7-.5s1.7.5 2.7.5c1.7 0 3.3-.9 3.3-2.9 0-2.7-2.8-6.1-6-6.1z"/>'),
    bebe: cheio('<path fill-rule="evenodd" d="M12 5.5a8 8 0 100 16 8 8 0 000-16zM9 12.3a1.1 1.1 0 100 2.2 1.1 1.1 0 000-2.2zM15 12.3a1.1 1.1 0 100 2.2 1.1 1.1 0 000-2.2zM9.2 16.8c.7 1 1.7 1.5 2.8 1.5s2.1-.5 2.8-1.5c-.9.5-1.8.7-2.8.7s-1.9-.2-2.8-.7z"/><path d="M12 5.6c-.9-.2-1.5-.9-1.5-1.9 0-1 .8-1.7 1.8-1.7.1.7.9 1 .9 1.8 0 .8-.5 1.5-1.2 1.8z"/>'),
    camisa: cheio('<path d="M8 3L3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 01-8 0z"/>'),
    calca: cheio('<path d="M7 3h10l1 18h-4.5L12 10.5 10.5 21H6z"/>'),
    vestido: cheio('<path d="M9 3h6l1 5-2 3 4 10H6l4-10-2-3z"/>'),
  };
  const letrasDe = c => { const m = /^\d-([fv]+)$/.exec(c || ''); return m ? m[1].split('') : (({ '1p': ['f'], '2f': ['f', 'f'], '1f2v': ['f', 'v'], '1v2f': ['v', 'f'] })[c] || ['f']); };
  const casoDas = L => !L.includes('f') ? '' : L.length === 1 ? '1p' : L.length === 2 ? (L[0] === 'f' ? (L[1] === 'f' ? '2f' : '1f2v') : '1v2f') : L.length + '-' + L.join('');
  const fecharMais = () => { const j = $('#mopd'); if (j) j.remove(); };
  async function maisOpcoes(base, casoTela, thumbs, mandar) {   // base: o pedido guardado; casoTela: marcação escolhida na tela; mandar(ped, direto, fala): envia
    if ($('#mopd')) return;
    const aniversario = /^aniv-/.test(base.caso || ''), juntosPed = !!base.juntos, o = base.opcoes || {};
    const letras = letrasDe(casoTela || base.caso);
    let jqm = casoTela || base.caso;
    const tem = (k, i) => (o[k] || []).includes(i + 1);
    const lista = (base.pessoas || []).map((p, i) => ({ p, flip: false, viva: !juntosPed && letras[i] === 'v',
      thumb: p.imagem ? 'data:' + p.imagem.tipo + ';base64,' + p.imagem.b64 : (thumbs[i] || (p.fotos || [])[0] || ''),
      crianca: tem('crianca', i), semcamisa: tem('semcamisa', i), calca: tem('calca', i), vestido: tem('vestido', i), animal: tem('animal', i), bebe: tem('bebe', i),
      papel: o.chegada && (o.chegada.espera || []).includes(i + 1) ? 'espera' : o.chegada && (o.chegada.chega || []).includes(i + 1) ? 'chega' : '' }));
    const n = lista.length, cols = n > 4 ? Math.ceil(n / 2) : n;
    const caso = () => aniversario ? base.caso : juntosPed ? jqm : casoDas(lista.map(q => q.viva ? 'v' : 'f'));
    const d = document.createElement('div'); d.className = 'mpd'; d.id = 'mopd';
    ($('#veu') || document.body).appendChild(d);
    let aviso = '', ocupadoMais = false;
    const BO = (a, i, txt, on, extra, titulo) => `<button class="o${on ? ' on' : ''}${extra || ''}" data-m="${a}" data-i="${i}" title="${titulo}" aria-label="${titulo}" aria-pressed="${!!on}">${txt}</button>`;
    const cartao = (q, i) => {
      const some = q.animal || q.bebe ? ' oc' : '', todasF = lista.every(x => !x.viva);
      return `<div class="mopp">${n > 1 ? `<small>Pessoa ${i + 1}</small>` : ''}<div class="mopf"><img src="${esc(q.thumb)}" class="${q.flip ? 'esp' : ''}" alt="Foto ${i + 1}"></div>
        <div class="mopl ${n > 1 ? 'c3' : 'c1'}">${n > 1 ? `<button class="o" data-m="mv" data-i="${i}" data-d="-1" title="Mover para a esquerda" aria-label="Mover para a esquerda" ${i === 0 ? 'disabled' : ''}>◀</button>` : ''}${BO('flip', i, IC.espelho, q.flip, '', 'Espelhar a foto')}${n > 1 ? `<button class="o" data-m="mv" data-i="${i}" data-d="1" title="Mover para a direita" aria-label="Mover para a direita" ${i === n - 1 ? 'disabled' : ''}>▶</button>` : ''}</div>
        ${juntosPed ? '' : `${n > 1 ? `<div class="mopl c1">${BO('f', i, IM.fal + 'Faleceu', !q.viva, '', 'Faleceu')}${BO('v', i, IM.viva + 'Viva', q.viva, '', 'Está viva')}</div>` : ''}
        ${n > 1 && n <= 4 ? `<div class="mopl c2${todasF ? '' : ' some'}">${BO('espera', i, 'No céu', q.papel === 'espera', '', 'Já está no céu: espera no meio da escada')}${BO('chega', i, 'Chegou', q.papel === 'chega', '', 'Acabou de falecer: sobe até quem espera')}</div>` : ''}
        <div class="mopl ${aniversario ? 'c1' : 'c2'}">${BO('crianca', i, 'Criança', q.crianca, '', 'É uma criança')}${aniversario ? '' : BO('bebe', i, 'Bebê', q.bebe, '', 'É um bebê (de colo)')}</div>
        <div class="mopr${n > 4 ? ' junto' : ''}"><div class="mopl ${aniversario ? 'c1' : 'c2'}">${aniversario ? '' : BO('animal', i, IM.animal, q.animal, '', 'Animal')}${BO('semcamisa', i, IM.camisa, q.semcamisa, some, 'Sem camisa')}</div>
        <div class="mopl c2">${BO('calca', i, IM.calca, q.calca, some, 'Calça')}${BO('vestido', i, IM.vestido, q.vestido, some, 'Vestido')}</div></div>`}</div>`;
    };
    const pinta = () => {
      const c = caso(), rol = (d.querySelector('.mopg') || {}).scrollTop || 0;
      d.innerHTML = `<div class="mop" style="width:${juntosPed || n === 1 ? 340 : Math.max(380, cols * 128 + 30)}px"><h3>Mais opções<button class="x" data-m="fechar" title="Fechar" aria-label="Fechar">${IC.fechar}</button></h3>
        <div class="mopg" style="grid-template-columns:repeat(${juntosPed ? 1 : cols},minmax(0,${juntosPed || n === 1 ? '1fr' : '150px'}))">${lista.map(cartao).join('')}</div>
        ${juntosPed ? `<div class="mopj">${lista.length && letrasDe(jqm).length === 3
          ? ['Da esquerda', 'Do meio', 'Da direita'].map((nm, k) => `<div class="j3l"><span>${nm}</span>${BO('j3f', k, IM.fal + 'Faleceu', letrasDe(jqm)[k] === 'f', '', nm + ': faleceu')}${BO('j3v', k, IM.viva + 'Viva', letrasDe(jqm)[k] === 'v', '', nm + ': está viva')}</div>`).join('')
          : `<div class="mopl c1">${['1f2v', '1v2f', '2f'].map((q, k) => BO('jq', k, NOMEJQ[q], jqm === q, '', NOMEJQ[q])).join('')}</div>`}</div>` : ''}
        <div class="lin2"><button class="gr" data-m="direto" ${c && !ocupadoMais ? '' : 'disabled'}>${autoEnvio ? 'Gerar homenagem e enviar' : 'Gerar homenagem'}</button><button class="gr sec" data-m="previa" ${c && !ocupadoMais ? '' : 'disabled'}>${autoEnvio ? 'Só a prévia e enviar' : 'Só a prévia'}</button></div>
        <div class="stt ${aviso || !c ? 'bad' : ''}">${esc(aviso || (c ? '' : 'Marque pelo menos uma pessoa que faleceu.'))}</div></div>`;
      d.querySelector('.mopg').scrollTop = rol;
    };
    const fala = (t, ruim) => { const m = d.querySelector('.stt'); if (m) { m.textContent = t; m.className = 'stt' + (ruim ? ' bad' : ''); } };
    const montar = async direto => {
      const todasF = lista.every(q => !q.viva), marcados = lista.map(q => q.papel);
      let chegada = null;
      if (!juntosPed && todasF && n > 1 && n <= 4 && marcados.some(Boolean)) {
        if (marcados.some(x => !x) || !marcados.includes('espera') || !marcados.includes('chega')) return fala('Marque cada pessoa: "No céu" ou "Chegou". Tem que ter pelo menos uma de cada.', true);
        chegada = { espera: marcados.map((x, i) => x === 'espera' ? i + 1 : 0).filter(Boolean), chega: marcados.map((x, i) => x === 'chega' ? i + 1 : 0).filter(Boolean) };
      }
      ocupadoMais = true; d.querySelectorAll('.lin2 .gr').forEach(b => { b.disabled = true; }); fala('Enviando ao Estúdio…');
      const ped = JSON.parse(JSON.stringify(base)); ped.opcoes = ped.opcoes || {}; ped.caso = caso(); ped.opcoes.direto = direto;
      try {
        ped.pessoas = [];
        for (let i = 0; i < n; i++) {
          const q = lista[i], p = { ...q.p, n: i + 1, vivo: q.viva };
          if (q.flip) {   // espelha a foto que está no quadrado (a mesma que foi usada)
            const img = /^https:/.test(q.thumb) ? await carregarOriginal(q.thumb)   // foto ainda no endereço do chat: baixa pelo segundo plano (senão o navegador não deixa girar)
              : await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Não consegui espelhar a foto ' + (i + 1) + '.')); im.src = q.thumb; });
            const blob = await new Promise((ok, no) => renderBase(img, { rot: 0, flip: true }, 1800).toBlob(b => b ? ok(b) : no(new Error('Não consegui espelhar a foto ' + (i + 1) + '.')), 'image/jpeg', 0.92));
            p.imagem = { tipo: 'image/jpeg', b64: await blobParaB64(blob) };
          }
          ped.pessoas.push(p);
        }
      } catch (e) { ocupadoMais = false; pinta(); return fala((e && e.message) || String(e), true); }
      if (!juntosPed) {
        const idx = (k, vale) => lista.map((q, i) => q[k] && (!vale || (!q.animal && !q.bebe)) ? i + 1 : 0).filter(Boolean);
        Object.assign(ped.opcoes, { semcamisa: idx('semcamisa', true), calca: idx('calca', true), vestido: idx('vestido', true), animal: idx('animal'), bebe: idx('bebe'), crianca: idx('crianca', true), chegada });
      }
      const erro = await mandar(ped, direto);
      if (erro) { ocupadoMais = false; pinta(); fala(erro, true); }
    };
    d.onclick = ev => {
      if (ev.target === d) return ocupadoMais ? undefined : fecharMais();
      const b = ev.target.closest && ev.target.closest('[data-m]'); if (!b || b.disabled || ocupadoMais) return;
      const a = b.dataset.m, i = +b.dataset.i, q = lista[i];
      if (a === 'fechar') return fecharMais();
      if (a === 'direto' || a === 'previa') return montar(a === 'direto');
      aviso = '';
      if (a === 'mv') { const j = i + +b.dataset.d; if (!lista[j]) return; [lista[i], lista[j]] = [lista[j], lista[i]]; }
      else if (a === 'flip') q.flip = !q.flip;
      else if (a === 'f' || a === 'v') { q.viva = a === 'v'; if (a === 'v') lista.forEach(x => { x.papel = ''; }); }
      else if (a === 'espera' || a === 'chega') q.papel = q.papel === a ? '' : a;
      else if (a === 'animal' || a === 'bebe') { q[a] = !q[a]; if (q[a]) { q.semcamisa = q.calca = q.vestido = q.crianca = false; q[a === 'animal' ? 'bebe' : 'animal'] = false; } }
      else if (a === 'crianca') { q.crianca = !q.crianca; if (q.crianca) q.animal = q.bebe = false; }
      else if (a === 'semcamisa') q.semcamisa = !q.semcamisa;
      else if (a === 'calca' || a === 'vestido') { q[a] = !q[a]; if (q[a]) q[a === 'calca' ? 'vestido' : 'calca'] = false; }
      else if (a === 'jq') jqm = ['1f2v', '1v2f', '2f'][i];
      else if (a === 'j3f' || a === 'j3v') { const l = jqm.slice(2).split(''); l[i] = a === 'j3f' ? 'f' : 'v'; if (!l.includes('f')) aviso = 'Pelo menos uma pessoa precisa ter falecido.'; else jqm = '3-' + l.join(''); }
      pinta();
    };
    pinta();
  }
  function acompanhar(id, chatId) {
    clearInterval(relogio);
    fecharMais();
    previas[id] = previas[id] || {};
    const nomeChat = chatAtual().nome;
    $('#paises').hidden = true;   // o bolo só vale ao montar um pedido novo
    $('#corpo').innerHTML = `<div class="andam">
      <div class="dh"><h3 id="d-nome">Homenagem</h3><select id="d-hist" hidden aria-label="Homenagens deste chat" title="Homenagens deste chat"></select><small id="d-sub">Chat #${esc(chatId)}${nomeChat ? ' · ' + esc(nomeChat) : ''}</small><button class="bt" id="detalhes" aria-expanded="false" title="Tempos e textos usados">Detalhes</button><button class="bt" id="novo">Nova homenagem neste chat</button></div>
      <div class="cols">
        <section class="col"><div class="ct"><span>1 · Original e refazer</span></div>
          <div class="cartao" id="c-orig"><div class="espera">Abrindo as fotos…</div></div>
          <div class="r3"><div id="jqs" class="jqs-l"></div><button class="gr sec" id="r-mais" title="Mudar as marcações (Faleceu, Viva, Bebê…) e gerar de novo com as mesmas fotos">Mais opções</button></div>
          <div class="aj"><label for="r-aj">Corrigir o prompt</label><input id="r-aj" maxlength="300" placeholder="Ex.: a pessoa do meio não deve subir a escada"></div>
          <div class="lin2 cor"><button class="gr" id="r-corrige" title="Gera outro vídeo da mesma prévia com a sua correção no prompt">Gerar vídeo corrigido</button><button class="gr sec" id="r-cola" title="Cole um prompt feito por você (ex.: no ChatGPT): vai exato ao Grok, sem nada acrescentado">Colar meu prompt</button></div>
          <div class="lin2"><button class="gr" id="r-direto">Gerar homenagem</button><button class="gr sec" id="r-previa">Só a prévia</button></div>
          <div class="stt" id="r-msg"></div></section>
        <section class="col"><div class="ct"><span>2 · Prévia · cliente</span><span id="p-pill"></span></div>
          <div class="cartao" id="c-previa"></div>
          <div class="lin2"><button class="gr" id="e-previa" disabled>Enviar prévia ao cliente</button><button class="gr sec ic" id="f-previa" title="Tela cheia" aria-label="Tela cheia" disabled>${IC.telaCheia}</button><button class="gr sec ic" id="b-previa" title="Baixar a prévia" aria-label="Baixar" disabled>${IC.baixar}</button></div>
          <div class="stt" id="s-previa"></div>
          <div class="lin2 rf"><button class="gr sec" id="r2-previa" title="Gera uma prévia nova a partir das fotos originais (não pede vídeo)">Refazer só a prévia</button></div></section>
        <section class="col"><div class="ct"><span id="v-tit">3 · Vídeo</span><span id="v-pill"></span></div>
          <div class="cartao" id="c-video"></div>
          <div class="lin2"><button class="gr" id="e-video" disabled>Enviar vídeo ao cliente</button><button class="gr sec ic" id="f-video" title="Tela cheia" aria-label="Tela cheia" disabled>${IC.telaCheia}</button><button class="gr sec ic" id="b-video" title="Baixar o vídeo" aria-label="Baixar" disabled>${IC.baixar}</button></div>
          <div class="stt" id="s-video"></div>
          <div class="lin2 rf"><button class="gr sec" id="r2-video" title="Gera um vídeo novo com a MESMA prévia, sem gerar prévia nova">Refazer só o vídeo</button></div></section>
      </div>
      <aside class="gdet" id="gdet" hidden></aside><div class="rodape"><div id="erro"></div><div class="dicac" id="dicaenv"></div><div id="msgenv" class="aviso"></div></div></div>`;
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
    let corrPendente = '', sigDiario = '';   // corrPendente: correção do prompt digitada enquanto a prévia ainda gerava
    // ---- gaveta "Detalhes" (igual à do app): tempos e os textos usados na prévia e no vídeo ----
    let gaveta = false; const promptsPed = {};
    const rostosPed = {}; let rostosBusca = false;   // comparativo dos rostos (o Estúdio calcula; aqui só se mostra a imagem pronta)
    const fmtT = s => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; };
    const aberto = {};   // prompts abertos ("ver prompt")
    let sigGav = '';
    const pintaGaveta = auto => {   // auto: vem da consulta a cada poucos segundos; só redesenha se algo mudou (para não atrapalhar quem está lendo ou copiando)
      const g = $('#gdet'); if (!g) return; g.hidden = !gaveta; const bt = $('#detalhes'); if (bt) bt.setAttribute('aria-expanded', gaveta ? 'true' : 'false');
      if (!gaveta || !dados) return;
      const sg = JSON.stringify([dados.previa && dados.previa.id, dados.video && dados.video.id, dados.video && dados.video.etapas, dados.previa && rostosPed[dados.previa.id] && rostosPed[dados.previa.id].estado]); if (auto === true && sg === sigGav) return; sigGav = sg;
      const d = dados, e = d.video && d.video.etapas; let h = '<div class="gt"><span>Detalhes</span><button class="gx" id="gavx" aria-label="Fechar detalhes">✕</button></div>';
      const pv = d.previa;
      if (pv && pv.id && pv.id !== 'pronta' && pv.estado === 'pronto') {
        const rs = rostosPed[pv.id];
        h += '<div class="cel rost"><div class="ctit">Comparar rostos</div>';
        if (rs && rs.estado === 'pronto') h += `<img src="${rs.img}" alt="Rostos: original e prévia" title="Clique para ampliar">${rs.aviso ? `<div class="avs">${esc(rs.aviso)}</div>` : ''}`;
        else if (rs && (rs.estado === 'erro' || rs.estado === 'sem')) h += `<div class="mut">${esc(rs.msg || 'Não consegui comparar os rostos.')}</div>`;
        else h += `<div class="mut">Procurando os rostos…${rs && rs.espera_s > 25 ? ' (o Estúdio precisa estar aberto neste computador)' : ''}</div>`;
        h += '</div>';
        if (!rs || rs.estado === 'pedido' || rs.estado === 'lendo' || (rs.estado === 'erro' && Date.now() - (rs.quando || 0) > 30000)) buscaRostos(pv.id);
      }
      if (e && e.total != null) h += `<div class="cel"><div class="ctit">Tempos</div><div class="tempo">⏱ ${fmtT(e.total)} no total<br>Prévia ${fmtT(e.previa)} · Vídeo ${fmtT(e.video)} · Montagem ${fmtT(e.montagem)}</div></div>`;
      for (const [nome, ped] of [['Prompt da prévia', d.previa], ['Prompt do vídeo', d.video]]) {
        if (!ped || !ped.id || ped.id === 'pronta') continue;
        const ab = !!aberto[ped.id], p = promptsPed[ped.id];
        h += `<div class="cel"><div class="ctit">${nome}</div><button class="lp" data-vp="${esc(ped.id)}">${ab ? 'esconder prompt' : 'ver prompt'}</button>`;
        if (ab) {
          if (p === undefined) { promptsPed[ped.id] = null; chrome.runtime.sendMessage({ tipo: 'prompt_usado', id: ped.id }).then(r => { promptsPed[ped.id] = (r && r.ok && r.dados) ? r.dados : { texto: '', erro: (r && r.erro) || 'Não consegui abrir.' }; pintaGaveta(); }).catch(() => { promptsPed[ped.id] = { texto: '', erro: 'Não consegui abrir.' }; pintaGaveta(); }); }
          if (p === undefined || p === null) h += '<div class="pbox mut">Carregando…</div>';
          else if (!p.texto) h += `<div class="pbox mut">${esc(p.erro || 'O texto usado não foi guardado para este pedido.')}</div>`;
          else h += `<div class="pbox"><div class="row">${p.origem === 'padrao' ? '<span class="etq">texto padrão</span>' : p.origem === 'editado' ? '<span class="etq ed">editado só neste pedido</span>' : p.origem === 'editor' ? '<span class="etq ed">texto do editor</span>' : ''}<span class="mut">${p.texto.length} letras</span></div><textarea readonly spellcheck="false">${esc(p.texto)}</textarea><button class="cp" data-cp="${esc(ped.id)}">Copiar</button></div>`;
        }
        h += '</div>';
      }
      if (!h.includes('class="cel"')) h += '<div class="cel"><div class="mut">Ainda não há detalhes. Os prompts aparecem assim que a prévia começa a ser gerada, e os tempos quando o vídeo fica pronto.</div></div>';
      const rol = g.scrollTop; g.innerHTML = h; g.scrollTop = rol;
      const x = g.querySelector('#gavx'); if (x) x.onclick = () => { gaveta = false; pintaGaveta(); };
      g.querySelectorAll('.rost img').forEach(im => { im.onclick = () => { const z = document.createElement('div'); z.className = 'rostzoom'; z.innerHTML = '<img>'; z.firstChild.src = im.src; z.onclick = () => z.remove(); document.body.appendChild(z); }; });
      g.querySelectorAll('[data-vp]').forEach(b => { b.onclick = () => { aberto[b.dataset.vp] = !aberto[b.dataset.vp]; pintaGaveta(); }; });
      g.querySelectorAll('[data-cp]').forEach(b => { b.onclick = () => { const tx = (promptsPed[b.dataset.cp] || {}).texto || ''; navigator.clipboard.writeText(tx).then(() => { b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1500); }).catch(() => {}); }; });
    };
    const buscaRostos = pid => {   // pergunta ao Estúdio (a cada 3 s) até o comparativo ficar pronto
      if (rostosBusca) return; rostosBusca = true;
      chrome.runtime.sendMessage({ tipo: 'rostos', id: pid }).then(r => {
        const j = (r && r.ok && r.dados) ? r.dados : { estado: 'erro', msg: (r && r.erro) || 'Não consegui falar com o Estúdio.' };
        rostosPed[pid] = Object.assign({}, j, { quando: Date.now() });
      }).catch(() => { rostosPed[pid] = { estado: 'erro', msg: 'Não consegui falar com o Estúdio.', quando: Date.now() }; }).then(() => {
        rostosBusca = false; sigGav = ''; if (gaveta) { pintaGaveta(); const rs = rostosPed[pid]; if (rs && (rs.estado === 'pedido' || rs.estado === 'lendo')) setTimeout(() => { if (gaveta) pintaGaveta(); }, 3000); }
      });
    };
    $('#detalhes').onclick = () => { gaveta = !gaveta; sigGav = ''; pintaGaveta(); };

    const buscar = async (tipo, n) => {
      const ch = tipo === 'original' ? 'orig' + n : tipo;
      if (previas[id][ch] !== undefined) return;
      previas[id][ch] = null;
      const alvo = previas[id]['id_' + ch];   // vídeo/prévia que estamos buscando; se o pedido ganhar um NOVO enquanto baixa, esta resposta é descartada
      try { const r = await chrome.runtime.sendMessage({ tipo: 'arquivo', id, arquivo: tipo, n, ver: tipo === 'previa' ? 1 : 0, vid: tipo === 'video' ? (videoMostrado[id] || '') : '' });   // ver: só mostrar (original, sem esperar o ffmpeg)
        if (previas[id]['id_' + ch] !== alvo) { delete previas[id][ch]; return; }
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
      dados = d; casosPedido[id] = d.caso || ''; if (gaveta) pintaGaveta(true);
      { const sg = [d.estado, d.previa && d.previa.estado, d.video && d.video.estado, d.video && d.video.id, d.erro || (d.previa && d.previa.erro) || (d.video && d.video.erro) || ''].join('|');
        if (sg !== sigDiario) { sigDiario = sg; diario('estado', { id, e: d.estado, p: d.previa && d.previa.estado, v: d.video && d.video.estado, vid: d.video && d.video.id, ori: d.video && d.video.prompt_origem, er: d.erro || (d.previa && d.previa.erro) || (d.video && d.video.erro) || '' }); } }
      if (corrPendente && d.previa && d.previa.id && d.previa.id !== 'pronta' && d.previa.estado === 'pronto') { const tc = corrPendente; corrPendente = ''; pedirCorrecao(d.previa.id, tc, null); }   // a prévia ficou pronta: gera o vídeo com a correção guardada
      entregasAtual = d.entregas || {};
      const direto = d.direto !== false, ent = d.entregas || {};
      const pronta = !!(d.previa && (d.previa.estado === 'pronto' || d.previa.estado === 'pronta'));
      const videoPronto = !!(direto && d.video && d.video.estado === 'pronto');
      const erro = d.estado === 'duplicado' && !d.previa ? '' : (d.erro || (d.previa && d.previa.erro) || (d.video && d.video.erro) || '');   // "duplicado" não é erro: é uma pergunta com botões, e a consulta continua
      videoMostrado[id] = (d.video && d.video.id) || '';
      for (const [ch, o] of [['previa', d.previa], ['video', d.video]]) {   // Refazer só o vídeo / Tentar novamente criam prévia ou vídeo NOVO neste mesmo pedido: o que estava guardado é de outro
        const idc = (o && o.id) || '', k = 'id_' + ch;
        if (previas[id][k] !== idc) {
          if (previas[id][k] !== undefined && idc) { try { if (previas[id][ch]) URL.revokeObjectURL(previas[id][ch]); } catch (e) {} delete previas[id][ch]; delete previas[id]['err_' + ch]; delete previas[id]['n_' + ch]; if (ultimaPintura) { const cc = $(ch === 'video' ? '#c-video' : '#c-previa'); if (cc) cc.dataset.sig = ''; } }
          previas[id][k] = idc;
        }
      }
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
        $('#r-mais').hidden = !!(d.previa && d.previa.id === 'pronta');   // prévia já enviada: não há fotos para refazer
        // 1 · original
        const fotos = []; for (let k = 0; k < (d.fotos || 0); k++) fotos.push(previas[id]['orig' + k]);
        const sigO = fotos.join('|');
        if ($('#c-orig').dataset.sig !== sigO) { $('#c-orig').dataset.sig = sigO;
          $('#c-orig').innerHTML = fotos.some(Boolean) ? `<div class="orig">${fotos.filter(Boolean).map(u => `<img src="${u}" alt="">`).join('')}</div>` : '<div class="espera">Abrindo as fotos…</div>'; }
        // refazer: só para quem tem o pedido guardado neste computador
        if (/^3-/.test(d.caso || '') && !$('#jqs').dataset.ok) { $('#jqs').dataset.ok = '1';   // 3 pessoas na mesma foto: marcar quem faleceu em cada posição
          const pinta3 = () => {
            $('#jqs').innerHTML = `<div class="jqs3">${['Esquerda', 'Meio', 'Direita'].map((nm, k) => `<div><span>${nm}</span><button data-j3="${k}" data-v="f" class="${jqRef[2 + k] === 'f' ? 'on' : ''}">Faleceu</button><button data-j3="${k}" data-v="v" class="${jqRef[2 + k] === 'v' ? 'on' : ''}">Viva</button></div>`).join('')}</div>`;
            $('#jqs').querySelectorAll('[data-j3]').forEach(b => b.onclick = () => { const l = jqRef.slice(2).split(''); l[+b.dataset.j3] = b.dataset.v; if (!l.includes('f')) return; jqRef = '3-' + l.join(''); pinta3(); });
          };
          pinta3();
        } else if (d.juntos && !/^3-/.test(d.caso || '') && !$('#jqs').dataset.ok) { $('#jqs').dataset.ok = '1';
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
        const sigP = pronta ? 'img|' + up + '|' + (previas[id].err_previa || '') : pe + '|' + (d.previa ? d.previa.estado : 'x' + (d.estado || '') + (demora ? 'd' : '') + (erroPed ? d.erro : ''));   // o cronômetro não entra na assinatura: só o número muda (a roda de espera não recomeça a cada 3 s)
        if (cp.dataset.sig !== sigP) { cp.dataset.sig = sigP;
          cp.innerHTML = pronta && up ? `<img id="im-previa" src="${up}" alt="Prévia">`
            : pronta ? '<div class="espera">' + (previas[id].err_previa ? 'Não consegui abrir a prévia: ' + esc(previas[id].err_previa) + '<br><small>Tentando de novo…</small>' : 'Abrindo a prévia…') + '</div>'
            : dupPed ? `<div class="espera"><b style="font-size:15px">Esse pedido já foi feito agora há pouco.</b><span>Pedir de novo mesmo assim?</span><div style="display:flex;gap:8px;margin-top:10px;justify-content:center"><button class="tb on" data-rep="sim">Pedir de novo</button><button class="tb" data-rep="nao">Cancelar</button></div></div>`
            : erroPed ? `<div class="espera erro">${esc(d.erro || 'Não consegui preparar o pedido.')}<br>Use "Gerar homenagem" ao lado para tentar de novo.</div>`
            : pe === 'erro' ? `<div class="espera erro">A prévia deu erro.</div>`
            : `<div class="espera"><i class="gira"></i><b>${cron('previa', d.previa ? d.previa.inicio : d.inicio)}</b>${msgEspera}${demora && !d.previa ? '<br><small>Está demorando. Confira se o aplicativo do Estúdio está aberto e com a conta entrada.</small>' : ''}</div>`; }
        if (pe === 'agora' && !dupPed) { const tb = cp.querySelector('.espera b'); const t = cron('previa', d.previa ? d.previa.inicio : d.inicio); if (tb && tb.textContent !== t) tb.textContent = t; }
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
          const sigV = videoPronto ? 'vid|' + uv : ve;
          if (cv.dataset.sig !== sigV) { cv.dataset.sig = sigV;
            cv.innerHTML = videoPronto && uv ? `<video id="im-video" src="${uv}" controls muted loop playsinline autoplay></video>`
              : videoPronto ? '<div class="espera">Abrindo o vídeo…</div>'
              : ve === 'erro' ? '<div class="espera erro">O vídeo deu erro.</div>'
              : ve === 'agora' ? `<div class="espera"><i class="gira"></i><b>${cron('video', d.video.inicio)}</b>Gerando o vídeo…</div>`
              : '<div class="espera">O vídeo começa quando a prévia ficar pronta.</div>'; }
          if (ve === 'agora') { const tb = cv.querySelector('.espera b'); const t = cron('video', d.video.inicio); if (tb && tb.textContent !== t) tb.textContent = t; }
          $('#e-video').disabled = !videoPronto; $('#f-video').disabled = !(videoPronto && uv); $('#b-video').disabled = !videoPronto;
          $('#e-video').textContent = ent.video ? 'Enviar o vídeo de novo' : 'Enviar vídeo ao cliente';
          $('#s-video').className = 'stt' + (ent.video ? ' ok' : ''); $('#s-video').innerHTML = (ent.video ? '<span class="env">' + IC.check + ' Enviado ao cliente às ' + esc(hora(ent.video)) + '</span>' : '') + '';
          if (videoPronto && d.video && d.video.id) { ultimoVideo = { id: d.video.id, aval: d.video.aval || '', perguntar: d.perguntar_antes !== false }; pintarAval(d.video.id, d.video.aval || ''); }
        }
        if (!direto) { $('#e-video').disabled = true; $('#f-video').disabled = true; $('#b-video').disabled = true; }
        $('#erro').innerHTML = erro ? `<div class="erro">${esc(erro)}</div>` : '';
        $('#dicaenv').textContent = (autoDe === 'previa' && !ent.previa) ? 'Envio automático ligado: a prévia vai ao cliente sozinha quando ficar pronta.' : (pronta || videoPronto) ? (videoPronto ? 'Confira o vídeo. Se ficou certo, clique em Enviar vídeo ao cliente; se algo deu errado, escreva a correção em "Corrigir o prompt" e gere um vídeo novo.' : autoEnviar ? 'Ao clicar em Enviar, o arquivo vai direto para o chat de origem, mesmo que você esteja em outro.' : 'O arquivo é colocado no chat de origem; você confere e aperta enviar.') : '';
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
    $('#e-video').onclick = () => devolver(id, chatId, 'video', false);
    $('#b-video').onclick = () => devolver(id, chatId, 'video', true);
    $('#f-video').onclick = () => tela(null, '#im-video');
    // refazer: manda o mesmo pedido de novo (com o caso escolhido, na foto única), igual aos botões da primeira coluna do Estúdio
    const refazer = async (direto, limpar) => {
      const m = $('#r-msg'); m.className = 'stt';
      if (chatAtual().id !== chatId) { m.className = 'stt bad'; m.textContent = 'Abra o chat #' + chatId + ' para refazer.'; return; }
      let g; try { const k = 'ped_' + id; g = (await chrome.storage.local.get(k))[k]; } catch (e) {}
      if (!g) { m.className = 'stt bad'; m.textContent = 'Este pedido é antigo: use "Nova homenagem neste chat".'; return; }
      const ped = JSON.parse(JSON.stringify(g)); ped.opcoes = ped.opcoes || {}; ped.opcoes.direto = direto; if (limpar) ped.opcoes.ajuste = '';
      ped.refazer_de = id;   // é a MESMA homenagem (mesmo cliente): o Estúdio mantém o nome e não conta como pedido novo
      if (jqRef && (ped.juntos || (/^3-/.test(jqRef) && /^3-/.test(ped.caso || '')))) {
        ped.caso = jqRef;
        if (!ped.juntos && !ped.opcoes.pronta && /^3-/.test(jqRef) && (ped.pessoas || []).length === 3) ped.pessoas.forEach((q, i) => { q.vivo = jqRef[2 + i] === 'v'; });   // cada pessoa leva a marcação nova
      }
      m.textContent = 'Enviando ao Estúdio…';
      const erro = await mandarDeNovo(ped, direto);
      if (erro) { m.className = 'stt bad'; m.textContent = erro; }
    };
    // envia o pedido refeito e passa a acompanhá-lo; devolve o texto do erro (ou '' quando deu certo)
    const mandarDeNovo = async (ped, direto) => {
      const av = await avisoCrianca(ped); if (av) return av;
      let r; try { r = await chrome.runtime.sendMessage({ tipo: 'gerar', pedido: ped }); } catch (e) { r = { erro: String(e) }; }
      if (!r || !r.ok) return (r && r.erro) || 'Não achei o Estúdio.';
      try { chrome.storage.local.set({ ['ped_' + r.id]: ped }); if (autoEnvio) chrome.storage.local.set({ ['auto_' + r.id]: direto ? 'video' : 'previa' }); } catch (e) {}   // com a chave do envio automático ligada, refazer também envia sozinho
      await guardar(chatId, r.id); acompanhar(r.id, chatId);
      return '';
    };
    $('#r-mais').onclick = async () => {
      const m = $('#r-msg'); m.className = 'stt'; m.textContent = '';
      if (chatAtual().id !== chatId) { m.className = 'stt bad'; m.textContent = 'Abra o chat #' + chatId + ' para refazer.'; return; }
      let g; try { const k = 'ped_' + id; g = (await chrome.storage.local.get(k))[k]; } catch (e) {}
      if (!g || !(g.pessoas || []).length) { m.className = 'stt bad'; m.textContent = 'Este pedido é antigo: use "Nova homenagem neste chat".'; return; }
      const casoTela = jqRef && (g.juntos || (/^3-/.test(jqRef) && /^3-/.test(g.caso || ''))) ? jqRef : '';
      const thumbs = (g.pessoas || []).map((q, k) => previas[id]['orig' + k] || '');
      await maisOpcoes(g, casoTela, thumbs, async (ped, direto) => {
        if (chatAtual().id !== chatId) return 'Abra o chat #' + chatId + ' para refazer.';
        ped.refazer_de = id;
        diario('mais_opcoes', { caso: ped.caso, direto });
        return mandarDeNovo(ped, direto);
      });
    };
    // "Corrigir o prompt": o editor escreve o que deu errado e o Estúdio gera OUTRO vídeo da mesma prévia com essa correção no começo do prompt.
    // Quando esse vídeo for enviado ao cliente, o Estúdio registra a correção (Administração > Prompts dos editores) para melhorar o prompt padrão.
    const pedirCorrecao = async (pvId, txt, bt) => {
      const m = $('#r-msg'); if (m) { m.className = 'stt'; m.textContent = txt ? 'Pedindo o vídeo corrigido…' : 'Pedindo o vídeo novo…'; }
      if (bt) bt.disabled = true;
      let r; try { r = await chrome.runtime.sendMessage({ tipo: 'video_novo', previa_id: pvId, ajuste: txt || undefined }); } catch (e) { r = { erro: String(e) }; }
      if (bt) bt.disabled = false;
      diario(txt ? 'corrige' : 'refaz_video', { ok: !!(r && r.ok), n: txt.length, er: (r && r.erro) || '' });
      const m2 = $('#r-msg');
      if (!r || !r.ok) { if (m2) { m2.className = 'stt bad'; m2.textContent = (r && r.erro) || 'Não achei o Estúdio.'; } return false; }
      const aj = $('#r-aj'); if (aj && txt) aj.value = '';
      acompanhar(id, chatId); return true;
    };
    // a prévia foi feita com uma marcação; se o editor mudou quem faleceu aqui, só um vídeo novo ignoraria a mudança
    const mudouMarcacao = pv => !!(pv && pv.id !== 'pronta' && jqRef && dados && dados.caso && jqRef !== dados.caso);
    const MSG_MARCACAO = 'Você mudou quem faleceu. A prévia atual é da marcação antiga: use Refazer só a prévia.';
    const corrigir = async () => {
      const m = $('#r-msg'); m.className = 'stt';
      if (mudouMarcacao(dados && dados.previa)) { m.className = 'stt bad'; m.textContent = MSG_MARCACAO; return; }
      const txt = (($('#r-aj') || {}).value || '').trim();
      if (!txt) { m.className = 'stt bad'; m.textContent = 'Escreva a correção do prompt: o que deu errado no vídeo.'; return; }
      const pv = dados && dados.previa;
      if (!pv || !pv.id) { m.className = 'stt bad'; m.textContent = 'Espere o pedido aparecer e tente de novo.'; return; }
      const bt = $('#r-corrige');
      if (pv.id !== 'pronta' && pv.estado !== 'pronto') {
        if (pv.estado === 'erro' || pv.erro) { m.className = 'stt bad'; m.textContent = 'A prévia deu erro. Use Só a prévia (ou Tentar novamente) antes de corrigir o vídeo.'; return; }
        let rc; try { rc = await chrome.runtime.sendMessage({ tipo: 'previa_correcao', id: pv.id, correcao: txt }); } catch (e) { rc = null; }
        if (rc && rc.ok) {   // o Estúdio vai pedir o vídeo automático desta homenagem já com a correção: não sai vídeo a mais
          diario('corrige_guardada', { n: txt.length, via: 'direto' });
          $('#r-aj').value = ''; m.className = 'stt ok'; m.textContent = 'Correção guardada: o vídeo desta homenagem já sai com ela quando a prévia ficar pronta.'; return;
        }
        corrPendente = txt; diario('corrige_guardada', { n: txt.length, via: 'fila' });   // sem vídeo automático neste pedido: guarda e pede o vídeo corrigido quando a prévia ficar pronta
        m.className = 'stt ok'; m.textContent = 'Correção guardada: quando a prévia ficar pronta, gero o vídeo corrigido.'; return;
      }
      if (pv.id === 'pronta') {   // prévia já enviada: não há prévia no Estúdio; manda o MESMO pedido de novo (mesma imagem) com a correção
        if (chatAtual().id !== chatId) { m.className = 'stt bad'; m.textContent = 'Abra o chat #' + chatId + ' para corrigir.'; return; }
        let g; try { const k = 'ped_' + id; g = (await chrome.storage.local.get(k))[k]; } catch (e) {}
        if (!g) { m.className = 'stt bad'; m.textContent = 'Este pedido é antigo: use "Nova homenagem neste chat".'; return; }
        const ped = JSON.parse(JSON.stringify(g)); ped.opcoes = ped.opcoes || {}; ped.opcoes.direto = true; ped.opcoes.ajuste = txt; ped.refazer_de = id;
        bt.disabled = true; m.textContent = 'Pedindo o vídeo corrigido…';
        let rp; try { rp = await chrome.runtime.sendMessage({ tipo: 'gerar', pedido: ped }); } catch (e) { rp = { erro: String(e) }; }
        bt.disabled = false;
        diario('corrige', { ok: !!(rp && rp.ok), pronta: 1, n: txt.length, er: (rp && rp.erro) || '' });
        if (!rp || !rp.ok) { m.className = 'stt bad'; m.textContent = (rp && rp.erro) || 'Não achei o Estúdio.'; return; }
        try { chrome.storage.local.set({ ['ped_' + rp.id]: ped }); } catch (e) {}   // o vídeo corrigido nunca é enviado sozinho: o editor confere e envia
        $('#r-aj').value = ''; await guardar(chatId, rp.id); acompanhar(rp.id, chatId);
        return;
      }
      await pedirCorrecao(pv.id, txt, bt);
    };
    $('#r-corrige').onclick = corrigir;
    // "Colar meu prompt": o editor gerou o prompt em outro lugar (ChatGPT etc.). Vai EXATO ao Grok (sem trava de roupa nem nota) para ESTE vídeo só; o resumo dele vai para a lista dos que deram certo.
    const colarPrompt = () => {
      if ($('#cpd')) return;
      const d = document.createElement('div'); d.className = 'mpd'; d.id = 'cpd';
      d.innerHTML = `<div class="mpc"><h3>Colar meu prompt</h3>
        <p>Cole o prompt inteiro. Ele vai exatamente como está para o Grok, só neste vídeo (o padrão não muda).</p>
        <textarea id="cptxt" spellcheck="false" placeholder="Cole aqui o prompt do vídeo"></textarea>
        <input class="avn" id="cpres" maxlength="300" placeholder="Resumo (opcional): o que este prompt faz de diferente. Ex.: Jesus desce mais cedo">
        <div class="lin"><button class="go" id="cpgera">Gerar vídeo com este prompt</button><button class="go sec" id="cpfecha">Cancelar</button><span class="qtd" id="cpqtd"></span></div>
        <div class="msg" id="cpmsg"></div></div>`;
      ($('#veu') || document.body).appendChild(d);
      const ta = d.querySelector('#cptxt'), q = d.querySelector('#cpqtd');
      const fala = (t, ruim) => { const m = d.querySelector('#cpmsg'); m.textContent = t; m.className = 'msg' + (ruim ? ' bad' : ''); };
      ta.oninput = () => { q.textContent = ta.value.length + ' letras'; };
      ta.focus();
      d.querySelector('#cpfecha').onclick = () => d.remove();
      d.querySelector('#cpgera').onclick = async () => {
        const txt = ta.value.trim(), resumo = d.querySelector('#cpres').value.trim();
        if (txt.length < 50) return fala('Cole o prompt inteiro (está muito curto).', true);
        const pv = dados && dados.previa;
        if (!pv || !pv.id) return fala('Espere o pedido aparecer e tente de novo.', true);
        if (pv.id !== 'pronta' && pv.estado !== 'pronto') return fala(pv.estado === 'erro' || pv.erro ? 'A prévia deu erro. Use Só a prévia antes.' : 'Espere a prévia ficar pronta para gerar o vídeo com o seu prompt.', true);
        const bt = d.querySelector('#cpgera'); bt.disabled = true; fala('Pedindo o vídeo…');
        let r;
        if (pv.id === 'pronta') {   // prévia já enviada: o mesmo pedido de novo (mesma imagem), com o prompt colado
          if (chatAtual().id !== chatId) { bt.disabled = false; return fala('Abra o chat #' + chatId + ' para gerar.', true); }
          let g; try { const k = 'ped_' + id; g = (await chrome.storage.local.get(k))[k]; } catch (e) {}
          if (!g) { bt.disabled = false; return fala('Este pedido é antigo: use "Nova homenagem neste chat".', true); }
          const ped = JSON.parse(JSON.stringify(g)); ped.opcoes = ped.opcoes || {}; ped.opcoes.direto = true; ped.opcoes.colado = txt; ped.opcoes.resumo = resumo; ped.refazer_de = id;
          try { r = await chrome.runtime.sendMessage({ tipo: 'gerar', pedido: ped }); } catch (e) { r = { erro: String(e) }; }
          if (r && r.ok) { try { chrome.storage.local.set({ ['ped_' + r.id]: ped }); } catch (e) {} await guardar(chatId, r.id); }
        } else {
          try { r = await chrome.runtime.sendMessage({ tipo: 'video_novo', previa_id: pv.id, colado: txt, resumo }); } catch (e) { r = { erro: String(e) }; }
        }
        bt.disabled = false;
        diario('cola_prompt', { ok: !!(r && r.ok), n: txt.length, er: (r && r.erro) || '' });
        if (!r || !r.ok) return fala((r && r.erro) || 'Não achei o Estúdio.', true);
        d.remove(); acompanhar(pv.id === 'pronta' ? r.id : id, chatId);
      };
    };
    $('#r-cola').onclick = colarPrompt;
    $('#r2-previa').onclick = () => refazer(false);   // só a prévia (fotos originais), sem pedir vídeo
    $('#r2-video').onclick = async () => {   // só o vídeo: a prévia está certa, então não gera prévia nova
      const m = $('#r-msg'); m.className = 'stt';
      const pv = dados && dados.previa;
      if (!pv || !pv.id) { m.className = 'stt bad'; m.textContent = 'Espere o pedido aparecer e tente de novo.'; return; }
      if (mudouMarcacao(pv)) { m.className = 'stt bad'; m.textContent = MSG_MARCACAO; return; }
      if (pv.id === 'pronta') { diario('refaz_video', { pronta: 1 }); return refazer(true, true); }   // prévia já enviada: mesmo pedido de novo (mesma imagem), só o vídeo
      if (pv.estado !== 'pronto') { m.className = 'stt bad'; m.textContent = pv.estado === 'erro' || pv.erro ? 'A prévia deu erro: use Refazer só a prévia.' : 'Espere a prévia ficar pronta para refazer o vídeo.'; return; }
      await pedirCorrecao(pv.id, '', $('#r2-video'));
    };
    refazerHook = () => refazer(true);
    $('#r-direto').onclick = () => refazer(true);
    $('#r-previa').onclick = () => refazer(false);
    pinta(); relogio = setInterval(pinta, 3000);
    clearInterval(cronAtual);
    const cron = cronAtual = setInterval(() => { if (!$('#d-nome')) return clearInterval(cron); if (ultimaPintura && dados) ultimaPintura(); }, 1000);
  }

  async function abrir(novo) {
    clearInterval(relogio);
    fecharMais();   // a janelinha "Mais opções" de um contato nunca fica aberta em cima de outro
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
  function toast(texto) { diario('aviso', { txt: String(texto) }); toastEl.textContent = texto; toastEl.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.style.display = 'none'; }, 3200); }

  async function carregarMarcas() {
    try {
      const ch = chatAtual().id; marcasChat = ch; marcas = new Map();
      if (!ch) return;
      const d = await lerRascunho(ch);
      if (d && Array.isArray(d.pessoas)) {
        d.pessoas.forEach((q, i) => { if (q && q.fotoSrc) { const l = marcas.get(q.fotoSrc) || []; l.push('P' + (i + 1)); marcas.set(q.fotoSrc, l); } });
        if (d.juntos && (d.n === 2 || d.n === 3)) marcas.forEach((l, k) => marcas.set(k, ['Mesma foto']));
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
      d.n = Math.max(d.n || 1, k); if (d.n !== 2 && d.n !== 3) d.juntos = false;
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
  $('#aniv').onclick = () => { aniv = !aniv; if (aniv) setN(1); msg = ''; desenhar(); };   // aniversário é sempre 1 pessoa
  // clicar fora do painel (na área escura) fecha
  $('#veu').addEventListener('mousedown', e => { if (e.target === $('#veu')) $('#veu').classList.remove('on'); });
})();

})();
