/**
 * Migrazione v01 (idempotente): aggiunge verificationStatus/supports alle fonti
 * esistenti e level ai nodi. Giustificazione degli status assegnati:
 * - content_reviewed SOLO per le 2 URL lette integralmente via fetch il 2026-09-23
 *   (Treccani Platone, SEP Plato) e confrontate con le affermazioni dei nodi.
 * - tutto il resto → unverified (mai controllato: HTTP non eseguito).
 * Uso: node scripts/migrate-v01.mjs
 * @module scripts/migrate-v01
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["src", "public", "scripts", "tests", "docs", "node_modules", "data", ".git"]);

const REVIEWED_URLS = new Set([
  "https://www.treccani.it/enciclopedia/platone/",
  "https://plato.stanford.edu/entries/plato/",
]);

const SUPPORTS = {
  "treccani-platone": ["biografia e cronologia", "ordinamento delle opere", "dottrina delle idee", "morale e politica", "dialettica tarda e Timeo"],
  "sep-plato": ["dottrine centrali", "forma dialogica e Socrate"],
};

const LEVELS = {
  "filosofia:antica": "foundation",
  "filosofia:presocratici": "foundation",
  "filosofia:socrate": "foundation",
  "filosofia:medievale": "foundation",
  "filosofia:moderna": "foundation",
  "filosofia:contemporanea": "foundation",
  "filosofia:metodo-lessico": "foundation",
  "storia:introduzione": "foundation",
  "greco:introduzione": "foundation",
  "latino:introduzione": "foundation",
  "matematica:introduzione": "foundation",
  "fisica:introduzione": "foundation",
  "filosofia:platone": "intermediate",
  "filosofia:platone-vita": "intermediate",
  "filosofia:platone-opere": "intermediate",
  "filosofia:platone-teoria-idee": "intermediate",
  "filosofia:platone-mondi": "intermediate",
  "filosofia:platone-anamnesi": "intermediate",
  "filosofia:platone-anima": "intermediate",
  "filosofia:platone-politica": "intermediate",
  "filosofia:platone-eros": "intermediate",
  "filosofia:platone-dialettica": "advanced",
  "filosofia:platone-collegamenti": "advanced",
};

let patched = 0;
for (const e of await readdir(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
  const dir = join(ROOT, e.name, "nodes");
  if (!existsSync(dir)) continue;
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
    const p = join(dir, f);
    const n = JSON.parse(await readFile(p, "utf8"));
    let dirty = false;
    for (const s of n.sources || []) {
      if (!s.verificationStatus) {
        s.verificationStatus = s.url && REVIEWED_URLS.has(s.url) ? "content_reviewed" : "unverified";
        dirty = true;
      }
      if (s.verificationStatus === "content_reviewed") {
        s.verified = true;
        if (!s.supports && SUPPORTS[s.id]) {
          s.supports = SUPPORTS[s.id];
          dirty = true;
        }
      } else if (s.verified !== false) {
        s.verified = false;
        dirty = true;
      }
    }
    if (!n.level && LEVELS[n.id]) {
      n.level = LEVELS[n.id];
      dirty = true;
    }
    if (dirty) {
      await writeFile(p, JSON.stringify(n, null, 2));
      patched++;
      console.log(`  patched ${n.id}`);
    }
  }
}
console.log(`Migrazione v01: ${patched} nodi aggiornati.`);
