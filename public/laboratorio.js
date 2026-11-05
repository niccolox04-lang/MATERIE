/**
 * Laboratorio — client (vanilla, zero dipendenze).
 * Scrive un titolo, sceglie la profondità, ottiene un documento composto
 * dal server. Il client NON genera contenuto: solo rende e copia ciò che
 * il server ha assemblato dalla knowledge base.
 */
const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const esc = (s) => String(s ?? "");

const state = {
  format: "studio",
  formats: [],
  last: null,
  lastMarkdown: "",
  busy: false,
};

const plan = () => $("#plan").value;
const headers = () => ({ "x-plan": plan(), "content-type": "application/json" });

const LEVEL_BADGE = {
  verified: ["lab-badge-ok", "verificato"],
  content_reviewed: ["lab-badge-ok", "fonte letta"],
  verified_metadata: ["lab-badge-warn", "metadati verificati"],
  reachable: ["lab-badge-warn", "raggiungibile"],
  unverified: ["lab-badge-bad", "non verificata"],
};
const CLAIM_BADGE = {
  verified: ["lab-badge-ok", "verificato"],
  partially_verified: ["lab-badge-warn", "parzialmente verificato"],
  unverified: ["lab-badge-bad", "non verificato"],
  disputed: ["lab-badge-warn", "contestato"],
  "non dichiarato": ["lab-badge-warn", "stato non dichiarato"],
};

function badge(map, key) {
  const [cls, label] = map[key] || ["", key || "—"];
  return `<span class="lab-badge ${cls}">${esc(label)}</span>`;
}

/** Spezza il testo in paragrafi su righe vuote (il KB le usa come separatori). */
function paragraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

async function postCompose(title, opts = {}) {
  const r = await fetch("/api/ai/compose", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title,
      format: state.format,
      subject: $("#subject").value || undefined,
      markdown: opts.markdown === true,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Errore ${r.status}`), { status: r.status, data });
  return data;
}


/* ---------- rendering: rifiuto ---------- */
function renderRefusal(res) {
  const frag = $("#tpl-refusal").content.cloneNode(true);
  const card = frag.querySelector(".lab-refusal");
  card.querySelector(".lab-refusal-title").innerHTML = `Nessuna sezione per <em>${esc(res.title)}</em>`;
  card.querySelector(".lab-refusal-msg").textContent =
    res.message || "Contenuto non disponibile: non genero testo inventato.";
  const box = card.querySelector(".lab-cands");
  if (res.locked?.length) {
    card.querySelector(".lab-refusal-head").innerHTML =
      `<span class="lab-badge lab-badge-bad">🔒 Richiede un piano superiore</span>`;
    box.appendChild(el("div", "lab-cands-label", "La sezione esiste, ma è premium"));
    for (const c of res.locked) {
      const b = el("button", "lab-cand lab-cand-locked");
      b.type = "button";
      const t = el("span", "lab-cand-t");
      t.appendChild(el("span", "lab-cand-title", `🔒 ${c.title}`));
      t.appendChild(el("span", "lab-cand-meta", `${c.subject} · serve il piano ${String(c.required).toUpperCase()}`));
      const sc = el("span", "lab-cand-score");
      sc.appendChild(el("span", null, "bloccata"));
      b.append(t, sc);
      b.onclick = () => {
        if (String(c.required).toLowerCase() === plan()) {
          alert(`Sei già al piano ${String(c.required).toUpperCase()}: il nodo esiste ma non è pubblicato.`);
        } else {
          alert(`Questa sezione richiede il piano ${String(c.required).toUpperCase()}. Il testo resta sul server.`);
        }
      };
      box.appendChild(b);
    }
  } else if (res.candidates?.length) {
    box.appendChild(el("div", "lab-cands-label", "Sezioni vicine nel corpus"));
    for (const c of res.candidates) {
      const b = el("button", "lab-cand");
      b.type = "button";
      const t = el("span", "lab-cand-t");
      t.appendChild(el("span", "lab-cand-title", c.title));
      t.appendChild(
        el("span", "lab-cand-meta", `${c.subject} · ${c.status}${c.access !== "free" ? ` · ${c.access.toUpperCase()}` : ""}`)
      );
      const sc = el("span", "lab-cand-score");
      sc.appendChild(el("span", null, `${Math.round((c.score || 0) * 100)}%`));
      const bar = el("span", "lab-bar");
      const fill = el("span");
      fill.style.width = `${Math.max(6, Math.min(100, (c.score || 0) * 100))}%`;
      bar.appendChild(fill);
      sc.appendChild(bar);
      b.append(t, sc);
      b.onclick = () => {
        $("#title").value = c.title;
        run();
      };
      box.appendChild(b);
    }
  }
  return card;
}

/* ---------- rendering: blocchi ---------- */
function renderBlock(b) {
  const sec = el("section", "lab-sec");
  const head = el("div", "lab-sec-head");
  head.appendChild(el("h3", null, b.heading));
  head.appendChild(el("span", "lab-sec-src", b.nodeId));
  sec.appendChild(head);

  if (b.kind === "quiz") {
    const wrap = el("div", "lab-quiz");
    for (const q of b.items) {
      const item = el("div", "lab-quiz-item");
      item.appendChild(el("p", "lab-quiz-q", q.q));
      const ch = el("ul", "lab-quiz-choices");
      (q.choices || []).forEach((c, i) => {
        const li = el("li", null, `${String.fromCharCode(65 + i)}. ${c}`);
        if (i === q.answer) li.style.color = "var(--ok)";
        ch.appendChild(li);
      });
      item.appendChild(ch);
      item.appendChild(el("p", "lab-quiz-ans", `Risposta: ${String.fromCharCode(65 + (q.answer ?? 0))} — ${(q.choices || [])[q.answer] ?? ""}`));
      if (q.explanation) item.appendChild(el("p", "lab-quiz-why", q.explanation));
      wrap.appendChild(item);
    }
    sec.appendChild(wrap);
    return sec;
  }

  const map = { claims: CLAIM_BADGE, sources: LEVEL_BADGE };
  const listHtml = (items) =>
    items
      .map((it) => {
        const txt = typeof it === "string" ? esc(it) : esc(it.text || "");
        const bdg = typeof it === "object" && it.status ? badge(map[b.kind] || {}, it.status) : "";
        const sup =
          typeof it === "object" && it.supportedBy?.length
            ? ` <span class="lab-list-badges">${it.supportedBy.map((s) => `<code>${esc(s)}</code>`).join(" ")}</span>`
            : "";
        return `<li>${txt}${sup}${bdg}</li>`;
      })
      .join("");

  if (b.body) {
    const body = el("div", "lab-sec-body");
    if (b.kind === "historiography") {
      for (const line of String(b.body).split("\n").filter(Boolean)) body.appendChild(el("p", null, line));
      for (const [k, label] of [["agreements", "Accordi"], ["disputes", "Dispute"], ["limits", "Limiti"]]) {
        if (b[k]?.length) {
          const p = el("p");
          p.innerHTML = `<strong>${label}:</strong> ${b[k].map(esc).join("; ")}`;
          body.appendChild(p);
        }
      }
    } else {
      for (const p of paragraphs(b.body)) body.appendChild(el("p", null, p));
    }
    sec.appendChild(body);
  } else if (b.items?.length) {
    const ul = el("ul", "lab-list");
    ul.innerHTML = listHtml(b.items);
    sec.appendChild(ul);
  }
  return sec;
}


/* ---------- rendering: documento ---------- */
function renderDocument(res) {
  const doc = el("article", "lab-doc");
  const head = el("div", "lab-doc-head");
  const eye = el("div", "lab-doc-eyebrow");
  eye.innerHTML =
    `<span class="lab-badge lab-badge-acc">${esc(res.level)}</span>` +
    `<span class="lab-badge">${esc(res.stats.words)} parole</span>` +
    `<span class="lab-badge">${esc(res.stats.nodes)} ${res.stats.nodes === 1 ? "sezione" : "sezioni"}</span>` +
    (res.stats.depthOk
      ? `<span class="lab-badge lab-badge-ok">livello coperto</span>`
      : `<span class="lab-badge lab-badge-warn">livello parziale</span>`) +
    (res.sources.contentReviewed === res.sources.total && res.sources.total > 0
      ? `<span class="lab-badge lab-badge-ok">fonti verificate</span>`
      : `<span class="lab-badge lab-badge-warn">${res.sources.contentReviewed}/${res.sources.total} fonti verificate</span>`);
  head.appendChild(eye);
  head.appendChild(el("h2", "lab-doc-title", res.title));

  const meta = el("div", "lab-doc-meta");
  for (const n of res.nodes) meta.appendChild(el("span", null, `Fonte: ${n.title} · ${n.id}`));
  const [lo, hi] = res.stats.expected || [0, 0];
  meta.appendChild(el("span", null, `Corpo: ${res.stats.fill} (atteso ${lo}–${hi} parole)`));
  head.appendChild(meta);

  const src = el("div", "lab-sources");
  src.innerHTML =
    `<b>Provenienza.</b> Ogni sezione è ripresa dalla knowledge base e cita il nodo d'origine. ` +
    `Nessun fatto è generato: se la base non contiene un dato, il laboratorio lo dichiara.`;
  for (const n of res.nodes) {
    const line = el("span", "lab-srcline");
    line.innerHTML = `<code>${esc(n.id)}</code> — stato ${esc(n.status)} · accesso ${esc(String(n.access).toUpperCase())} · corrispondenza ${Math.round(n.score * 100)}% (${esc(n.how)})`;
    src.appendChild(line);
  }
  head.appendChild(src);
  doc.appendChild(head);

  const body = el("div", "lab-doc-body");
  for (const b of res.blocks) body.appendChild(renderBlock(b));
  doc.appendChild(body);

  if (res.notices?.length) {
    const n = el("div", "lab-notices");
    n.appendChild(el("h4", null, "Avvertenze di completezza"));

/* ---------- flusso ---------- */
function setBusy(on) {
  state.busy = on;
  const go = $("#go");
  go.disabled = on;
  if (on) go.setAttribute("data-busy", "1");
  else go.removeAttribute("data-busy");
  $("#out").setAttribute("aria-busy", String(on));
}

function showError(message) {
  const out = $("#out");
  out.innerHTML = "";
  out.appendChild(el("p", "lab-error", message));
}

async function run() {
  const title = $("#title").value.trim();
  if (!title) {
    showError("Scrivi il titolo di una sezione.");
    $("#title").focus();
    return;
  }
  setBusy(true);
  const out = $("#out");
  out.innerHTML = "";
  const ph = el("div", "lab-placeholder");
  ph.appendChild(el("p", null, "Sto componendo il contenuto…"));
  out.appendChild(ph);
  try {
    const res = await postCompose(title, { markdown: true });
    state.last = res;
    state.lastMarkdown = res.markdown || "";
    out.innerHTML = "";
    out.appendChild(res.ok ? renderDocument(res) : renderRefusal(res));
    if (res.ok) out.appendChild(buildActions());
    out.focus({ preventScroll: true });
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    showError(`Generazione non riuscita: ${e.message}`);
  } finally {
    setBusy(false);
  }
}

function download(name, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function buildActions() {
  const bar = el("div", "lab-actions");
  const mk = (label, fn) => {
    const b = el("button", "lab-btn", label);
    b.type = "button";
    b.onclick = () => fn(b);
    return b;
  };
  bar.appendChild(
    mk("Copia il testo", async (b) => {
      const txt = state.lastMarkdown || $("#out").innerText;
      try {
        await navigator.clipboard.writeText(txt);
        b.textContent = "Copiato";
        b.classList.add("lab-btn-done");
      } catch {
        b.textContent = "Copia non disponibile";
      }

/* ---------- init ---------- */
const SAMPLES = [
  { t: "Shoah" },
  { t: "Guerra del Peloponneso" },
  { t: "Rinascimento e stampa" },
  { t: "Cartesio: metodo, dubbio e cogito" },
  { t: "Bisanzio e mondo islamico" },
  { t: "teorema di pitagora" },
  { t: "Atlantide dei sogni", note: "non esiste: prova il rifiuto" },
];

function renderLevels(formats) {
  state.formats = formats;
  const host = $("#levels");
  host.innerHTML = "";
  if (!formats.some((f) => f.id === state.format)) state.format = formats[0]?.id || "scheda";
  for (const f of formats) {
    const b = el("button", "lab-level");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(f.id === state.format));
    b.dataset.format = f.id;
    const top = el("div", "lab-level-top");
    top.appendChild(el("span", "lab-level-name", f.label));
    top.appendChild(el("span", "lab-level-pill", f.level));
    b.appendChild(top);
    b.appendChild(el("span", "lab-level-blurb", f.blurb));
    const [lo, hi] = f.words || [0, 0];
    b.appendChild(el("span", "lab-level-hint", `${f.hint} · ${lo}–${hi} parole`));
    b.onclick = () => {
      state.format = f.id;
      for (const x of host.children) x.setAttribute("aria-checked", String(x.dataset.format === f.id));
    };
    host.appendChild(b);
  }
}

function renderSamples() {
  const host = $("#samples");
  host.innerHTML = "";
  for (const s of SAMPLES) {
    const b = el("button", "lab-chip");
    b.type = "button";
    b.appendChild(el("span", null, s.t));
    if (s.note) {
      b.appendChild(el("span", "lab-chip-note", s.note));
      b.title = s.note;
    }
    b.onclick = () => {
      $("#title").value = s.t;
      run();
    };
    host.appendChild(b);
  }
}

async function loadSubjects() {
  try {
    const r = await fetch(`/api/subjects?plan=${plan()}`);
    const d = await r.json();
    const sel = $("#subject");
    for (const s of d.subjects || []) {
      const o = document.createElement("option");
      o.value = s.subject;
      o.textContent = s.title;
      sel.appendChild(o);
    }
  } catch {
    /* la materia è facoltativa: si prosegue senza elenco */
  }
}

async function loadFormats() {
  try {
    const r = await fetch("/api/ai/compose", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: "__formats__", format: "scheda" }),
    });
    const d = await r.json();
    if (Array.isArray(d.formats) && d.formats.length) {
      renderLevels(d.formats);
      return;
    }
  } catch {
    /* fallback sotto */
  }
  renderLevels([
    { id: "scheda", label: "Scheda rapida", level: "RAPIDA", blurb: "L'idea essenziale.", hint: "Sintesi", words: [90, 260] },
    { id: "studio", label: "Studio", level: "COMPLETA", blurb: "Spiegazione completa.", hint: "+ definizioni", words: [200, 520] },
    { id: "approfondimento", label: "Approfondimento", level: "DETTAGLIATA", blurb: "Anche il livello tecnico.", hint: "+ tecnico", words: [300, 900] },
    { id: "dossier", label: "Dossier", level: "ENCYCLOPEDIC", blurb: "Claim, fonti, quiz.", hint: "+ fonti", words: [500, 2000] },
  ]);
}

$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  run();
});
$("#plan").addEventListener("change", () => {
  loadSubjects();
  if ($("#title").value.trim()) run();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("#title")) {
    e.preventDefault();
    $("#title").focus();
  }
});

renderSamples();
await loadSubjects();
await loadFormats();

      setTimeout(() => {
        b.textContent = "Copia il testo";
        b.classList.remove("lab-btn-done");
      }, 1800);
    })
  );
  bar.appendChild(mk("Scarica .md", () => download("contenuto.md", state.lastMarkdown || "")));
  bar.appendChild(mk("Stampa / PDF", () => window.print()));
  bar.appendChild(
    mk("Cambia profondità", () => {
      document.querySelector(".lab-levels").scrollIntoView({ behavior: "smooth", block: "center" });
      $("#title").focus();
    })
  );
  return bar;
}

    const ul = el("ul");
    for (const t of res.notices) ul.appendChild(el("li", null, t));
    n.appendChild(ul);
    doc.appendChild(n);
  }
  return doc;
}

function renderMarkdown(md) {
  const wrap = el("article", "lab-doc");
  const head = el("div", "lab-doc-head");
  head.appendChild(el("h2", "lab-doc-title", "Markdown"));
  const body = el("div", "lab-doc-body");
  const pre = el("pre");
  pre.style.cssText = "white-space:pre-wrap;word-break:break-word;margin:0;font-size:.9rem;line-height:1.6";
  pre.textContent = md;
  body.appendChild(pre);
  wrap.appendChild(head);
  wrap.appendChild(body);
  return wrap;
}
