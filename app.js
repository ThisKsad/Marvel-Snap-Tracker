// Marvel Snap Tracker – Website
const SUPABASE_URL = 'https://dwsieddjvldzurosjdpp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SREC_XokfKppXeP7rTgnMQ_-2ZyEXMp';
const TABLE = 'snap_matches';

const state = {
  matches: [],
  tab: 'overview',
  range: 0, mode: '', deck: '',
  expanded: null,
  deckDetail: null,
  archDetail: null,
  sort: {},
  editing: null,
};

// ---------------------------------------------------------------- Hilfen
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (w, n) => n ? Math.round(100 * w / n) + ' %' : '–';
const signed = n => (n > 0 ? '+' : '') + n;
const cls = n => n > 0 ? 'pos' : n < 0 ? 'neg' : '';
const fmtDate = d => new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const archetypeOf = m => m.opp_archetype || detectArchetype(m.opponent_cards) || 'Unbekannt';
const isWin = m => m.result === 'win';

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function load(silent) {
  try {
    const rows = await api(`${TABLE}?select=*&order=played_at.desc&limit=5000`);
    const before = state.matches.length;
    state.matches = rows;
    fillFilterOptions();
    render();
    if (silent && rows.length > before && before) toast('Neues Spiel geladen');
  } catch (e) {
    $('#view').innerHTML = `<div class="panel empty">Die Spiele konnten nicht geladen werden.<br><small>${esc(e.message)}</small></div>`;
  }
}

function filtered() {
  const since = state.range ? Date.now() - state.range * 864e5 : 0;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  return state.matches.filter(m => {
    const t = new Date(m.played_at).getTime();
    if (state.range === 1 && t < startOfToday.getTime()) return false;
    if (state.range > 1 && t < since) return false;
    if (state.mode && m.mode !== state.mode) return false;
    if (state.deck && m.deck_name !== state.deck) return false;
    return true;
  });
}

function summarize(list) {
  const n = list.length, w = list.filter(isWin).length, l = list.filter(m => m.result === 'loss').length;
  const cubes = list.reduce((s, m) => s + (m.cubes || 0), 0);
  return { n, w, l, t: n - w - l, cubes, wr: n ? w / n : 0 };
}

function groupBy(list, keyFn) {
  const map = new Map();
  for (const m of list) {
    const k = keyFn(m);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(m);
  }
  return map;
}

function fillFilterOptions() {
  const modes = [...new Set(state.matches.map(m => m.mode).filter(Boolean))].sort();
  const decks = [...new Set(state.matches.map(m => m.deck_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const setOpts = (sel, vals, label, cur) => {
    sel.innerHTML = `<option value="">Alle</option>` + vals.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label(v))}</option>`).join('');
  };
  setOpts($('#fMode'), modes, modeName, state.mode);
  setOpts($('#fDeck'), decks, d => d, state.deck);
}

// sortierbare Tabelle: cols = [{key, label, num, fmt, sortVal}]
function table(id, rows, cols, opts = {}) {
  const s = state.sort[id] || { key: opts.defaultSort || cols[1].key, dir: -1 };
  const col = cols.find(c => c.key === s.key) || cols[1];
  const val = r => (col.sortVal ? col.sortVal(r) : r[col.key]);
  rows = [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    const asc = typeof x === 'string' ? x.localeCompare(y, 'de') : (x ?? -1e9) - (y ?? -1e9);
    return asc * s.dir;   // dir -1 = absteigend, 1 = aufsteigend
  });
  const head = cols.map(c => `<th class="${c.num ? 'num' : ''}" data-sort="${id}:${c.key}">${c.label}${c.key === s.key ? (s.dir === -1 ? ' ↓' : ' ↑') : ''}</th>`).join('');
  const body = rows.map(r => `<tr class="${opts.onClick ? 'click' : ''}" ${opts.onClick ? `data-${opts.onClick}="${esc(r[opts.rowKey])}"` : ''}>` +
    cols.map(c => `<td class="${c.num ? 'num' : ''} ${c.cls ? c.cls(r) : ''}">${c.fmt ? c.fmt(r) : esc(r[c.key])}</td>`).join('') + '</tr>').join('');
  return `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">Keine Daten</td></tr>`}</tbody></table></div>`;
}

function wrCell(w, n) {
  if (!n) return '<span class="muted">–</span>';
  const p = Math.round(100 * w / n);
  return `${p} %<span class="bar" style="width:${Math.max(2, p * 0.4)}px"></span>`;
}

// ---------------------------------------------------------------- Ansichten
function kpis(list) {
  const s = summarize(list);
  return `<div class="kpis">
    <div class="kpi"><div class="lbl">Spiele</div><div class="val">${s.n}</div><div class="sub">${s.w} S · ${s.l} N${s.t ? ' · ' + s.t + ' U' : ''}</div></div>
    <div class="kpi"><div class="lbl">Siegrate</div><div class="val">${s.n ? Math.round(s.wr * 100) + ' %' : '–'}</div><div class="sub">&nbsp;</div></div>
    <div class="kpi"><div class="lbl">Cubes</div><div class="val ${cls(s.cubes)}">${signed(s.cubes)}</div><div class="sub">netto</div></div>
    <div class="kpi"><div class="lbl">Cubes / Spiel</div><div class="val ${cls(s.cubes)}">${s.n ? (s.cubes / s.n).toFixed(2).replace('.', ',') : '–'}</div><div class="sub">&nbsp;</div></div>
  </div>`;
}

function cubeChart(list) {
  const games = [...list].sort((a, b) => new Date(a.played_at) - new Date(b.played_at));
  if (games.length < 2) return '<p class="hint">Der Verlauf erscheint ab zwei Spielen.</p>';
  let sum = 0; const pts = [0, ...games.map(m => (sum += m.cubes || 0))];
  const W = 600, H = 180, P = 28;
  const min = Math.min(0, ...pts), max = Math.max(0, ...pts), span = max - min || 1;
  const x = i => P + (W - P - 8) * i / (pts.length - 1);
  const y = v => 10 + (H - 30) * (1 - (v - min) / span);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cube-Verlauf">
    <line class="zero" x1="${P}" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}"/>
    <path class="line" d="${d}"/>
    <text x="2" y="${y(max) + 4}">${signed(max)}</text>
    ${min < 0 ? `<text x="2" y="${y(min) + 4}">${min}</text>` : ''}
    <text x="${P}" y="${H - 4}">Spiel 1</text>
    <text x="${W - 8}" y="${H - 4}" text-anchor="end">Spiel ${games.length}</text>
  </svg></div>`;
}

function gameRow(m) {
  const res = m.result === 'win' ? 'Sieg' : m.result === 'loss' ? 'Niederlage' : 'Unentschieden';
  const arch = archetypeOf(m);
  const extra = [
    m.retreated === 'me' ? 'retreat' : m.retreated === 'opp' ? 'Gegner retreat' : '',
    m.snapped_me ? 'gesnappt' : '',
  ].filter(Boolean).map(t => `<span class="badge">${t}</span>`).join('');
  const src = m.source === 'manual' ? '<span class="badge accent">Handy</span>' : '';
  const open = state.expanded === m.id;
  return `<div class="game ${m.result}" data-game="${m.id}">
      <span class="stripe"></span>
      <div><div class="title">${esc(m.deck_name || 'Ohne Deck')} <span class="muted">vs.</span> ${esc(arch)}${src}${extra}</div>
        <div class="meta">${res} · ${esc(modeName(m.mode))} · ${fmtDate(m.played_at)}${m.opponent_name ? ' · ' + esc(m.opponent_name) : ''}</div></div>
      <div class="cubes ${cls(m.cubes)}">${signed(m.cubes || 0)}</div>
    </div>${open ? gameDetail(m) : ''}`;
}

function gameDetail(m) {
  const played = new Set(m.cards_played || []);
  const drawn = new Set(m.cards_drawn || []);
  const deck = (m.deck_cards || []).map(c => `<span class="chip ${played.has(c) ? 'played' : ''}" title="${played.has(c) ? 'gespielt' : drawn.has(c) ? 'gezogen' : 'nicht gezogen'}">${esc(cardName(c))}${drawn.has(c) && !played.has(c) ? ' ·' : ''}</span>`).join('');
  const opp = (m.opponent_cards || []).map(c => `<span class="chip">${esc(cardName(c))}</span>`).join('');
  const locs = (m.locations || []).map(l => `<div class="loc ${l.winner || ''}"><div>${esc(cardName(l.id))}</div><div class="p">${l.my_power ?? '?'} : ${l.opp_power ?? '?'}</div></div>`).join('');
  return `<div class="detail">
    ${locs ? `<h4>Locations (du : Gegner)</h4><div class="locs">${locs}</div>` : ''}
    ${deck ? `<h4>Dein Deck <span class="muted" style="text-transform:none">(lila = gespielt, Punkt = nur gezogen)</span></h4><div class="chips">${deck}</div>` : ''}
    ${opp ? `<h4>Gegnerkarten</h4><div class="chips">${opp}</div>` : ''}
    ${m.notes ? `<h4>Notiz</h4><div>${esc(m.notes)}</div>` : ''}
    <div style="margin-top:12px"><button class="btn small" data-edit="${m.id}">Bearbeiten</button></div>
  </div>`;
}

function viewOverview(list) {
  if (!state.matches.length) return emptyState();
  const decks = [...groupBy(list, m => m.deck_name || 'Ohne Deck')].map(([name, g]) => ({ name, ...summarize(g) }))
    .sort((a, b) => b.n - a.n).slice(0, 5);
  const archs = [...groupBy(list, archetypeOf)].map(([name, g]) => ({ name, ...summarize(g) }))
    .sort((a, b) => b.n - a.n).slice(0, 5);
  const mini = rows => rows.length ? `<table><tbody>${rows.map(r => `<tr><td class="name">${esc(r.name)}</td><td class="num">${r.w}–${r.l}</td><td class="num">${wrCell(r.w, r.n)}</td><td class="num ${cls(r.cubes)}">${signed(r.cubes)}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">Noch keine Spiele im Filter.</p>';
  return kpis(list) +
    `<div class="panel"><h3>Cube-Verlauf</h3>${cubeChart(list)}</div>
     <div class="grid2">
       <div class="panel"><h3>Meistgespielte Decks</h3>${mini(decks)}</div>
       <div class="panel"><h3>Häufigste Gegner</h3>${mini(archs)}</div>
     </div>
     <div class="panel" style="padding:0"><h3 style="padding:16px 16px 4px">Letzte Spiele</h3>${list.slice(0, 8).map(gameRow).join('') || '<p class="empty">Keine Spiele im Filter.</p>'}</div>`;
}

function viewGames(list) {
  if (!state.matches.length) return emptyState();
  return `<div class="panel" style="padding:0">${list.map(gameRow).join('') || '<p class="empty">Keine Spiele im Filter.</p>'}</div>`;
}

function deckRows(list) {
  return [...groupBy(list, m => m.deck_name || 'Ohne Deck')].map(([name, g]) => ({ name, ...summarize(g) }));
}

function viewDecks(list) {
  if (state.deckDetail) return viewDeckDetail(list.filter(m => (m.deck_name || 'Ohne Deck') === state.deckDetail));
  return `<div class="panel"><h3>Decks</h3><p class="hint">Antippen für Kartenwerte und Gegner des Decks.</p>` +
    table('decks', deckRows(list), [
      { key: 'name', label: 'Deck', cls: () => 'name' },
      { key: 'n', label: 'Spiele', num: 1 },
      { key: 'rec', label: 'S–N', num: 1, fmt: r => `${r.w}–${r.l}`, sortVal: r => r.w - r.l },
      { key: 'wr', label: 'Siegrate', num: 1, fmt: r => wrCell(r.w, r.n) },
      { key: 'cubes', label: 'Cubes', num: 1, fmt: r => signed(r.cubes), cls: r => cls(r.cubes) },
      { key: 'cpg', label: 'Ø / Spiel', num: 1, fmt: r => (r.cubes / r.n).toFixed(2).replace('.', ','), sortVal: r => r.cubes / r.n },
    ], { onClick: 'deck', rowKey: 'name', defaultSort: 'n' }) + '</div>';
}

function viewDeckDetail(list) {
  return `<button class="btn small back" data-back="deck">← Alle Decks</button>
    <h2 style="margin:4px 0 10px">${esc(state.deckDetail)}</h2>` + kpis(list) +
    `<div class="panel"><h3>Karten in diesem Deck</h3>${cardTable(list, 'deckcards')}</div>
     <div class="panel"><h3>Gegen diese Gegner</h3>${archTable(list, 'deckarchs')}</div>`;
}

function cardStats(list) {
  const map = new Map();
  const get = c => { if (!map.has(c)) map.set(c, { id: c, name: cardName(c), n: 0, w: 0, dn: 0, dw: 0, pn: 0, pw: 0, ndn: 0, ndw: 0, cubes: 0 }); return map.get(c); };
  for (const m of list) {
    if (!m.deck_cards || !m.deck_cards.length) continue;
    const drawn = new Set(m.cards_drawn || []), played = new Set(m.cards_played || []), win = isWin(m) ? 1 : 0;
    for (const c of new Set(m.deck_cards)) {
      const s = get(c); s.n++; s.w += win; s.cubes += m.cubes || 0;
      if (drawn.has(c)) { s.dn++; s.dw += win; } else { s.ndn++; s.ndw += win; }
      if (played.has(c)) { s.pn++; s.pw += win; }
    }
  }
  return [...map.values()];
}

function cardTable(list, id) {
  const rows = cardStats(list);
  if (!rows.length) return '<p class="hint">Kartenwerte gibt es nur für Spiele, die das PC-Programm erfasst hat.</p>';
  return `<p class="hint"><b>Gezogen</b>: Siegrate, wenn die Karte auf deiner Hand war. <b>Gespielt</b>: wenn du sie ausgespielt hast. <b>Nicht gezogen</b>: wenn sie im Deck blieb. Liegt „Gezogen“ deutlich über „Nicht gezogen“, trägt die Karte zum Sieg bei.</p>` +
    table(id, rows, [
      { key: 'name', label: 'Karte', cls: () => 'name' },
      { key: 'n', label: 'Spiele', num: 1 },
      { key: 'dwr', label: 'Gezogen', num: 1, fmt: r => `${wrCell(r.dw, r.dn)} <span class="muted">(${r.dn})</span>`, sortVal: r => r.dn ? r.dw / r.dn : -1 },
      { key: 'pwr', label: 'Gespielt', num: 1, fmt: r => `${wrCell(r.pw, r.pn)} <span class="muted">(${r.pn})</span>`, sortVal: r => r.pn ? r.pw / r.pn : -1 },
      { key: 'nwr', label: 'Nicht gezogen', num: 1, fmt: r => `${wrCell(r.ndw, r.ndn)} <span class="muted">(${r.ndn})</span>`, sortVal: r => r.ndn ? r.ndw / r.ndn : -1 },
    ], { defaultSort: 'n' });
}

function archTable(list, id) {
  const rows = [...groupBy(list, archetypeOf)].map(([name, g]) => ({ name, ...summarize(g) }));
  return table(id, rows, [
    { key: 'name', label: 'Gegner-Deck', cls: () => 'name' },
    { key: 'n', label: 'Spiele', num: 1 },
    { key: 'rec', label: 'S–N', num: 1, fmt: r => `${r.w}–${r.l}`, sortVal: r => r.w - r.l },
    { key: 'wr', label: 'Siegrate', num: 1, fmt: r => wrCell(r.w, r.n) },
    { key: 'cubes', label: 'Cubes', num: 1, fmt: r => signed(r.cubes), cls: r => cls(r.cubes) },
  ], { onClick: id === 'archs' ? 'arch' : null, rowKey: 'name', defaultSort: 'n' });
}

function viewCards(list) {
  return `<div class="panel"><h3>Karten</h3>${state.deck ? '' : '<p class="hint">Tipp: Oben ein Deck wählen, um nur dessen Karten zu sehen.</p>'}${cardTable(list, 'cards')}</div>`;
}

function viewOpponents(list) {
  if (state.archDetail) {
    const g = list.filter(m => archetypeOf(m) === state.archDetail);
    const seen = new Map();
    g.forEach(m => (m.opponent_cards || []).forEach(c => seen.set(c, (seen.get(c) || 0) + 1)));
    const top = [...seen].sort((a, b) => b[1] - a[1]).slice(0, 24);
    return `<button class="btn small back" data-back="arch">← Alle Gegner</button>
      <h2 style="margin:4px 0 10px">gegen ${esc(state.archDetail)}</h2>` + kpis(g) +
      `<div class="panel"><h3>Mit diesen Decks</h3>${table('archdecks', deckRows(g), [
        { key: 'name', label: 'Dein Deck', cls: () => 'name' },
        { key: 'n', label: 'Spiele', num: 1 },
        { key: 'wr', label: 'Siegrate', num: 1, fmt: r => wrCell(r.w, r.n) },
        { key: 'cubes', label: 'Cubes', num: 1, fmt: r => signed(r.cubes), cls: r => cls(r.cubes) },
      ], { defaultSort: 'n' })}</div>
      ${top.length ? `<div class="panel"><h3>Häufig gesehene Karten</h3><div class="chips">${top.map(([c, n]) => `<span class="chip">${esc(cardName(c))} · ${n}</span>`).join('')}</div></div>` : ''}
      <div class="panel" style="padding:0">${g.map(gameRow).join('')}</div>`;
  }
  const seen = new Map();
  list.forEach(m => (m.opponent_cards || []).forEach(c => seen.set(c, (seen.get(c) || 0) + 1)));
  const top = [...seen].sort((a, b) => b[1] - a[1]).slice(0, 30);
  return `<div class="panel"><h3>Gegner-Decks</h3><p class="hint">Bei PC-Spielen wird das Gegner-Deck aus den gesehenen Karten erkannt. Falsch erkannt? Im Spiel auf „Bearbeiten“ tippen und korrigieren.</p>${archTable(list, 'archs')}</div>
    ${top.length ? `<div class="panel"><h3>Meistgesehene Gegnerkarten</h3><div class="chips">${top.map(([c, n]) => `<span class="chip">${esc(cardName(c))} · ${n}</span>`).join('')}</div></div>` : ''}`;
}

function emptyState() {
  return `<div class="panel empty"><h3>Noch keine Spiele</h3>
    Spiele am PC landen automatisch hier, sobald das PC-Programm läuft.<br>
    Handy-Spiele trägst du oben über <b>+ Spiel</b> ein.</div>`;
}

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  const list = filtered();
  const v = { overview: viewOverview, games: viewGames, decks: viewDecks, cards: viewCards, opponents: viewOpponents }[state.tab];
  $('#view').innerHTML = v(list);
}

// ---------------------------------------------------------------- Formular
const OTHER = '__other__';

// Auswahlliste nach Häufigkeit: zuerst Einträge aus den bisherigen Spielen (mit Anzahl),
// dann bekannte Einträge ohne Spiele, am Ende „Anderes …“ für freie Eingabe.
function fillPicker(sel, counts, extra, otherLabel, emptyLabel) {
  const used = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
  const rest = extra.filter(x => !counts.has(x)).sort((a, b) => a.localeCompare(b, 'de'));
  let html = emptyLabel ? `<option value="">${emptyLabel}</option>` : '';
  if (used.length) html += `<optgroup label="Bisher gespielt">${used.map(([v, n]) => `<option value="${esc(v)}">${esc(v)} (${n})</option>`).join('')}</optgroup>`;
  if (rest.length) html += `<optgroup label="${used.length ? 'Weitere' : 'Auswahl'}">${rest.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</optgroup>`;
  html += `<option value="${OTHER}">${otherLabel}</option>`;
  sel.innerHTML = html;
}

function setPicker(sel, input, value) {
  if (value && ![...sel.options].some(o => o.value === value)) {
    sel.value = OTHER; input.hidden = false; input.value = value;
  } else {
    sel.value = value || sel.options[0].value; input.hidden = sel.value !== OTHER; input.value = '';
  }
}

function pickerValue(sel, input) {
  return sel.value === OTHER ? input.value.trim() : sel.value;
}

function fillFormPickers() {
  const deckCounts = new Map();
  state.matches.forEach(m => m.deck_name && deckCounts.set(m.deck_name, (deckCounts.get(m.deck_name) || 0) + 1));
  fillPicker($('#selDeck'), deckCounts, MY_DECKS, 'Anderes Deck …', '');
  const archCounts = new Map();
  state.matches.forEach(m => { const a = m.opp_archetype || detectArchetype(m.opponent_cards); if (a) archCounts.set(a, (archCounts.get(a) || 0) + 1); });
  fillPicker($('#selArch'), archCounts, ARCHETYPE_NAMES, 'Anderes Gegner-Deck …', 'Unbekannt');
}

let formResult = 'win', formCubes = 2;
function setSeg(seg, v) { seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); }
function toLocalInput(d) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); }

function openForm(m) {
  state.editing = m || null;
  $('#formTitle').textContent = m ? 'Spiel bearbeiten' : 'Spiel eintragen';
  const last = state.matches.find(x => x.source === 'manual') || state.matches[0];
  formResult = m ? m.result : 'win';
  formCubes = m ? Math.abs(m.cubes) || 1 : 2;
  setSeg($('#resultSeg'), formResult); setSeg($('#cubeSeg'), formCubes);
  fillFormPickers();
  setPicker($('#selDeck'), $('#inDeck'), m ? m.deck_name || '' : (state.deck || last?.deck_name || ''));
  $('#inMode').value = m ? (m.mode || 'Ranked') : (last?.mode && [...$('#inMode').options].some(o => o.value === last.mode) ? last.mode : 'Ranked');
  if (m && m.mode && ![...$('#inMode').options].some(o => o.value === m.mode)) $('#inMode').add(new Option(modeName(m.mode), m.mode));
  if (m) $('#inMode').value = m.mode || 'Ranked';
  setPicker($('#selArch'), $('#inArch'), m ? (m.opp_archetype || detectArchetype(m.opponent_cards) || '') : '');
  $('#inOpp').value = m ? m.opponent_name || '' : '';
  $('#inRetreat').value = m ? m.retreated || '' : '';
  $('#inDate').value = toLocalInput(m ? m.played_at : new Date());
  $('#inSnap').checked = m ? !!m.snapped_me : false;
  $('#inNotes').value = m ? m.notes || '' : '';
  $('#deleteBtn').hidden = !m;
  $('#formError').textContent = '';
  $('#gameDialog').showModal();
}

async function saveForm(ev) {
  ev.preventDefault();
  const cubes = formResult === 'tie' ? 0 : (formResult === 'win' ? 1 : -1) * formCubes;
  const row = {
    result: formResult, cubes,
    deck_name: pickerValue($('#selDeck'), $('#inDeck')) || null,
    mode: $('#inMode').value,
    opp_archetype: pickerValue($('#selArch'), $('#inArch')) || null,
    opponent_name: $('#inOpp').value.trim() || null,
    retreated: $('#inRetreat').value || null,
    played_at: new Date($('#inDate').value || Date.now()).toISOString(),
    snapped_me: $('#inSnap').checked,
    notes: $('#inNotes').value.trim() || null,
  };
  // automatisch erkannten Archetyp nicht als manuelle Korrektur speichern
  if (state.editing && !state.editing.opp_archetype && row.opp_archetype === detectArchetype(state.editing.opponent_cards)) row.opp_archetype = null;
  $('#saveBtn').disabled = true;
  try {
    if (state.editing) {
      await api(`${TABLE}?id=eq.${state.editing.id}`, { method: 'PATCH', body: JSON.stringify(row) });
      toast('Gespeichert');
    } else {
      await api(TABLE, { method: 'POST', body: JSON.stringify({ ...row, source: 'manual' }) });
      toast('Spiel eingetragen');
    }
    $('#gameDialog').close();
    await load();
  } catch (e) {
    $('#formError').textContent = 'Speichern fehlgeschlagen: ' + e.message;
  } finally { $('#saveBtn').disabled = false; }
}

async function deleteGame() {
  const m = state.editing; if (!m) return;
  $('#confirmText').textContent = `Spiel vom ${fmtDate(m.played_at)} (${m.deck_name || 'ohne Deck'}, ${signed(m.cubes)} Cubes) wirklich löschen?`;
  $('#confirmDialog').showModal();
  $('#confirmDialog').onclose = async () => {
    if ($('#confirmDialog').returnValue !== 'yes') return;
    try {
      await api(`${TABLE}?id=eq.${m.id}`, { method: 'DELETE' });
      $('#gameDialog').close(); toast('Gelöscht'); await load();
    } catch (e) { $('#formError').textContent = 'Löschen fehlgeschlagen: ' + e.message; }
  };
}

// ---------------------------------------------------------------- Ereignisse
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  state.tab = b.dataset.tab; state.deckDetail = null; state.archDetail = null; render();
  try { localStorage.setItem('snap-tab', state.tab); } catch (_) {}
});
$('#fRange').addEventListener('change', e => { state.range = +e.target.value; render(); });
$('#fMode').addEventListener('change', e => { state.mode = e.target.value; render(); });
$('#fDeck').addEventListener('change', e => { state.deck = e.target.value; render(); });

$('#view').addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]');
  if (th) {
    const [id, key] = th.dataset.sort.split(':');
    const cur = state.sort[id];
    state.sort[id] = { key, dir: cur && cur.key === key ? -cur.dir : -1 };
    return render();
  }
  const edit = e.target.closest('[data-edit]');
  if (edit) return openForm(state.matches.find(m => m.id === edit.dataset.edit));
  const back = e.target.closest('[data-back]');
  if (back) { if (back.dataset.back === 'deck') state.deckDetail = null; else state.archDetail = null; return render(); }
  const deck = e.target.closest('tr[data-deck]');
  if (deck) { state.deckDetail = deck.dataset.deck; window.scrollTo(0, 0); return render(); }
  const arch = e.target.closest('tr[data-arch]');
  if (arch) { state.archDetail = arch.dataset.arch; window.scrollTo(0, 0); return render(); }
  const g = e.target.closest('.game');
  if (g) { state.expanded = state.expanded === g.dataset.game ? null : g.dataset.game; render(); }
});

$('#addBtn').addEventListener('click', () => openForm());
for (const [s, i] of [['#selDeck', '#inDeck'], ['#selArch', '#inArch']]) {
  $(s).addEventListener('change', () => { $(i).hidden = $(s).value !== OTHER; if (!$(i).hidden) $(i).focus(); });
}
$('#cancelBtn').addEventListener('click', () => $('#gameDialog').close());
$('#deleteBtn').addEventListener('click', deleteGame);
$('#gameForm').addEventListener('submit', saveForm);
$('#resultSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { formResult = b.dataset.v; setSeg($('#resultSeg'), formResult); } });
$('#cubeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { formCubes = +b.dataset.v; setSeg($('#cubeSeg'), formCubes); } });

$('#themeBtn').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('snap-theme', root.dataset.theme); } catch (_) {}
});

try { const t = localStorage.getItem('snap-tab'); if (t) state.tab = t; } catch (_) {}
load();
setInterval(() => document.visibilityState === 'visible' && load(true), 60000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load(true));
