/**
 * Pipeline di pubblicazione: reviewed → published SOLO se i quality gate passano.
 * Esegue validate.mjs prima e dopo; promuove solo i nodi reviewed completi,
 * con bump di version e updatedAt. Mai auto-publish di draft/planned.
 * Uso: node scripts/publish-reviewed.mjs [materia]
 * @module scripts/publish-reviewed
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["src", "public", "scripts", "tests", "docs", "node_modules", "data", ".git"]);
const only = process.argv[2];

function gates() {
  execFileSync(process.argv[0], [join(ROOT, "scripts", "validate.mjs")], { stdio: "ignore" });
  execFileSync(process.argv[0], ["--test", ...["tests/content.test.mjs", "tests/entitlements.test.mjs", "tests/graph.test.mjs", "tests/coverage.test.mjs"].map((t) => join(ROOT, t))], { stdio: "ignore" });
}

try {
  gates();
} catch {
  console.error("Gate falliti: nessuna pubblicazione.");
  process.exit(1);
}

let done = 0;
for (const e of await readdir(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
  if (only && e.name !== only) continue;
  const dir = join(ROOT, e.name, "nodes");
  if (!existsSync(dir)) continue;
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
    const p = join(dir, f);
    const n = JSON.parse(await readFile(p, "utf8"));
    if (n.status !== "reviewed") continue;
    n.status = "published";
    n.version = (n.version || 1) + 1;
    n.updatedAt = new Date().toISOString();
    await writeFile(p, JSON.stringify(n, null, 2));
    done++;
    console.log(`  published ${n.id} (v${n.version})`);
  }
}
if (!done) {
  console.log("Nessun nodo reviewed da pubblicare.");
  process.exit(0);
}
try {
  gates();
  console.log(`Pubblicati ${done} nodi, gate post-pubblicazione OK.`);
} catch {
  console.error("Gate post-pubblicazione falliti: controllare manualmente (i nodi restano published ma invalidi).");
  process.exit(1);
}
