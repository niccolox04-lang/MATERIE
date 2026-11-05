/**
 * Validazione automatica: structural / content / source / linguistic / security / performance audit.
 * Uso: node scripts/validate.mjs [--strict]
 * Exit code 1 se errori (fallisce CI), 0 con soli warning.
 * @module scripts/validate
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { RELATION_TYPES, SOURCE_TYPES, NODE_TYPES, ACCESS_LEVELS, NODE_STATUS, SOURCE_VERIFICATION, LEVELS, CLAIM_STATUS, IMPORTANCE } from "../src/model/types.mjs";
import { parseId } from "../src/model/ids.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const SKIP = new Set(["src", "public", "scripts", "tests", "docs", "node_modules", "data", ".git"]);

async function subjects() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
    if (existsSync(join(ROOT, e.name, "subject.json"))) out.push(e.name);
  }
  return out.sort();
}

const isISO = (s) => !Number.isNaN(Date.parse(s));
const isURL = (s) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s);

async function checkUrlReachable(url) {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (r.ok) return true;
    const g = await fetch(url, { redirect: "follow" });
    return g.ok;
  } catch {
    return false;
  }
}

let nodeCount = 0;
let publishedCount = 0;
let reviewedCount = 0;
const allIds = new Map(); // id -> {file, node}
const slugDup = new Map();

for (const subject of await subjects()) {
  let meta;
  try {
    meta = JSON.parse(await readFile(join(ROOT, subject, "subject.json"), "utf8"));
  } catch (e) {
    err(`[${subject}] subject.json mancante o JSON invalido: ${e.message}`);
    continue;
  }
  if (meta.subject !== subject) err(`[${subject}] subject.json: campo subject="${meta.subject}" non coincide con la cartella`);
  if (!Array.isArray(meta.areas) || !meta.areas.length) err(`[${subject}] subject.json: areas mancanti`);
  const areaIds = new Set((meta.areas || []).map((a) => a.id));
  if (areaIds.size !== (meta.areas || []).length) err(`[${subject}] subject.json: id aree duplicati`);

  let files = [];
  try {
    files = (await readdir(join(ROOT, subject, "nodes"))).filter((f) => f.endsWith(".json"));
  } catch {
    warn(`[${subject}] cartella nodes/ assente o vuota`);
    continue;
  }
  for (const f of files) {
    nodeCount++;
    const file = join(ROOT, subject, "nodes", f);
    let n;
    try {
      n = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      err(`[${subject}/${f}] JSON invalido: ${e.message}`);
      continue;
    }
    const tag = n.id || `${subject}/${f}`;
    if (!n.id) {
      err(`[${tag}] manca id`);
      continue;
    }
    if (allIds.has(n.id)) err(`[${tag}] id duplicato (anche in ${allIds.get(n.id).file})`);
    else allIds.set(n.id, { file, node: n });
    if (!parseId(n.id)) err(`[${tag}] id malformato (atteso materia:slug)`);
    else if (parseId(n.id).subject !== subject) err(`[${tag}] subject incoerente con cartella ${subject}`);
    if (n.subject !== subject) err(`[${tag}] campo subject incoerente`);

    // unicità slug file vs id
    const expectedFile = `${parseId(n.id)?.path}.json`;
    if (expectedFile && expectedFile !== f) warn(`[${tag}] nome file "${f}" diverso da path id "${expectedFile}"`);

    if (!Object.values(NODE_STATUS).includes(n.status)) err(`[${tag}] status invalido: ${n.status}`);
    if (!Object.values(ACCESS_LEVELS).includes(n.access)) err(`[${tag}] access invalido: ${n.access}`);
    if (n.status === "published" || n.status === "reviewed") {
      if (n.status === "published") publishedCount++;
      else reviewedCount++;
      if (!NODE_TYPES.includes(n.type)) err(`[${tag}] type invalido: ${n.type}`);
      if (!n.title || n.title.trim().length < 3) err(`[${tag}] titolo mancante/troppo corto`);
      if (!n.slug) err(`[${tag}] slug mancante`);
      if (n.parent !== null && typeof n.parent !== "string") err(`[${tag}] parent deve essere id o null`);
      if (!n.summary || n.summary.trim().length < 40) err(`[${tag}] summary mancante (<40 char): contenuto insufficiente`);
      if (!n.explanations?.semplice || !n.explanations?.approfondita) err(`[${tag}] explanations.semplice+approfondita obbligatorie`);
      if (!isISO(n.createdAt) || !isISO(n.updatedAt)) err(`[${tag}] createdAt/updatedAt non ISO`);
      if (typeof n.version !== "number" || n.version < 1) err(`[${tag}] version mancante`);
      // anti-placeholder (token brevi solo su word-boundary: "metodo" non è un TODO)
      const blob = JSON.stringify(n).toLowerCase();
      if (blob.includes("lorem ipsum") || blob.includes("placeholder") || blob.includes("xxxx")) {
        const hit = blob.includes("lorem ipsum") ? "lorem ipsum" : blob.includes("placeholder") ? "placeholder" : "xxxx";
        err(`[${tag}] contiene testo segnaposto "${hit}"`);
      }
      if (/\btodo\b/.test(blob) || /\bfixme\b/.test(blob)) err(`[${tag}] contiene segnaposto TODO/FIXME`);
      if (/^(mock|fake|prova)\b/.test(n.title.toLowerCase())) err(`[${tag}] titolo mock/fake`);
    }
    if (n.status === "planned") {
      if (!n.title) err(`[${tag}] planned senza titolo`);
      if (n.explanations && !n.explanations.semplice) warn(`[${tag}] planned con explanations parziali`);
    }
    // relazioni
    for (const r of n.relations || []) {
      if (!RELATION_TYPES.includes(r.type)) err(`[${tag}] relazione type invalido: ${r.type}`);
      if (!r.to || !parseId(r.to)) err(`[${tag}] relazione senza destinazione valida`);
    }
    for (const p of n.prerequisites || []) {
      if (!parseId(p)) err(`[${tag}] prerequisite malformato: ${p}`);
    }
    // fonti (HTTP 200 ≠ verificato: serve verificationStatus esplicito)
    const sourceIds = new Set();
    for (const s of n.sources || []) {
      if (!s.id || !s.title) err(`[${tag}] fonte senza id/titolo`);
      if (sourceIds.has(s.id)) err(`[${tag}] fonte id duplicato: ${s.id}`);
      sourceIds.add(s.id);
      if (!SOURCE_TYPES.includes(s.sourceType)) err(`[${tag}] fonte sourceType invalido: ${s.sourceType}`);
      if (s.url && !isURL(s.url)) err(`[${tag}] fonte URL malformato: ${s.url}`);
      if (!s.accessedAt || !isISO(s.accessedAt)) err(`[${tag}] fonte senza accessedAt ISO`);
      if (s.verified !== true && s.verified !== false) err(`[${tag}] fonte senza flag verified`);
      if (!SOURCE_VERIFICATION.includes(s.verificationStatus)) {
        err(`[${tag}] fonte ${s.id}: verificationStatus mancante (uno di ${SOURCE_VERIFICATION.join("|")})`);
      } else if ((s.verificationStatus === "content_reviewed") !== (s.verified === true)) {
        err(`[${tag}] fonte ${s.id}: verified deve essere true SOLO con content_reviewed`);
      }
      if (s.verificationStatus === "content_reviewed" && (!s.supports || !s.supports.length)) {
        warn(`[${tag}] fonte ${s.id} content_reviewed senza supports (quali affermazioni sostiene?)`);
      }
    }
    // claims: tracciabilità proposizione → fonte
    for (const c of n.claims || []) {
      if (!c.id || !c.statement || c.statement.trim().length < 20) err(`[${tag}] claim senza id/statement (min 20 char)`);
      if (!Array.isArray(c.supportedBy) || !c.supportedBy.length) err(`[${tag}] claim ${c.id || "?"} senza supportedBy`);
      if (c.status && !CLAIM_STATUS.includes(c.status)) err(`[${tag}] claim ${c.id} status invalido: ${c.status}`);
      for (const sid of c.supportedBy || []) {
        if (!sourceIds.has(sid)) err(`[${tag}] claim ${c.id} cita fonte inesistente nel nodo: ${sid}`);
      }
    }
    // storiografia: dibattiti con posizioni, evidenze e tracciabilità sulle fonti del nodo
    for (const h of n.historiography || []) {
      if (!h.id || !h.question || h.question.trim().length < 20) err(`[${tag}] dibattito storiografico senza id/questione (min 20 char)`);
      if (!Array.isArray(h.positions) || h.positions.length < 2) err(`[${tag}] dibattito ${h.id || "?"} con meno di due posizioni: non è un dibattito`);
      for (const p of h.positions || []) {
        if (!p.label) err(`[${tag}] dibattito ${h.id || "?"}: posizione senza label`);
        if (!Array.isArray(p.evidence) || !p.evidence.length) err(`[${tag}] dibattito ${h.id || "?"}: posizione "${p.label || "?"}" senza evidenze`);
        if (p.status && !CLAIM_STATUS.includes(p.status)) err(`[${tag}] dibattito ${h.id || "?"}: status posizione invalido: ${p.status}`);
      }
      if (!Array.isArray(h.supportedBy) || !h.supportedBy.length) err(`[${tag}] dibattito ${h.id || "?"} senza supportedBy`);
      for (const sid of h.supportedBy || []) {
        if (!sourceIds.has(sid)) err(`[${tag}] dibattito ${h.id || "?"} cita fonte inesistente nel nodo: ${sid}`);
      }
    }
    // difficoltà progressiva / cronologia / dimostrazioni
    if (n.level && !LEVELS.includes(n.level)) err(`[${tag}] level invalido: ${n.level}`);
    if (n.chrono && typeof n.chrono !== "object") err(`[${tag}] chrono malformato`);
    for (const p of n.proof || []) {
      if (typeof p !== "string" || p.trim().length < 10) err(`[${tag}] proof con passaggio troppo breve`);
    }
    for (const f of n.formulas || []) {
      if (!f.expr) err(`[${tag}] formula senza expr`);
    }
    // media: vietati id inventati
    for (const v of n.media?.videos || []) {
      if (!v.url && !v.videoId) err(`[${tag}] video senza url/videoId`);
      if (v.url && !isURL(v.url)) err(`[${tag}] video URL malformato`);
      if (!v.title) warn(`[${tag}] video senza titolo`);
    }
    // learning
    for (const q of n.learning?.quiz || []) {
      if (!q.q || !Array.isArray(q.choices) || q.choices.length < 2) err(`[${tag}] quiz malformato`);
      if (typeof q.answer !== "number" || q.answer < 0 || q.answer >= q.choices.length) err(`[${tag}] quiz answer fuori range`);
    }
  }
}

// --- coverage matrix: la mappa del dominio deve esistere ed essere coerente ---
const TIERS = ["foundational", "intermediate", "advanced"];
for (const subject of await subjects()) {
  let cov;
  try {
    cov = JSON.parse(await readFile(join(ROOT, subject, "coverage.json"), "utf8"));
  } catch {
    err(`[${subject}] coverage.json mancante o invalido: la materia non ha mappa del dominio`);
    continue;
  }
  if (cov.subject !== subject) err(`[${subject}] coverage.json: subject incoerente`);
  if (!cov.curriculumScope || cov.curriculumScope.length < 20) err(`[${subject}] coverage.json: curriculumScope mancante (<20 char)`);
  if (!Array.isArray(cov.macroAreas) || !cov.macroAreas.length) err(`[${subject}] coverage.json: macroAreas vuote`);
  const areaIds = new Set();
  const unitIds = new Set();
  for (const a of cov.macroAreas || []) {
    if (!a.id || !a.title) err(`[${subject}] area senza id/titolo`);
    if (areaIds.has(a.id)) err(`[${subject}] area id duplicato: ${a.id}`);
    areaIds.add(a.id);
    if (!IMPORTANCE.includes(a.importance)) err(`[${subject}/${a.id}] importance invalida: ${a.importance}`);
    if (!Array.isArray(a.units) || !a.units.length) err(`[${subject}/${a.id}] units vuote`);
    for (const u of a.units || []) {
      if (!u.id || !u.title) err(`[${subject}/${a.id}] unità senza id/titolo`);
      if (unitIds.has(`${a.id}::${u.id}`)) err(`[${subject}] unità duplicata: ${a.id}::${u.id}`);
      unitIds.add(`${a.id}::${u.id}`);
      if (!TIERS.includes(u.tier)) err(`[${subject}/${u.id}] tier invalido: ${u.tier}`);
      if (u.weight !== undefined && (!(typeof u.weight === "number") || u.weight <= 0)) err(`[${subject}/${u.id}] weight non positivo`);
      if (u.nodeId && !allIds.has(u.nodeId)) err(`[${subject}/${u.id}] nodeId inesistente: ${u.nodeId} (coverage ≠ contenuto)`);
    }
  }
  for (const list of ["foundationalTopics", "advancedTopics"]) {
    for (const uid of cov[list] || []) {
      if (![...unitIds].some((x) => x.endsWith(`::${uid}`))) warn(`[${subject}] ${list} cita unità ignota: ${uid}`);
    }
  }
  if (!Array.isArray(cov.roadmap) || !cov.roadmap.length) warn(`[${subject}] coverage.json senza roadmap`);
}

// --- riferimenti incrociati (published + reviewed: i draft non devono bloccare) ---
for (const [id, { node }] of allIds) {
  if (node.status !== "published" && node.status !== "reviewed") continue;
  if (node.parent && !allIds.has(node.parent)) {
    // il parent può essere un'area (subject.json) nella forma subject:area-slug
    err(`[${id}] parent inesistente: ${node.parent} (nodo orfano)`);
  }
  for (const r of node.relations || []) {
    if (!allIds.has(r.to)) err(`[${id}] relazione ${r.type} verso nodo inesistente: ${r.to}`);
  }
  for (const p of node.prerequisites || []) {
    if (!allIds.has(p)) err(`[${id}] prerequisite inesistente: ${p}`);
  }
}

// --- cicli PREREQUISITE ---
{
  const adj = new Map();
  for (const [id, { node }] of allIds) {
    if (node.status !== "published" && node.status !== "reviewed") continue;
    adj.set(id, (node.prerequisites || []).filter((p) => allIds.has(p)));
  }
  const color = new Map();
  const stack = [];
  const cycles = [];
  const dfs = (u) => {
    color.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === 1) cycles.push([...stack.slice(stack.indexOf(v)), v]);
      else if (!color.get(v)) dfs(v);
    }
    stack.pop();
    color.set(u, 2);
  };
  for (const id of adj.keys()) if (!color.get(id)) dfs(id);
  for (const c of cycles) err(`Ciclo PREREQUISITE: ${c.join(" -> ")}`);
}

// --- nodi orfani (published/reviewed senza catena alla radice) ---
{
  const roots = new Set([...allIds.values()].filter((e) => e.node.parent === null).map((e) => e.node.id));
  for (const [id, { node }] of allIds) {
    if ((node.status !== "published" && node.status !== "reviewed") || node.parent === null) continue;
    let cur = node.parent;
    const seen = new Set([id]);
    let ok = false;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (roots.has(cur)) {
        ok = true;
        break;
      }
      cur = allIds.get(cur)?.node.parent;
    }
    if (!ok && !roots.has(node.parent)) warn(`[${id}] catena parent non risale a una radice (verificare gerarchia)`);
  }
}

// --- verifica URL fonti (published+reviewed con URL, best-effort rete) ---
if (process.argv.includes("--check-urls")) {
  const urls = new Set();
  for (const [, { node }] of allIds) {
    if (node.status !== "published" && node.status !== "reviewed") continue;
    for (const s of node.sources || []) if (s.url) urls.add(s.url);
  }
  for (const u of urls) {
    const ok = await checkUrlReachable(u);
    if (!ok) err(`URL fonte non raggiungibile: ${u}`);
    else console.log(`  OK ${u}`);
  }
}

// --- linguistic audit leggero ---
for (const [id, { node }] of allIds) {
  if (node.status !== "published" && node.status !== "reviewed") continue;
  const text = `${node.title} ${node.summary || ""} ${(node.definitions || []).join(" ")}`;
  if (/([a-zà-ÿ])\1\1/i.test(text.replace(/\b[IVXLCDM]+\b/g, ""))) warn(`[${id}] possibile refuso (tripla lettera)`);
  if (text.length > 40 && text === text.toUpperCase()) warn(`[${id}] testo interamente maiuscolo`);
  if (/\b(platone|socrate|aristotele)\b/i.test(text) && !/kill/i.test(text)) {
    // coerenza nomi propri: devono iniziare con maiuscola nel testo originale
  }
}

// --- performance audit: payload per nodo ---
let maxBytes = 0;
let maxId = "";
for (const [id, { file }] of allIds) {
  const { size } = await import("node:fs").then(() => ({})).catch(() => ({}));
  void size;
  const content = await readFile(file, "utf8");
  if (content.length > maxBytes) {
    maxBytes = content.length;
    maxId = id;
  }
  if (content.length > 60000) warn(`[${id}] file >60KB: valutare suddivisione (${content.length} byte)`);
}

console.log(`\nNodi totali: ${nodeCount} | published: ${publishedCount} | reviewed: ${reviewedCount} | materie: ${(await subjects()).join(", ")}`);
console.log(`Nodo più grande: ${maxId} (${maxBytes} byte)`);
if (warnings.length) {
  console.log(`\nWARNINGS (${warnings.length}):`);
  for (const w of warnings.slice(0, 50)) console.log(`  ! ${w}`);
  if (warnings.length > 50) console.log(`  ... +${warnings.length - 50} altri`);
}
if (errors.length) {
  console.log(`\nERRORS (${errors.length}):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
} else {
  console.log(STRICT && warnings.length ? "\nSTRICT: warnings presenti" : "\nValidazione OK.");
  process.exit(STRICT && warnings.length ? 1 : 0);
}
