/**
 * Report coverage per materia (nuovo formato): NODE QUALITY ≠ COVERAGE ≠ READINESS.
 * - qualityGate: esito reale di scripts/validate.mjs (processo figlio, non auto-assegnato).
 * - coverageGate: zero critical gap + ogni area CORE almeno partially_covered.
 * - readinessGate: readiness derivata da src/engine/coverage.mjs (complete irraggiungibile con lacune CORE).
 * Uso: node scripts/coverage.mjs [materia]
 * @module scripts/coverage
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  computeAreaCoverage,
  computeReadiness,
  overallCoverage,
  tierCoverage,
  criticalGaps,
  coreBackingFraction,
  nodeVerifiedBacking,
} from "../src/engine/coverage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["src", "public", "scripts", "tests", "docs", "node_modules", "data", ".git"]);
const only = process.argv[2];

// qualityGate reale: esegue la validazione contenuti (fallisce davvero se errori)
let qualityGate = true;
try {
  execFileSync(process.argv[0], [join(ROOT, "scripts", "validate.mjs")], { stdio: "ignore" });
} catch {
  qualityGate = false;
}

const entries = await readdir(ROOT, { withFileTypes: true });
const subjects = [];
for (const e of entries) {
  if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
  if (!existsSync(join(ROOT, e.name, "coverage.json"))) continue;
  if (only && e.name !== only) continue;
  subjects.push(e.name);
}
subjects.sort();

for (const subject of subjects) {
  const cov = JSON.parse(await readFile(join(ROOT, subject, "coverage.json"), "utf8"));
  const dir = join(ROOT, subject, "nodes");
  const nodeById = new Map();
  if (existsSync(dir)) {
    for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
      const n = JSON.parse(await readFile(join(dir, f), "utf8"));
      nodeById.set(n.id, n);
    }
  }
  const nodes = [...nodeById.values()];
  const published = nodes.filter((n) => n.status === "published");

  // coerenza prerequisiti (indipendente dalla validazione: gate separato e rieseguibile)
  const ids = new Set(nodeById.keys());
  let prereqsCoherent = true;
  for (const n of published) {
    if (n.parent && !ids.has(n.parent)) prereqsCoherent = false;
    for (const p of n.prerequisites || []) if (!ids.has(p)) prereqsCoherent = false;
    for (const r of n.relations || []) if (!ids.has(r.to)) prereqsCoherent = false;
  }

  const areas = cov.macroAreas || [];
  const results = areas.map((a) => computeAreaCoverage(a, nodeById));
  const overall = overallCoverage(results, areas);
  const found = tierCoverage(cov, nodeById, "foundational");
  const adv = tierCoverage(cov, nodeById, "advanced") ;
  const gaps = criticalGaps(cov, nodeById);
  const backing = coreBackingFraction(cov, nodeById);
  const { readiness } = computeReadiness(cov, nodeById, { qualityGate, prereqsCoherent });

  // metriche contenuto sui soli published
  let srcRev = 0;
  let srcTot = 0;
  let claimsTot = 0;
  let claimsTraced = 0;
  let quiz = 0;
  let flash = 0;
  let open = 0;
  let media = 0;
  let xsubj = 0;
  let verifiedUnits = 0;
  let totalUnits = 0;
  for (const a of areas) {
    for (const u of a.units || []) {
      totalUnits++;
      const n = u.nodeId ? nodeById.get(u.nodeId) : null;
      if (n && n.status === "published" && nodeVerifiedBacking(n)) verifiedUnits++;
    }
  }
  for (const n of published) {
    for (const s of n.sources || []) {
      srcTot++;
      if (s.verificationStatus === "content_reviewed") srcRev++;
    }
    for (const c of n.claims || []) {
      claimsTot++;
      if ((c.supportedBy || []).length && c.status !== "unverified") claimsTraced++;
    }
    quiz += (n.learning?.quiz || []).length;
    flash += (n.learning?.flashcards || []).length;
    open += (n.learning?.questionsOpen || []).length;
    const m = n.media || {};
    media += (m.videos || []).length + (m.images || []).length + (m.audios || []).length + (m.documents || []).length;
    for (const r of n.relations || []) if (String(r.to).split(":")[0] !== n.subject) xsubj++;
  }

  const coreLines = areas.map((a, i) => (a.importance === "core" ? `  - ${a.title}: ${results[i].pct}% [${results[i].status}]` : null)).filter(Boolean);
  const impLines = areas.map((a, i) => (a.importance === "important" ? `  - ${a.title}: ${results[i].pct}% [${results[i].status}]` : null)).filter(Boolean);
  const coverageGate = gaps.length === 0 && areas.filter((a) => a.importance === "core").every((a, k) => {
    const i = areas.indexOf(a);
    return results[i].pct >= 25;
  });

  console.log(`\nSUBJECT: ${subject}`);
  console.log(`STATUS (readiness): ${readiness.toUpperCase()}`);
  console.log(`TOTAL NODES: ${nodes.length} (published ${published.length})`);
  console.log(`CORE AREAS:\n${coreLines.join("\n") || "  (nessuna)"}`);
  console.log(`IMPORTANT AREAS:\n${impLines.join("\n") || "  (nessuna)"}`);
  console.log(`OVERALL COVERAGE (pesata): ${overall}%`);
  console.log(`FOUNDATIONAL COVERAGE: ${found}%`);
  console.log(`ADVANCED COVERAGE: ${adv}%`);
  console.log(`VERIFIED CONTENT (unità con backing): ${totalUnits ? Math.round((10000 * verifiedUnits) / totalUnits) / 100 : 0}%`);
  console.log(`VERIFIED SOURCES: ${srcTot ? Math.round((10000 * srcRev) / srcTot) / 100 : 0}% (${srcRev}/${srcTot})`);
  console.log(`CLAIM TRACEABILITY: ${claimsTot ? Math.round((10000 * claimsTraced) / claimsTot) / 100 : 0}% (${claimsTraced}/${claimsTot} tracciati, backing CORE ${(Math.round(backing * 10000) / 100)}%)`);
  console.log(`EXERCISES (open): ${open} | FLASHCARDS: ${flash} | QUIZZES: ${quiz} | MEDIA: ${media} | CROSS-SUBJECT: ${xsubj}`);
  console.log(`CRITICAL GAPS: ${gaps.length ? gaps.join(", ") : "(nessuno)"}`);
  console.log(`QUALITY: ${qualityGate ? "PASS" : "FAIL"} | COVERAGE: ${coverageGate ? "PASS" : "FAIL"} | READINESS: ${readiness.toUpperCase()}`);

  // roadmap deterministica: unità CORE scoperte, peso desc, foundational prima
  const next = [];
  for (const a of areas) {
    for (const u of a.units || []) {
      const n = u.nodeId ? nodeById.get(u.nodeId) : null;
      if (!n || n.status !== "published") {
        next.push({ area: a.id, imp: a.importance, w: u.weight ?? 1, tier: u.tier, id: u.id, title: u.title });
      }
    }
  }
  const impRank = { core: 0, important: 1, secondary: 2, optional: 3 };
  const tierRank = { foundational: 0, intermediate: 1, advanced: 2 };
  next.sort((x, y) => impRank[x.imp] - impRank[y.imp] || y.w - x.w || tierRank[x.tier] - tierRank[y.tier]);
  console.log(`NEXT (priorità): ${next.slice(0, 5).map((u) => `${u.area}::${u.id}`).join(", ") || "(completo)"}`);
}
console.log(`\nLegenda gate: QUALITY=validate.mjs reale · COVERAGE=zero critical gap + CORE≥partially · READINESS=derivata (complete solo se CORE fully + fonti + prerequisiti).`);
