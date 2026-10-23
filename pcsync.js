// PC-Erfassung im Browser (Chrome/Edge): Die Website liest GameState.json direkt und meldet neue Spiele.
// Kein Programm, kein Skript, nichts im Autostart. Funktioniert, solange der Tracker-Tab (oder die App) offen ist.
const PcSync = (() => {
  const supported = 'showOpenFilePicker' in window;
  const DB = 'snap-tracker', STORE = 'kv', KEY = 'gamestate-handle';
  const GAME_PATH = '%USERPROFILE%\\AppData\\LocalLow\\Second Dinner\\SNAP\\Standalone\\States\\nvprod\\GameState.json';
  let handle = null, timer = null, lastModified = 0, busy = false;
  let status = { state: supported ? 'off' : 'unsupported', text: '' };

  // ---- kleiner Speicher für den Datei-Zugriff (IndexedDB, nötig für Datei-Handles)
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function kv(op, value) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, op === 'get' ? 'readonly' : 'readwrite');
      const st = tx.objectStore(STORE);
      const r = op === 'get' ? st.get(KEY) : op === 'del' ? st.delete(KEY) : st.put(value, KEY);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }

  const sentKey = 'snap-sent-ids';
  function sentIds() { try { return new Set(JSON.parse(localStorage.getItem(sentKey) || '[]')); } catch (_) { return new Set(); } }
  function markSent(id) {
    const s = sentIds(); s.add(id);
    try { localStorage.setItem(sentKey, JSON.stringify([...s].slice(-500))); } catch (_) {}
  }

  function setStatus(state, text) { status = { state, text }; renderBar(); }

  async function check() {
    if (!handle || busy || !PIN) return;
    busy = true;
    try {
      const file = await handle.getFile();
      if (file.lastModified === lastModified) return;
      const text = (await file.text()).replace(/^﻿/, '').trim();
      const m = text.match(/"ClientResultMessage"\s*:\s*\{[^{}]*?"GameId"\s*:\s*"([^"]+)"/);
      if (!m) { lastModified = file.lastModified; return; }            // Partie läuft noch oder Menü
      if (!text.endsWith('}')) return;                                // Datei wird gerade geschrieben
      if (sentIds().has(m[1])) { lastModified = file.lastModified; return; }
      let payload;
      try { payload = JSON.parse(text); } catch (_) { return; }       // unvollständig, nächster Versuch
      const r = await rpc('snap_ingest', { payload, pin: PIN });
      lastModified = file.lastModified;
      if (r.status === 'inserted' || r.status === 'duplicate') markSent(m[1]);
      if (r.status === 'inserted') {
        const c = r.cubes > 0 ? '+' + r.cubes : String(r.cubes);
        const res = r.result === 'win' ? 'Sieg' : r.result === 'loss' ? 'Niederlage' : 'Unentschieden';
        setStatus('on', `Zuletzt: ${res} ${c} Cubes${r.deck ? ' mit ' + r.deck : ''} (${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })})`);
        toast(`Spiel gespeichert: ${res} ${c} Cubes`);
        load(true);
      } else if (r.status === 'wrong_pin' || r.status === 'locked' || r.status === 'no_pin') {
        stop(); setStatus('error', 'PIN wurde abgelehnt. Bitte neu entsperren.');
      }
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { stop(); setStatus('paused', 'Zugriff auf die Spieldatei pausiert.'); }
      else if (e && e.name === 'NotFoundError') setStatus('error', 'Spieldatei nicht gefunden. Bitte neu auswählen.');
      else setStatus('error', 'Senden fehlgeschlagen, neuer Versuch folgt.');
    } finally { busy = false; }
  }

  function start() {
    stop();
    if (status.state !== 'on' || !status.text) setStatus('on', 'Aktiv. Wartet auf das nächste Spiel.');
    check();
    timer = setInterval(check, 5000);
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  async function choose() {
    try {
      const [h] = await window.showOpenFilePicker({
        id: 'snap-gamestate', multiple: false,
        types: [{ description: 'Marvel Snap Spieldatei', accept: { 'application/json': ['.json'] } }],
      });
      if (!h) return;
      if (h.name !== 'GameState.json') { $('#syncError').textContent = 'Bitte genau die Datei GameState.json auswählen.'; return; }
      handle = h;
      try { await kv('put', h); } catch (_) {}   // ohne Speichern: nach Neustart erneut auswählen
      lastModified = 0;
      $('#syncDialog').close();
      start();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      $('#syncError').textContent = (e && e.name === 'SecurityError')
        ? 'Der Browser erlaubt diesen Ordner nicht. Bitte sag Claude Bescheid.'
        : 'Konnte die Datei nicht öffnen: ' + (e && e.message);
    }
  }

  // Nach einem Neustart des Browsers muss der Zugriff oft per Klick bestätigt werden
  async function resume() {
    if (!handle) return;
    try {
      const p = await handle.requestPermission({ mode: 'read' });
      if (p === 'granted') start(); else setStatus('paused', 'Zugriff nicht erlaubt.');
    } catch (e) { setStatus('paused', 'Zugriff nicht erlaubt.'); }
  }

  async function forget() {
    stop(); handle = null; try { await kv('del'); } catch (_) {}
    setStatus('off', ''); $('#syncDialog').close();
  }

  async function init() {
    if (!supported) { renderBar(); return; }
    try { handle = await kv('get'); } catch (_) { handle = null; }
    if (!handle) { setStatus('off', ''); return; }
    let p = 'prompt';
    try { p = await handle.queryPermission({ mode: 'read' }); } catch (_) {}
    if (p === 'granted') start(); else setStatus('paused', 'Ein Klick nötig, damit der Tracker die Spieldatei wieder lesen darf.');
  }

  function renderBar() {
    const bar = $('#syncBar'); if (!bar) return;
    const mobile = matchMedia('(pointer: coarse)').matches;
    if (status.state === 'unsupported' || (mobile && status.state === 'off')) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.dataset.state = status.state;
    const label = { off: 'PC-Erfassung aus', on: 'PC-Erfassung aktiv', paused: 'PC-Erfassung pausiert', error: 'PC-Erfassung: Problem' }[status.state];
    const btn = status.state === 'paused' ? '<button class="btn small" id="syncResume">Fortsetzen</button>'
      : `<button class="btn small" id="syncSetup">${status.state === 'off' ? 'Einrichten' : 'Ändern'}</button>`;
    bar.innerHTML = `<span class="sync-dot"></span><span class="sync-text"><b>${label}</b>${status.text ? ' · ' + esc(status.text) : status.state === 'off' ? ' · Spiele auf diesem PC automatisch erfassen' : ''}</span>${btn}`;
  }

  function openSetup() {
    $('#syncError').textContent = '';
    $('#syncPath').textContent = GAME_PATH;
    $('#syncForget').hidden = !handle;
    $('#syncDialog').showModal();
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#syncSetup')) openSetup();
    else if (e.target.closest('#syncResume')) resume();
    else if (e.target.closest('#syncChoose')) choose();
    else if (e.target.closest('#syncForget')) forget();
    else if (e.target.closest('#syncClose')) $('#syncDialog').close();
    else if (e.target.closest('#syncCopy')) {
      navigator.clipboard.writeText(GAME_PATH).then(() => toast('Pfad kopiert'), () => {
        const r = document.createRange(); r.selectNodeContents($('#syncPath'));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && timer) check(); });

  return { init, get state() { return status.state; } };
})();
