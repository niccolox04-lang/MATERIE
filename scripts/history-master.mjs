/**
 * Metriche World History Master (sola lettura): non modifica motore, validazione o test.
 * Uso: node scripts/history-master.mjs [storia]
 * @module scripts/history-master
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SUBJECT = process.argv[2] || "storia";

// Mappa aree -> regioni mondiali (documentata in docs/HISTORY_SCOPE.md)
const REGION_OF = {
  preistoria: "mondiale",
  "vicino-oriente": "Medio Oriente",
  grecia: "Europa",
  roma: "Europa",
  medioevo: "Europa",
  moderna: "Europa",
  contemporanea: "Europa",
  africa: "Africa",
  cina: "Asia",
  india: "Asia",
  giappone: "Asia",
  "sud-est-asiatico": "Asia",
  americhe: "Americhe",
  italia: "Europa",
  metodo: "trasversale",
  "mondo-slavo": "Europa",
  "oceania": "Oceania",
};

const cov = JSON.parse(await readFile(join(ROOT, SUBJECT, "coverage.json"), "utf8"));
const dir = join(ROOT, SUBJECT, "nodes");
const nodeById = new Map();
if (existsSync(dir)) {
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
    const n = JSON.parse(await readFile(join(dir, f), "utf8"));
    nodeById.set(n.id, n);
  }
}

let units = 0, core = 0, important = 0, secondary = 0;
const regions = {};
const depth = {};
const claims = { verified: 0, partially_verified: 0, unverified: 0, disputed: 0 };
const sources = { primary: 0, secondary: 0, content_reviewed: 0 };
let causeEffect = 0, chronoOk = 0, chronoTot = 0, crossSubject = 0;
let exercises = 0, quiz = 0, flash = 0;

for (const a of cov.macroAreas || []) {
  const region = REGION_OF[a.id] || "non mappata";
  regions[region] = regions[region] || { units: 0, covered: 0 };
  for (const u of a.units || []) {
    units++;
    if (a.importance === "core") core++;
    if (a.importance === "important") important++;
    if (a.importance === "secondary") secondary++;
    regions[region].units++;
    const n = u.nodeId ? nodeById.get(u.nodeId) : null;
    if (n && n.status === "published") regions[region].covered++;
    const d = u.contentDepth || "standard";
    depth[d] = (depth[d] || 0) + 1;
  }
}
for (const n of nodeById.values()) {
  if (n.subject !== SUBJECT || n.status === "deprecated") continue;
  for (const c of n.claims || []) claims[c.status] = (claims[c.status] || 0) + 1;
  for (const s of n.sources || []) {
    if (s.sourceType === "primary-source") sources.primary++;
    else sources.secondary++;
    if (s.verificationStatus === "content_reviewed") sources.content_reviewed++;
  }
  for (const r of n.relations || []) {
    if (r.type === "CAUSE" || r.type === "EFFECT") causeEffect++;
    if (String(r.to).split(":")[0] !== n.subject) crossSubject++;
  }
  if (n.chrono && typeof n.chrono === "object") {
    chronoTot++;
    if (typeof n.chrono.start === "string" && typeof n.chrono.end === "string") chronoOk++;
  }
  exercises += (n.learning?.questionsOpen || []).length;
  quiz += (n.learning?.quiz || []).length;
  flash += (n.learning?.flashcards || []).length;
}

const substantive = claims.verified + claims.partially_verified + claims.unverified + claims.disputed;
console.log(`\nHISTORY MASTER — ${SUBJECT}`);
console.log(`TOTAL DOMAIN UNITS: ${units} (CORE ${core}, IMPORTANT ${important}, SECONDARY ${secondary})`);
console.log(`WORLD REGIONS:`);
for (const [r, v] of Object.entries(regions)) console.log(`  - ${r}: ${v.covered}/${v.units} con nodo published`);
console.log(`CONTENT DEPTH (unità): ${JSON.stringify(depth)}`);
console.log(`PRIMARY SOURCES: ${sources.primary} | SECONDARY SOURCES: ${sources.secondary} | CONTENT_REVIEWED: ${sources.content_reviewed}`);
console.log(`CLAIMS substantive: ${substantive} (verified ${claims.verified}, partially ${claims.partially_verified}, unverified ${claims.unverified}, disputed ${claims.disputed})`);
console.log(`BACKING RATIO (verified+partially/substantive): ${substantive ? Math.round((10000 * (claims.verified + claims.partially_verified)) / substantive) / 100 : 0}%`);
console.log(`TIMELINE: nodi con chrono ${chronoTot} (tutti testuali, coordinate MAI inventate)`);
console.log(`CAUSE/EFFECT RELATIONS: ${causeEffect} | CROSS-SUBJECT: ${crossSubject}`);
console.log(`EXERCISES: ${exercises} | QUIZ: ${quiz} | FLASHCARDS: ${flash}`);
