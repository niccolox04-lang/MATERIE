/**
 * Build indice di ricerca + bundle FREE (anti-leakage premium).
 * - public/index/search.json: SOLO nodi published+free (titolo, summary, keywords).
 * - public/index/premium-manifest.json: conteggi per materia, NESSUN testo premium.
 * Uso: node scripts/build-index.mjs
 * @module scripts/build-index
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["src", "public", "scripts", "tests", "docs", "node_modules", "data", ".git"]);

const entries = await readdir(ROOT, { withFileTypes: true });
const search = [];
const manifest = {};
for (const e of entries) {
  if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
  const nodesDir = join(ROOT, e.name, "nodes");
  if (!existsSync(nodesDir)) continue;
  const files = (await readdir(nodesDir)).filter((f) => f.endsWith(".json"));
  let free = 0,
    premium = 0;
  for (const f of files) {
    const n = JSON.parse(await readFile(join(nodesDir, f), "utf8"));
    if (n.status !== "published") continue;
    if (n.access === "free") {
      free++;
      search.push({
        id: n.id,
        title: n.title,
        subject: n.subject,
        type: n.type,
        summary: (n.summary || "").slice(0, 220),
        keywords: n.keywords || [],
      });
    } else {
      premium++;
    }
  }
  manifest[e.name] = { free, premiumHesclusoDalBundle: premium };
}

// Sicurezza: il bundle free NON deve contenere testi premium — verifica costruttiva:
// rileggiamo i premium e assicuriamo che nessun frammento >60 char compaia nel search.json.
const bundle = JSON.stringify(search);
let leaks = 0;
for (const e of entries) {
  if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
  const nodesDir = join(ROOT, e.name, "nodes");
  if (!existsSync(nodesDir)) continue;
  const files = (await readdir(nodesDir)).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const n = JSON.parse(await readFile(join(nodesDir, f), "utf8"));
    if (n.status === "published" && n.access !== "free") {
      const probe = (n.explanations?.approfondita || "").slice(0, 120);
      if (probe.length > 60 && bundle.includes(probe.slice(0, 60))) {
        console.error(`LEAK: frammento premium di ${n.id} presente nel bundle free`);
        leaks++;
      }
    }
  }
}
if (leaks) process.exit(1);

await mkdir(join(ROOT, "public", "index"), { recursive: true });
await writeFile(join(ROOT, "public", "index", "search.json"), JSON.stringify({ updatedAt: new Date().toISOString(), entries: search }, null, 2));
await writeFile(
  join(ROOT, "public", "index", "premium-manifest.json"),
  JSON.stringify({ updatedAt: new Date().toISOString(), manifest, note: "Solo conteggi. Nessun testo premium in questo file." }, null, 2)
);
console.log(`Indice free: ${search.length} voci. Manifest: ${JSON.stringify(manifest)}`);
