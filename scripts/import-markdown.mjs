/**
 * Importatore Markdown/JSON → nodi validati. NON scrive mai dati non validati
 * nel corpus: default --dry-run, scrittura solo con --write dopo validazione.
 *
 * Formato Markdown atteso (un file = un nodo):
 *   ---
 *   id: filosofia:mio-nodo
 *   title: Titolo
 *   subject: filosofia
 *   type: concetto
 *   parent: filosofia:padre
 *   access: pro
 *   keywords: [a, b]
 *   ---
 *   ## summary
 *   ...
 *   ## semplice
 *   ...
 *   ## approfondita
 *   ...
 *
 * Uso:
 *   node scripts/import-markdown.mjs --dry-run ./da-importare
 *   node scripts/import-markdown.mjs --write ./da-importare
 * @module scripts/import-markdown
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseId } from "../src/model/ids.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.length === 0) {
  console.log("Uso: node scripts/import-markdown.mjs [--dry-run|--write] <dir>");
  process.exit(0);
}
const write = args.includes("--write");
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) {
  console.error("Directory mancante.");
  process.exit(1);
}

function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(src);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

function section(body, name) {
  const m = new RegExp(`## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`, "i").exec(body);
  return m ? m[1].trim() : "";
}

const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
if (!files.length) {
  console.log("Nessun .md trovato.");
  process.exit(0);
}
let ok = 0;
for (const f of files) {
  const src = await readFile(join(dir, f), "utf8");
  const parsed = parseFrontmatter(src);
  if (!parsed) {
    console.error(`✗ ${f}: frontmatter mancante`);
    continue;
  }
  const { meta, body } = parsed;
  const errs = [];
  if (!meta.id || !parseId(meta.id)) errs.push("id mancante/malformato");
  if (!meta.title) errs.push("title mancante");
  if (!meta.subject) errs.push("subject mancante");
  const summary = section(body, "summary");
  const semplice = section(body, "semplice");
  const approfondita = section(body, "approfondita");
  if (summary.length < 40) errs.push("summary <40 char");
  if (!semplice || !approfondita) errs.push("sezioni semplice/approfondita obbligatorie");
  if (errs.length) {
    console.error(`✗ ${f}: ${errs.join("; ")}`);
    continue;
  }
  const node = {
    id: meta.id,
    subject: meta.subject,
    title: meta.title.replace(/^["']|["']$/g, ""),
    slug: parseId(meta.id).path.split("/").pop(),
    status: "draft",
    access: meta.access || "pro",
    type: meta.type || "concetto",
    parent: meta.parent || null,
    order: Number(meta.order || 0),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    summary,
    explanations: { semplice, approfondita },
    definitions: [],
    examples: [],
    keywords: (meta.keywords || "").replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean),
    prerequisites: [],
    relations: [],
    sources: [],
    media: { videos: [], images: [], audios: [], documents: [] },
    learning: { flashcards: [], quiz: [], questionsOpen: [] },
  };
  console.log(`✓ ${f} → ${node.id} (status draft, da revisionare: MAI pubblicato automaticamente)`);
  if (write) {
    const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
    const out = join(ROOT, node.subject, "nodes", `${parseId(node.id).path}.json`);
    await writeFile(out, JSON.stringify(node, null, 2));
    console.log(`  scritto ${out}`);
  }
  ok++;
}
console.log(write ? `Importati ${ok} draft.` : `Dry-run OK per ${ok} file. Nulla scritto (usa --write per scrivere come draft).`);
