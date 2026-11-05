/**
 * Migrazione v02 (idempotente): aggiunge claim.status onesto.
 * verified: tutte le supporting sources sono content_reviewed;
 * partially_verified: almeno una reachable/verified_metadata;
 * unverified: solo fonti unverified o nessun supporto revisionato.
 * Uso: node scripts/migrate-v02.mjs
 * @module scripts/migrate-v02
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["src", "public", "scripts", "tests", "docs", "node_modules", "data", ".git"]);

let patched = 0;
for (const e of await readdir(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
  const dir = join(ROOT, e.name, "nodes");
  if (!existsSync(dir)) continue;
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
    const p = join(dir, f);
    const n = JSON.parse(await readFile(p, "utf8"));
    if (!n.claims?.length) continue;
    const byId = new Map((n.sources || []).map((s) => [s.id, s.verificationStatus]));
    let dirty = false;
    for (const c of n.claims) {
      if (c.status) continue;
      const levels = (c.supportedBy || []).map((id) => byId.get(id));
      c.status = levels.length && levels.every((l) => l === "content_reviewed")
        ? "verified"
        : levels.some((l) => l === "reachable" || l === "verified_metadata")
          ? "partially_verified"
          : "unverified";
      dirty = true;
    }
    if (dirty) {
      await writeFile(p, JSON.stringify(n, null, 2));
      patched++;
      console.log(`  patched ${n.id}`);
    }
  }
}
console.log(`Migrazione v02: ${patched} nodi aggiornati.`);
