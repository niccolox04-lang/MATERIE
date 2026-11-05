/**
 * Frontend vanilla (zero dipendenze): navigazione lazy, breadcrumbs, ricerca,
 * selettore di livello di lettura (composizione server-side), flashcard/quiz
 * reali sincronizzati col progresso di studio, study mode (pomodoro + WebAudio
 * sintetizzato), AI grounded con provenienza, stampa con watermark server-side.
 */
const $ = (s) => document.querySelector(s);
const plan = () => $("#plan").value;
const headers = () => ({ "x-plan": plan(), "x-user": userId(), "content-type": "application/json" });
let current = null; // nodo corrente
let treeCache = new Map(); // id -> entry albero
let currentSubject = null;
let lastTreeData = null;
let progressState = { studied: {}, mastery: {}, reviews: {}, streak: { days: [] } };
let progressSummary = { studied: 0, avgMastery: 0, due: 0, streak: 0, masteryCount: 0 };
let lastOpened = null;

const USER_KEY = "md-user";
const LEVEL_KEY = "md-level";
const LAST_KEY = "md-last";

function userId() {
  try {
    let u = localStorage.getItem(USER_KEY);
    if (!u) {
      u = "anon-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(USER_KEY, u);
    }
    return u;
  } catch {
    return "local-user";
  }
}

async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.status), { status: r.status, data });
  return data;
}

async function loadSubjects() {
  const { subjects } = await getJSON(`/api/subjects?plan=${plan()}`);
  const ul = $("#subjects");
  ul.innerHTML = "";
  for (const s of subjects) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "tnode";
    b.textContent = s.title;
    b.onclick = () => loadTree(s.subject);
    li.appendChild(b);
    ul.appendChild(li);
  }
}

async function loadTree(subject) {
  const { tree } = await getJSON(`/api/subjects/${subject}?plan=${plan()}`);
  currentSubject = subject;
  lastTreeData = tree;
  paintTree();
}

/* Stato di espansione dei rami (persistito). Di default si aprono le radici. */
const EXPANDED_KEY = "md-expanded";
let expandedState = null;
function loadExpanded() {
  if (expandedState) return expandedState;
  try {
    expandedState = new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) || "null") || []);
  } catch {
    expandedState = new Set();
  }
  return expandedState;
}
function saveExpanded() {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...loadExpanded()]));
  } catch { /* storage non disponibile */ }
}

/** Nodi dell'albero attualmente visibili (esclude i rami compressi). */
function visibleTreeItems() {
  return [...$("#tree").querySelectorAll(".tnode")].filter((b) => b.offsetParent !== null);
}

/** Comprimi/espandi un ramo; `force` true=apri, false=chiudi, assente=inverti. */
function toggleBranch(id, force) {
  const exp = loadExpanded();
  const open = force === undefined ? !exp.has(id) : force;
  if (open) exp.add(id);
  else exp.delete(id);
  saveExpanded();
  paintTree();
  const el = $("#tree").querySelector(`.tnode[data-id="${CSS.escape(id)}"]`);
  if (el) el.focus();
}

/** Apre i rami antenati di un nodo così da renderlo visibile, poi ridipinge. */
function revealNodeInTree(node) {
  const exp = loadExpanded();
  const seen = new Set();
  let cur = node;
  while (cur?.parent && !seen.has(cur.id)) {
    seen.add(cur.id);
    exp.add(cur.parent);
    cur = treeCache.get(cur.parent);
  }
  saveExpanded();
  paintTree();
}

/** Ridipinge l'albero dai dati in cache (rami comprimibili, pallini, nodo attivo). */
function paintTree() {
  const tree = lastTreeData || [];
  treeCache = new Map(tree.map((t) => [t.id, t]));
  const root = $("#tree");
  root.innerHTML = "";
  const kids = new Map();
  for (const t of tree) {
    if (!kids.has(t.parent)) kids.set(t.parent, []);
    kids.get(t.parent).push(t);
  }
  for (const arr of kids.values()) arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // radici: parent null oppure parent non presente (area planned non pubblicata)
  const roots = [...(kids.get(null) || []), ...(kids.get(undefined) || [])].filter(Boolean);
  const orphans = tree.filter((t) => t.parent && !treeCache.has(t.parent));

  const exp = loadExpanded();
  // al primo disegno (nessuno stato salvato) apri le radici
  if (localStorage.getItem(EXPANDED_KEY) === null) {
    roots.forEach((r) => exp.add(r.id));
    saveExpanded();
  }

  let firstItem = true; // roving tabindex: solo il primo nodo è raggiungibile con Tab
  function render(list, host) {
    for (const t of list) {
      const hasKids = (kids.get(t.id) || []).length > 0;
      const isOpen = exp.has(t.id);
      const b = document.createElement("button");
      b.className = "tnode" + (t.locked ? " locked" : "") + (current?.id === t.id ? " active" : "");
      b.setAttribute("role", "treeitem");
      b.dataset.id = t.id;
      b.tabIndex = firstItem ? 0 : -1;
      firstItem = false;
      if (hasKids) b.setAttribute("aria-expanded", String(isOpen));
      const twist = document.createElement("span");
      twist.className = "twist";
      twist.setAttribute("aria-hidden", "true");
      twist.textContent = hasKids ? (isOpen ? "▾" : "▸") : "";
      if (hasKids) twist.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleBranch(t.id);
      });
      const label = document.createElement("span");
      label.className = "tlabel";
      label.textContent = (t.locked ? "🔒 " : "") + t.title;
      b.append(twist, label);
      if (!t.locked) b.onclick = () => openNode(t.id);
      else b.onclick = () => alert(`Nodo premium (${t.required}). Il contenuto resta sul server: passa a ${t.required.toUpperCase()} per leggerlo.`);
      const dot = progressDot(t.id);
      if (dot) b.appendChild(dot);
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = t.type;
      b.appendChild(badge);
      host.appendChild(b);
      const sub = kids.get(t.id) || [];
      if (sub.length) {
        const div = document.createElement("div");
        div.className = "node-children";
        div.setAttribute("role", "group");
        div.hidden = !isOpen;
        host.appendChild(div);
        render(sub, div);
      }
    }
  }
  render(roots, root);
  if (orphans.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = `Nodi con padre non pubblicato: ${orphans.map((o) => o.id).join(", ")}`;
    root.appendChild(p);
  }
}

/** Pallino di progresso accanto al titolo del nodo nell'albero. */
function progressDot(id) {
  const m = progressState.mastery?.[id];
  const studied = progressState.studied?.[id];
  if (m == null && !studied) return null;
  const d = document.createElement("span");
  d.className = "dot" + (m >= 4 ? " dot-ok" : m >= 2 ? " dot-mid" : " dot-low");
  d.title = m != null ? `Padroneggiamento ${m}/5` : "Studiato";
  return d;
}

/* Navigazione da tastiera dell'albero (ARIA tree): frecce su/giù scorrono
 * gli elementi visibili, destra entra nel figlio, sinistra risale al padre,
 * Home/End vanno ai capi. Delegato al contenitore: regge anche i repaint. */
function wireTreeKeys() {
  $("#tree").addEventListener("keydown", (e) => {
    const items = visibleTreeItems();
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const cur = items[i];
    const focus = (el) => {
      if (!el) return;
      e.preventDefault();
      el.focus();
    };
    if (e.key === "ArrowDown") focus(items[Math.min(items.length - 1, i + 1)]);
    else if (e.key === "ArrowUp") focus(items[Math.max(0, i - 1)]);
    else if (e.key === "Home") focus(items[0]);
    else if (e.key === "End") focus(items[items.length - 1]);
    else if (e.key === "ArrowRight") {
      if (cur.getAttribute("aria-expanded") === "false") {
        e.preventDefault();
        toggleBranch(cur.dataset.id, true);
      } else {
        const wrap = cur.nextElementSibling;
        if (wrap?.classList.contains("node-children")) focus(wrap.querySelector(":scope > .tnode"));
      }
    } else if (e.key === "ArrowLeft") {
      if (cur.getAttribute("aria-expanded") === "true") {
        e.preventDefault();
        toggleBranch(cur.dataset.id, false);
      } else {
        const wrap = cur.parentElement;
        if (wrap?.classList.contains("node-children")) {
          const prev = wrap.previousElementSibling;
          if (prev?.classList.contains("tnode")) focus(prev);
        }
      }
    }
  });
}

function crumbTrail(node) {
  const trail = [];
  let cur = node;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift(cur);
    cur = cur.parent ? treeCache.get(cur.parent) || null : null;
  }
  return trail;
}

let openReq = 0; // token anti-risposta-superata per la navigazione

async function openNode(id) {
  const req = ++openReq;
  try {
    const { node } = await getJSON(`/api/nodes/${encodeURIComponent(id)}?plan=${plan()}`);
    if (req !== openReq) return; // è già stato aperto un nodo più recente
    current = node;
    lastOpened = { id: node.id, title: node.title, subject: node.subject };
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(lastOpened));
    } catch { /* storage non disponibile */ }
    revealNodeInTree(node); // apre gli antenati e evidenzia il nodo nell'albero
    $("#dash").hidden = true;
    renderNode(node);
    if (window.matchMedia("(max-width:900px)").matches) setSideOpen(false);
  } catch (e) {
    $("#article").innerHTML = `<p>Nodo non accessibile col piano ${plan()} (${e.message}). Il server ha negato il contenuto (403): nessuna fuga di dati premium.</p>`;
  }
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** Messaggio transitorio in basso a destra (sync, salvataggi offline…). */
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ------------------------------------------------------------------ */
/* Selettore di livello di lettura + rendering dei blocchi composti    */
/* ------------------------------------------------------------------ */

const LEVELS_FALLBACK = [
  { id: "scheda", label: "Scheda rapida", level: "RAPIDA", blurb: "L'idea essenziale in un colpo d'occhio.", hint: "Sintesi + parole semplici" },
  { id: "studio", label: "Studio", level: "COMPLETA", blurb: "Definizioni, esempi, errori tipici e prerequisiti.", hint: "+ definizioni, esempi, errori" },
  { id: "approfondimento", label: "Approfondimento", level: "DETTAGLIATA", blurb: "Livello tecnico, controesempi e dibattito storiografico.", hint: "+ livello tecnico, dibattiti" },
  { id: "dossier", label: "Dossier", level: "ENCYCLOPEDIC", blurb: "Claim con stato di verifica, fonti, collegamenti e quiz.", hint: "+ claim, fonti, collegamenti" },
];
let formatsCache = null;

/** Legge i formati dal server (fonte unica): una sola chiamata bootstrap. */
async function loadFormats() {
  if (formatsCache) return formatsCache;
  try {
    const d = await getJSON("/api/ai/compose", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: "__formats__", format: "scheda" }),
    });
    if (Array.isArray(d.formats) && d.formats.length) {
      formatsCache = d.formats;
      return formatsCache;
    }
  } catch { /* offline o vecchio server: fallback sotto */ }
  formatsCache = LEVELS_FALLBACK;
  return formatsCache;
}

const SOURCE_BADGE = {
  verified: ["ok", "verificato"],
  content_reviewed: ["ok", "fonte letta"],
  verified_metadata: ["warn", "metadati verificati"],
  reachable: ["warn", "raggiungibile"],
  unverified: ["bad", "non verificata"],
};
const CLAIM_BADGE = {
  verified: ["ok", "verificato"],
  partially_verified: ["warn", "parzialmente verificato"],
  unverified: ["bad", "non verificato"],
  disputed: ["warn", "contestato"],
  "non dichiarato": ["warn", "stato non dichiarato"],
};

function badgeHtml(map, key) {
  const [cls, label] = map[key] || ["", key || "—"];
  return `<span class="vbadge vbadge-${cls}">${esc(label)}</span>`;
}

function levelBar(levels, active) {
  return `<div class="levelbar" role="tablist" aria-label="Livello di lettura">` +
    levels.map((f) => `
      <button role="tab" aria-selected="${f.id === active}" data-level="${esc(f.id)}" class="level${f.id === active ? " active" : ""}">
        <span class="level-name">${esc(f.label)}</span>
        <span class="level-pill">${esc(f.level)}</span>
        <span class="level-blurb">${esc(f.blurb || "")}</span>
      </button>`).join("") +
    `</div>`;
}

function renderBlock(b) {
  let inner = `<h3>${esc(b.heading)}</h3>`;
  if (b.kind === "quiz") {
    inner += `<ul class="kb-list">` + (b.items || []).map((q) => `
      <li><strong>${esc(q.q)}</strong>
        <ul class="kb-choices">${(q.choices || []).map((c, i) => `<li${i === q.answer ? ' class="ok"' : ""}>${String.fromCharCode(65 + i)}. ${esc(c)}</li>`).join("")}</ul>
        <p class="hint">Risposta: ${String.fromCharCode(65 + (q.answer ?? 0))} — ${esc((q.choices || [])[q.answer] ?? "")}${q.explanation ? " · " + esc(q.explanation) : ""}</p>
      </li>`).join("") + `</ul>`;
  } else if (b.body && !b.items) {
    inner += String(b.body).split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p.trim())}</p>`).join("");
    if (b.kind === "historiography") {
      for (const [k, label] of [["agreements", "Accordi"], ["disputes", "Dispute"], ["limits", "Limiti"]]) {
        if (b[k]?.length) inner += `<p class="hint"><strong>${label}:</strong> ${b[k].map(esc).join("; ")}</p>`;
      }
    }
  } else if (b.items?.length) {
    const map = { claims: CLAIM_BADGE, sources: SOURCE_BADGE };
    inner += `<ul class="kb-list">` + b.items.map((it) => {
      if (typeof it === "string") return `<li>${esc(it)}</li>`;
      const bdg = it.status ? badgeHtml(map[b.kind] || {}, it.status) : "";
      const sup = it.supportedBy?.length ? ` <code>${it.supportedBy.map(esc).join("</code> <code>")}</code>` : "";
      const note = it.note ? ` <span class="hint">${esc(it.note)}</span>` : "";
      return `<li>${esc(it.text || "")}${sup}${bdg}${note}</li>`;
    }).join("") + `</ul>`;
  }
  return `<section class="kb-sec">${inner}<p class="kb-src">Fonte: ${esc(b.nodeId)}</p></section>`;
}

let levelReq = 0; // token per scartare risposte superate del selettore livello

/* Cache locale dell'ultima composizione per nodo: se la rete manca alla
 * riapertura, si rimostra il documento composto già ricevuto (non generato). */
function composeCacheKey(id) {
  return `md-compose:${id}`;
}
function saveComposeCache(id, res) {
  try {
    localStorage.setItem(composeCacheKey(id), JSON.stringify({ fmt: res.format, res, at: new Date().toISOString() }));
  } catch { /* quota piena: si vive senza cache */ }
}
function loadComposeCache(id) {
  try {
    return JSON.parse(localStorage.getItem(composeCacheKey(id)) || "null");
  } catch {
    return null;
  }
}

async function loadLevel(formatId) {
  if (!current) return;
  const req = ++levelReq;
  const host = $("#reading");
  host.setAttribute("aria-busy", "true");
  host.innerHTML = `<p class="hint">Componendo il livello richiesto dalla knowledge base…</p>`;
  try {
    const res = await getJSON("/api/ai/compose", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: current.id, subject: current.subject || undefined, format: formatId }),
    });
    if (req !== levelReq) return; // l'utente ha già scelto un altro livello
    if (!res.ok) {
      host.innerHTML = `<p class="hint">${esc(res.message || "Contenuto non disponibile per questo livello.")}</p>`;
      return;
    }
    host.innerHTML =
      `<div class="kb-meta">` +
      `<span class="vbadge vbadge-acc">${esc(res.level)}</span>` +
      `<span class="vbadge">${esc(res.stats.words)} parole</span>` +
      `<span class="vbadge">${res.stats.depthOk ? "livello coperto" : "livello parziale"}</span>` +
      `<span class="vbadge vbadge-${res.sources.contentReviewed === res.sources.total && res.sources.total > 0 ? "ok" : "warn"}">${res.sources.contentReviewed}/${res.sources.total} fonti verificate</span>` +
      `</div>` +
      res.blocks.map(renderBlock).join("") +
      (res.notices?.length ? `<div class="kb-notices"><strong>Avvertenze di completezza</strong><ul>${res.notices.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : "");
    saveComposeCache(current.id, res);
  } catch (e) {
    if (req !== levelReq) return;
    // Offline: prima prova l'ultima composizione realmente ricevuta per questo
    // nodo; se non c'è, mostra i campi già scaricati. Mai contenuto generato.
    const cached = loadComposeCache(current.id);
    if (cached?.res?.ok && cached.res.format === formatId) {
      host.innerHTML =
        `<div class="kb-notices"><strong>Offline</strong> — mostro la composizione salvata in locale il ${esc(String(cached.at).slice(0, 16).replace("T", " "))}. Nessun testo è stato generato.</div>` +
        cached.res.blocks.map(renderBlock).join("") +
        (cached.res.notices?.length ? `<div class="kb-notices"><strong>Avvertenze di completezza</strong><ul>${cached.res.notices.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : "");
      return;
    }
    host.innerHTML = renderOfflineFallback(current, e);
  } finally {
    if (req === levelReq) host.setAttribute("aria-busy", "false");
  }
}

/** Fallback offline: campi reali del nodo già in memoria, con avviso esplicito. */
function renderOfflineFallback(n, err) {
  if (!n) return `<p class="hint">Contenuto non disponibile offline.</p>`;
  const ex = n.explanations || {};
  const parts = [];
  if (n.summary) parts.push(`<section class="kb-sec"><h3>In sintesi</h3><p>${esc(n.summary)}</p></section>`);
  if (ex.semplice) parts.push(`<section class="kb-sec"><h3>In parole semplici</h3><p>${esc(ex.semplice)}</p></section>`);
  if (ex.approfondita) parts.push(`<section class="kb-sec"><h3>Spiegazione approfondita</h3><p>${esc(ex.approfondita)}</p></section>`);
  if (ex.tecnica) parts.push(`<section class="kb-sec"><h3>Livello tecnico</h3><p>${esc(ex.tecnica)}</p></section>`);
  for (const [label, items] of [["Definizioni chiave", n.definitions], ["Esempi", n.examples], ["Errori da evitare", n.errorsTypical]]) {
    if (items?.length) parts.push(`<section class="kb-sec"><h3>${label}</h3><ul class="kb-list">${items.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></section>`);
  }
  return `<div class="kb-notices"><strong>Offline</strong> — la composizione server non è raggiungibile (${esc(err?.message || "rete assente")}). Mostrati i campi già scaricati di questo nodo: nessun testo è stato generato.</div>` +
    (parts.join("") || `<p class="hint">Questo nodo non contiene campi di spiegazione scaricabili offline.</p>`);
}

async function wireLevels(n) {
  const bar = $("#levelbar");
  const levels = await loadFormats(); // fonte: il server; fallback locale solo se offline
  let active = "studio";
  try {
    active = localStorage.getItem(LEVEL_KEY) || "studio";
  } catch { /* default */ }
  if (!levels.some((f) => f.id === active)) active = levels[0]?.id || "studio";
  bar.innerHTML = levelBar(levels, active);
  bar.querySelectorAll("[data-level]").forEach((b) => {
    b.onclick = () => {
      const f = b.dataset.level;
      try {
        localStorage.setItem(LEVEL_KEY, f);
      } catch { /* storage non disponibile */ }
      bar.querySelectorAll("[data-level]").forEach((x) => {
        x.classList.toggle("active", x.dataset.level === f);
        x.setAttribute("aria-selected", String(x.dataset.level === f));
      });
      loadLevel(f);
    };
  });
  loadLevel(active);
}

/* ------------------------------------------------------------------ */
/* Progresso: sync col server + barra di stato                         */
/* ------------------------------------------------------------------ */

async function syncProgress() {
  try {
    const d = await getJSON(`/api/progress?plan=${plan()}&user=${encodeURIComponent(userId())}`);
    progressState = d.progress || progressState;
    progressSummary = d.summary || progressSummary;
    renderDash(d.due || []);
    refreshTreeDots();
  } catch { /* offline o endpoint assente: si continua col vecchio stato */ }
}

function refreshTreeDots() {
  if (lastTreeData) paintTree(); // ridipinge l'albero coi pallini aggiornati
}

let lastDue = [];

/* Coda offline: le POST di progresso fatte senza rete vengono accodate in
 * localStorage e rinviate appena la connessione torna. Mai perdere un quiz. */
const QUEUE_KEY = "md-offline-queue";

function enqueue(item) {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    q.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50))); // max 50 attesi
    toast("Salvato offline: lo sincronizzo appena torna la rete.");
  } catch { /* storage non disponibile: niente crash */ }
}

async function flushQueue() {
  let q;
  try {
    q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch { return; }
  if (!q.length) return;
  const left = [];
  let sent = 0;
  for (const item of q) {
    try {
      const r = await fetch(item.url, { method: "POST", headers: headers(), body: JSON.stringify(item.body) });
      if (!r.ok) {
        // 4xx definitivo (es. nodo non più entitled col piano attuale): scarta.
        // 5xx o rete: tiene e riprova al prossimo flush.
        if (r.status >= 400 && r.status < 500) continue;
        left.push(item);
        continue;
      }
      const d = await r.json();
      if (d.summary) {
        progressSummary = d.summary;
        progressState = d.progress || progressState;
      }
      sent++;
    } catch {
      left.push(item);
      break; // rete ancora assente: si ferma qui
    }
  }
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(left));
  } catch { /* storage non disponibile */ }
  if (sent) {
    renderDash(lastDue);
    refreshTreeDots();
    toast(sent === 1 ? "1 operazione sincronizzata." : `${sent} operazioni sincronizzate.`);
  }
}

function markStudied(nodeId) {
  fetch("/api/progress", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ type: "studied", nodeId }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then((d) => {
      if (d.summary) {
        progressSummary = d.summary;
        progressState = d.progress || progressState;
        renderDash(lastDue);
        refreshTreeDots();
      }
    })
    .catch(() => {
      // offline o errore transitorio: accoda e riprova al ritorno della rete
      enqueue({ url: "/api/progress", body: { type: "studied", nodeId }, at: new Date().toISOString() });
    });
}

function reportQuiz(nodeId, score) {
  fetch("/api/progress", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ type: "quiz", nodeId, score }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then((d) => {
      if (d.summary) {
        progressSummary = d.summary;
        progressState = d.progress || progressState;
        renderDash(lastDue);
        refreshTreeDots();
      }
      const box = $("#score");
      if (box && d.mastery != null) {
        box.textContent += ` · padroneggiamento ${d.mastery}/5 · prossimo ripasso tra ${d.reviewDays} giorni`;
      }
    })
    .catch(() => {
      enqueue({ url: "/api/progress", body: { type: "quiz", nodeId, score }, at: new Date().toISOString() });
      const box = $("#score");
      if (box) box.textContent += " · salvato offline, sincronizzato appena torna la rete";
    });
}

/* ------------------------------------------------------------------ */
/* Rendering del nodo                                                   */
/* ------------------------------------------------------------------ */

function renderNode(n) {
  const trail = crumbTrail(n);
  $("#crumbs").innerHTML = trail.map((t, i) =>
    i < trail.length - 1 ? `<button data-id="${esc(t.id)}">${esc(t.title)}</button> › ` : esc(t.title)).join("");
  $("#crumbs").querySelectorAll("button").forEach((b) => (b.onclick = () => openNode(b.dataset.id)));

  const rel = (n.relations || []).map((r) => {
    const target = treeCache.get(r.to);
    const label = target ? esc(target.title) : esc(r.to);
    const locked = target?.locked;
    return `<li class="rel"><strong>${esc(r.type)}</strong> → ${locked ? `🔒 ${label}` : `<button data-rel="${esc(r.to)}">${label}</button>`} <span class="hint">${esc(r.note || "")}</span></li>`;
  }).join("");
  const src = (n.sources || []).map((s) => {
    const vs = s.verificationStatus || (s.verified ? "content_reviewed" : "unverified");
    const vsLabel = SOURCE_BADGE[vs]?.[1] || esc(vs);
    const vsCls = SOURCE_BADGE[vs]?.[0] || "";
    const supports = (s.supports || []).length ? ` — sostiene: ${esc(s.supports.join("; "))}` : "";
    return `<li class="src">${esc(s.title)}${s.author ? ` — ${esc(s.author)}` : ""} (${esc(s.sourceType)}, <span class="vbadge vbadge-${vsCls}">${esc(vsLabel)}</span>)${supports} ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : ""}</li>`;
  }).join("");
  const claims = (n.claims || []).map((c) => `<li><strong>${esc(c.id)}</strong>: ${esc(c.statement)} <span class="vbadge vbadge-${CLAIM_BADGE[c.status]?.[0] || ""}">${esc(CLAIM_BADGE[c.status]?.[1] || c.status || "—")}</span> <span class="hint">[${(c.supportedBy || []).map(esc).join(", ")}]</span></li>`).join("");

  const m = progressState.mastery?.[n.id];
  const studiedAt = progressState.studied?.[n.id];

  $("#article").innerHTML = `
    <h1>${esc(n.title)}</h1>
    <p class="meta-line">
      <span class="badge">${esc(n.type)}</span><span class="badge">${esc(n.access)}</span>${n.level ? `<span class="badge">${esc(n.level)}</span>` : ""}<span class="badge">v${n.version}</span>
      ${m != null ? `<span class="vbadge vbadge-acc">padroneggiamento ${m}/5</span>` : ""}
      ${studiedAt ? `<span class="hint">studiato il ${esc(String(studiedAt).slice(0, 10))}</span>` : ""}
    </p>
    <p class="summary">${esc(n.summary)}</p>
    <div id="levelbar" role="tablist" aria-label="Livello di lettura"></div>
    <div id="reading" aria-live="polite"></div>
    <details class="card details">
      <summary>Mappa, fonti e affermazioni</summary>
      ${(n.relations?.length) ? `<h3>Collegamenti</h3><ul>${rel}</ul>` : ""}
      <h3>Fonti</h3>${src ? `<ul>${src}</ul>` : `<p class="hint">Nessuna fonte esterna ancora verificata per questo nodo: i fatti derivano dalla redazione e saranno corredati prima dell'estensione.</p>`}
      ${claims ? `<h3>Affermazioni chiave</h3><ul>${claims}</ul>` : ""}
    </details>
    <div class="actions">
      <button id="btn-studied" class="btn">Segna come studiato</button>
      <button id="print-btn-2" class="btn">Stampa nodo</button>
    </div>`;
  $("#article").querySelectorAll("[data-rel]").forEach((b) => (b.onclick = () => openNode(b.dataset.rel)));
  $("#btn-studied").onclick = () => {
    markStudied(n.id);
    $("#btn-studied").textContent = "Segnato ✓";
    $("#btn-studied").disabled = true;
  };
  $("#print-btn-2").onclick = () => $("#print-btn").click();
  wireLevels(n);
  renderLearn(n);
  $("#node").focus();
}

function renderLearn(n) {
  const has = (n.learning?.flashcards?.length || n.learning?.quiz?.length || n.learning?.questionsOpen?.length);
  $("#learn").hidden = !has;
  if (!has) return;
  $("#flash").innerHTML = `<h3>Flashcard</h3>` + (n.learning.flashcards || []).map((f, i) =>
    `<div class="card"><p><strong>${esc(f.q)}</strong></p><button data-f="${i}">Mostra risposta</button><p hidden>${esc(f.a)}</p></div>`).join("");
  $("#flash").querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => {
    const p = b.nextElementSibling;
    p.hidden = !p.hidden;
    b.textContent = p.hidden ? "Mostra risposta" : "Nascondi";
  }));
  const quiz = n.learning.quiz || [];
  $("#quiz").innerHTML = `<h3>Verifica se hai capito (${quiz.length})</h3>` + quiz.map((q, i) =>
    `<div class="card"><p><strong>${i + 1}. ${esc(q.q)}</strong></p>${q.choices.map((c, j) => `<label><input type="radio" name="q${i}" value="${j}"> ${esc(c)}</label><br>`).join("")}</div>`).join("") +
    (quiz.length ? `<button id="grade" class="btn">Correggi</button><p id="score"></p>` : "");
  const gb = $("#grade");
  if (gb) gb.onclick = () => {
    let ok = 0;
    quiz.forEach((q, i) => {
      const sel = document.querySelector(`input[name=q${i}]:checked`);
      if (sel && Number(sel.value) === q.answer) ok++;
    });
    const score = ok / quiz.length;
    $("#score").textContent = `Punteggio: ${ok}/${quiz.length}` + (quiz[0]?.explanation ? ` — ${quiz[0].explanation}` : "");
    try {
      const k = "md-progress";
      const p = JSON.parse(localStorage.getItem(k) || "{}");
      p[n.id] = { score, at: new Date().toISOString() };
      localStorage.setItem(k, JSON.stringify(p));
    } catch { /* storage non disponibile: nessun errore */ }
    reportQuiz(n.id, score);
  };
  $("#path").innerHTML = `<h3>Domande aperte</h3><ul>${(n.learning.questionsOpen || []).map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
    ${(n.prerequisites?.length) ? `<h3>Prerequisiti</h3><ul>${n.prerequisites.map((p) => `<li><button data-pre="${esc(p)}">${esc(treeCache.get(p)?.title || p)}</button></li>`).join("")}</ul>` : ""}`;
  $("#path").querySelectorAll("[data-pre]").forEach((b) => (b.onclick = () => openNode(b.dataset.pre)));
}

/* ------------------------------------------------------------------ */
/* Dashboard (stato iniziale, nessun nodo aperto)                       */
/* ------------------------------------------------------------------ */

function renderDash(due = []) {
  lastDue = due;
  const dash = $("#dash");
  if (current) {
    dash.hidden = true;
    return;
  }
  dash.hidden = false;
  const s = progressSummary;
  let last = null;
  try {
    last = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
  } catch { /* storage non disponibile */ }
  const dueHtml = due.length
    ? `<ul>` + due.slice(0, 8).map((d) => `<li><button data-due="${esc(d.id)}">${esc(d.title || treeCache.get(d.id)?.title || d.id)}</button> <span class="hint">${d.subject ? esc(d.subject) + " · " : ""}mastery ${d.mastery}/5</span></li>`).join("") + `</ul>`
    : `<p class="hint">Nessun ripasso dovuto: tutti i nodi studiati sono ancora freschi.</p>`;
  dash.innerHTML = `
    <h1>Il tuo percorso</h1>
    <div class="statgrid">
      <div class="stat"><span class="stat-n">${s.studied}</span><span class="stat-l">nodi studiati</span></div>
      <div class="stat"><span class="stat-n">${s.avgMastery}</span><span class="stat-l">padroneggiamento medio /5</span></div>
      <div class="stat"><span class="stat-n">${s.due}</span><span class="stat-l">da ripassare oggi</span></div>
      <div class="stat"><span class="stat-n">${s.streak}</span><span class="stat-l">giorni di fila</span></div>
    </div>
    ${last ? `<div class="card"><h3>Continua da dove eri</h3><button class="btn" data-resume="${esc(last.id)}">${esc(last.title)}</button></div>` : ""}
    <div class="card"><h3>Ripasso spaziato</h3>${dueHtml}</div>
    <div class="card"><h3>Come si usa</h3>
      <ol class="howto">
        <li>Scegli una materia a sinistra e apri un argomento.</li>
        <li>Usa il <strong>selettore di livello</strong>: dalla scheda rapida al dossier completo, il contenuto è composto dal server sui soli dati reali della knowledge base.</li>
        <li>Fai il quiz: il peggioramento/miglioramento del padroneggiamento determina quando ripassare.</li>
      </ol>
    </div>`;
  dash.querySelectorAll("[data-due]").forEach((b) => (b.onclick = () => openNode(b.dataset.due)));
  dash.querySelectorAll("[data-resume]").forEach((b) => (b.onclick = () => openNode(b.dataset.resume)));
}

/* ------------------------------------------------------------------ */
/* Ricerca, AI, stampa, study mode                                     */
/* ------------------------------------------------------------------ */

// ricerca (debounced + token anti-risposta-superata)
let t = null, searchReq = 0;
$("#q").addEventListener("input", (e) => {
  clearTimeout(t);
  t = setTimeout(async () => {
    const q = e.target.value.trim();
    if (q.length < 2) {
      $("#search-results").hidden = true;
      return;
    }
    const req = ++searchReq;
    const { hits } = await getJSON(`/api/search?q=${encodeURIComponent(q)}&plan=${plan()}`);
    if (req !== searchReq) return; // è arrivata una ricerca più recente
    $("#search-results").hidden = false;
    $("#hits").innerHTML = hits.map((h) => `<li><button data-h="${esc(h.id)}">${esc(h.title)}</button> <span class="hint">${esc(h.subject)} · ${esc(h.type)}</span><br><span class="hint">${esc(h.snippet)}</span></li>`).join("") || "<li>Nessun risultato nei contenuti accessibili.</li>";
    $("#hits").querySelectorAll("[data-h]").forEach((b) => (b.onclick = () => openNode(b.dataset.h)));
  }, 250);
});

// scorciatoia: "/" mette a fuoco la ricerca (come nel Laboratorio)
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
    e.preventDefault();
    $("#q").focus();
  }
});

// AI grounded
$("#ai-ask").onclick = async () => {
  const question = $("#ai-q").value.trim();
  if (!question) return;
  $("#ai-out").textContent = "Ricerca nei contenuti accessibili…";
  try {
    const out = await getJSON("/api/ai/ask", { method: "POST", headers: headers(), body: JSON.stringify({ question, llm: $("#ai-llm").checked }) });
    $("#ai-out").innerHTML = `<p>${esc(out.answer)}</p><p class="hint">Provenienza: ${esc(out.provenance || "?")} · Nodi: ${(out.citations || []).map(esc).join(", ") || "—"}${out.refusal ? " · (risposta di rifiuto: evidenza insufficiente)" : ""}${out.note ? ` · ${esc(out.note)}` : ""}</p>`;
  } catch (e) {
    $("#ai-out").textContent = `Errore: ${e.message}`;
  }
};

// stampa con watermark server-side
$("#print-btn").onclick = async () => {
  if (!current) return alert("Apri prima un nodo.");
  try {
    const { job } = await getJSON("/api/print", { method: "POST", headers: { ...headers(), "x-user": "local-preview" }, body: JSON.stringify({ nodeId: current.id, scope: "node" }) });
    const w = $("#watermark");
    w.hidden = false;
    w.innerHTML = `<strong>Copia personale — ${esc(job.watermark.userId)} · ${esc(job.watermark.printedAt.slice(0, 10))} · ${esc(job.watermark.docCode)}</strong><br>${esc(job.watermark.notice)} · Piano ${esc(job.plan)}`;
    window.print();
  } catch (e) {
    alert(`Stampa negata: ${e.message}`);
  }
};

// study mode: pannello + pomodoro + rumore sintetizzato
$("#study-toggle").onclick = () => {
  const s = $("#study");
  s.hidden = !s.hidden;
  $("#study-toggle").setAttribute("aria-pressed", String(!s.hidden));
};
function setSideOpen(open) {
  document.body.classList.toggle("side-open", open);
  $("#overlay").hidden = !open;
  if (open) $("#side-toggle").setAttribute("aria-expanded", "true");
  else {
    $("#side-toggle").setAttribute("aria-expanded", "false");
    $("#side-toggle").focus(); // il fuoco torna al bottone che ha aperto
  }
}
$("#side-toggle").onclick = () => setSideOpen(!document.body.classList.contains("side-open"));
$("#overlay").onclick = () => setSideOpen(false);
// clic fuori dal menu (sotto l'overlay) lo richiude
$("#node").addEventListener("click", () => {
  if (document.body.classList.contains("side-open")) setSideOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (document.body.classList.contains("side-open")) setSideOpen(false);
    else if (!$("#study").hidden) $("#study-toggle").click();
  }
});
let remain = 25 * 60, timer = null;
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
$("#pom-start").onclick = () => {
  if (timer) return;
  timer = setInterval(() => {
    remain = Math.max(0, remain - 1);
    $("#clock").textContent = fmt(remain);
    if (!remain) {
      clearInterval(timer);
      timer = null;
      alert("Pomodoro completato: pausa di 5 minuti.");
      remain = 5 * 60;
      $("#clock").textContent = fmt(remain);
    }
  }, 1000);
};
$("#pom-stop").onclick = () => {
  clearInterval(timer);
  timer = null;
};
$("#pom-reset").onclick = () => {
  clearInterval(timer);
  timer = null;
  remain = 25 * 60;
  $("#clock").textContent = fmt(remain);
};
let actx = null, noise = null;
$("#amb").onchange = (e) => {
  if (noise) {
    noise.stop();
    noise = null;
  }
  if (actx) {
    actx.close();
    actx = null;
  }
  if (e.target.value === "off") return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const len = actx.sampleRate * 2;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (e.target.value === "brown") {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      d[i] = w * 0.3; // rosa approssimato
    }
  }
  noise = actx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const g = actx.createGain();
  g.gain.value = $("#vol").value / 100 * 0.5;
  $("#vol").oninput = () => (g.gain.value = $("#vol").value / 100 * 0.5);
  noise.connect(g).connect(actx.destination);
  noise.start();
};

$("#plan").onchange = () => {
  current = null;
  $("#article").innerHTML = "<p>Piano cambiato. Ricarico materie e albero col nuovo livello di accesso.</p>";
  init();
};

async function init() {
  current = null;
  await loadSubjects();
  $("#tree").innerHTML = "<p class='hint'>Scegli una materia.</p>";
  await syncProgress();
  renderDash(lastDue);
  flushQueue(); // manda in sync le operazioni fatte offline in una sessione precedente
}
wireTreeKeys();
init();

// Tornata la rete: svuota subito la coda offline.
window.addEventListener("online", () => {
  toast("Rete tornata: sincronizzo…");
  flushQueue();
});

// PWA: service worker per l'uso offline in classe (shell + GET già visitate).
// Le POST (compose/progress/ask) non vengono mai messe in cache.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* http o browser senza SW: niente */ });
  });
}
