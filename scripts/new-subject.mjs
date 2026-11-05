/**
 * Scaffold di una nuova materia SENZA riscrivere la piattaforma.
 * Uso: node scripts/new-subject.mjs <materia> "Titolo Materia"
 * Crea subject.json + nodes/ con 1 nodo radice planned + README di lavoro.
 * @module scripts/new-subject
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [subject, ...titleParts] = process.argv.slice(2);
if (!subject || !/^[a-z0-9-]+$/.test(subject) || !titleParts.length) {
  console.log('Uso: node scripts/new-subject.mjs <materia> "Titolo Materia"');
  process.exit(1);
}
const title = titleParts.join(" ");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(ROOT, subject, "subject.json"))) {
  console.error(`La materia ${subject} esiste già.`);
  process.exit(1);
}
await mkdir(join(ROOT, subject, "nodes"), { recursive: true });
const now = new Date().toISOString();
await writeFile(
  join(ROOT, subject, "subject.json"),
  JSON.stringify(
    {
      subject,
      title,
      description: `Mappa della conoscenza di ${title}: struttura gerarchica in costruzione.`,
      version: 1,
      updatedAt: now,
      taxonomy: {
        levels: ["area", "macroargomento", "argomento", "sottoargomento", "concetto"],
        note: "Specializzare i livelli in docs/CONTENT_MODEL.md senza modificare il motore.",
      },
      areas: [{ id: `${subject}:introduzione`, title: "Introduzione", description: `Primi passi in ${title}.`, order: 0 }],
    },
    null,
    2
  )
);
await writeFile(
  join(ROOT, subject, "nodes", "introduzione.json"),
  JSON.stringify(
    {
      id: `${subject}:introduzione`,
      subject,
      title: `Introduzione a ${title}`,
      slug: "introduzione",
      status: "planned",
      access: "free",
      type: "area",
      parent: null,
      order: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    null,
    2
  )
);
console.log(`Materia ${subject} creata. Definisci aree in ${subject}/subject.json poi aggiungi nodi (vedi docs/PLATFORM.md, sezione Nuova materia).`);
