// ==UserScript==
// @name         Estúdio Eternize
// @namespace    eternize.estudio
// @icon         https://raw.githubusercontent.com/omisael-crypto/estudio-eternize-controle-remoto/main/icone.png
// @version      1.1.1
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
// @connect      b-cdn.net
// @connect      leona-production.b-cdn.net
// @connect      raw.githubusercontent.com
// ==/UserScript==

// CARREGADOR do Estúdio Eternize. Este arquivo quase nunca muda: ele baixa o código do controle remoto do GitHub, guarda uma cópia
// e roda. Ao abrir ou recarregar a Leona (e depois de hora em hora) confere se saiu versão nova; quando sai, baixa e recarrega a Leona sozinho assim que o editor
// não estiver no meio de nada (painel fechado, sem mensagem sendo digitada, sem envio em andamento).
(function () {
  'use strict';
  const URL_CODIGO = 'https://raw.githubusercontent.com/omisael-crypto/estudio-eternize-controle-remoto/main/estudio-eternize.js';
  const CONFERIR_A_CADA = 60 * 60 * 1000;   // de hora em hora (e sempre que a Leona é aberta ou recarregada)
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const baixar = () => new Promise((ok, erro) => GM_xmlhttpRequest({
    method: 'GET', url: URL_CODIGO + '?t=' + Math.floor(Date.now() / 60000), timeout: 20000,
    onload: r => (r.status === 200 && /Estúdio Eternize — controle remoto/.test(r.responseText)) ? ok(r.responseText) : erro(new Error('HTTP ' + r.status)),
    onerror: () => erro(new Error('sem conexão')), ontimeout: () => erro(new Error('tempo esgotado')),
  }));
  const rodar = codigo => new Function('GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'GM_registerMenuCommand', 'unsafeWindow', codigo)(
    GM_xmlhttpRequest, GM_getValue, GM_setValue, GM_deleteValue, GM_listValues, GM_registerMenuCommand, w);

  // ---- o editor está ocupado? (para não recarregar no meio do trabalho) ----
  let ultimoToque = Date.now();
  for (const ev of ['mousemove', 'keydown', 'pointerdown', 'wheel']) window.addEventListener(ev, () => { ultimoToque = Date.now(); }, { passive: true, capture: true });
  function ocioso() {
    if (w.__estudioOcupado > 0) return false;                                   // enviando ao chat agora
    const raiz = document.getElementById('estudio-leona-raiz');
    if (raiz && raiz.shadowRoot && raiz.shadowRoot.querySelector('#veu.on')) return false;   // painel do Estúdio aberto
    const caixa = [...document.querySelectorAll('textarea, [contenteditable="true"], input[type=text]')].find(e => /mensagem/i.test((e.getAttribute('placeholder') || '') + (e.getAttribute('aria-label') || '') + (e.getAttribute('data-placeholder') || '')));
    if (caixa && ((caixa.value || caixa.textContent || '').trim().length > 0)) return false;   // mensagem sendo digitada
    return document.visibilityState === 'hidden' || Date.now() - ultimoToque > 90 * 1000;
  }

  let pendente = false;   // já baixou uma versão nova e está esperando o editor ficar livre para recarregar
  function aplicarQuandoLivre() {
    if (pendente) return; pendente = true;
    const espera = setInterval(() => { if (ocioso()) { clearInterval(espera); location.reload(); } }, 15000);
  }
  async function conferir(emUso) {
    try {
      const novo = await baixar();
      GM_setValue('__ultima', Date.now());
      if (novo !== GM_getValue('__codigo', '')) GM_setValue('__codigo', novo);
      if (novo !== emUso) aplicarQuandoLivre();
    } catch (e) { console.warn('[Estúdio Eternize] não consegui conferir atualização:', e && e.message); }
  }

  (async () => {
    const salvo = GM_getValue('__codigo', '');
    try { GM_registerMenuCommand('Atualizar o Estúdio agora', () => location.reload()); } catch (e) {}
    let codigo = salvo;
    // Ao abrir/recarregar a Leona: tenta pegar a versão mais nova ANTES de rodar (espera pouco se já tem uma guardada).
    const tentativa = baixar().then(n => n, () => null);
    const novo = salvo ? await Promise.race([tentativa, new Promise(r => setTimeout(() => r(null), 2500))]) : await tentativa;
    if (novo) { codigo = novo; GM_setValue('__codigo', novo); GM_setValue('__ultima', Date.now()); }
    if (!codigo) { console.error('[Estúdio Eternize] não consegui baixar o código. Confira a internet.'); return; }
    try { rodar(codigo); } catch (e) {
      console.error('[Estúdio Eternize] o Chrome não deixou rodar o código baixado. Instale a versão completa (estudio-completo.user.js).', e);
      return;
    }
    if (salvo && !novo) tentativa.then(n => { if (n) { GM_setValue('__codigo', n); GM_setValue('__ultima', Date.now()); if (n !== codigo) aplicarQuandoLivre(); } });   // a internet estava lenta: aplica quando chegar
    setInterval(() => conferir(codigo), CONFERIR_A_CADA);   // e de hora em hora enquanto a Leona estiver aberta
  })();
})();
