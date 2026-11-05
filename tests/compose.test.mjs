/**
 * Test del composer: il contratto è "non inventare mai".
 * Ogni formato cresce per ricchezza, mai per gonfiatura; un titolo
 * assente dal corpus deve produrre un RIFIUTO, non un testo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORMATS,
  FORMAT_IDS,
  composeSection,
  composeNode,
  nodeLevels,
  resolveSection,
  toMarkdown,
} from "../src/ai/compose.mjs";
import { canAccess } from "../src/engine/entitlements.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadCorpus() {
  const out = [];
  for (const subject of ["storia", "filosofia", "matematica"]) {
    let files = [];
    try {
      files = await readdir(join(ROOT, subject, "nodes"));
    } catch {
      continue;
    }
    for (const f of files.filter((x) => x.endsWith(".json"))) {
      out.push(JSON.parse(await readFile(join(ROOT, subject, "nodes", f), "utf8")));
    }
  }
  return out;
}

const corpus = await loadCorpus();

describe("compose: formati", () => {
  it("i formati sono in ordine crescente di ricchezza", () => {
    assert.deepEqual(FORMAT_IDS, ["scheda", "studio", "approfondimento", "dossier"]);
    for (let i = 1; i < FORMATS.length; i++) {
      assert.ok(FORMATS[i].words[0] >= FORMATS[i - 1].words[0], "gli intervalli di parole crescono");
    }
  });

  it("un livello superiore contiene almeno tutti i blocchi del livello inferiore", () => {
    const node = corpus.find((n) => n.id === "storia:atene-classica");
    assert.ok(node, "nodo di prova presente");
    let prev = composeNode(node, "scheda").blocks.length;
    for (const id of ["studio", "approfondimento", "dossier"]) {
      const cur = composeNode(node, id).blocks.length;
      assert.ok(cur >= prev, `${id} (${cur}) non perde blocchi rispetto al precedente (${prev})`);
      prev = cur;
    }
  });
});

describe("compose: onestà del contenuto", () => {
  it("ogni blocco dichiara provenienza e nodo d'origine", () => {
    const r = composeSection(corpus, { title: "Shoah", format: "dossier" });
    assert.ok(r.ok, "il titolo Shoah deve risolversi");
    for (const b of r.blocks) {
      assert.equal(b.provenance, "kb", `blocco "${b.heading}" senza provenienza`);
      assert.ok(b.nodeId, `blocco "${b.heading}" senza nodeId`);
    }
  });

  it("il testo è solo materiale realmente presente nel nodo", () => {
    const node = corpus.find((n) => n.id === "storia:shoah");
    const r = composeSection(corpus, { title: "Shoah", format: "dossier" });
    const pool = [
      node.summary,
      node.explanations?.semplice,
      node.explanations?.approfondita,
      node.explanations?.tecnica,
      ...(node.definitions || []),
      ...(node.examples || []),
      ...(node.errorsTypical || []),
      ...(node.counterexamples || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    for (const b of r.blocks) {
      if (!b.body) continue;
      if (b.kind === "meta") {
        // l'unico blocco composto: unisce due campi reali del nodo
        const expected = [node.chrono?.label, node.chrono?.place].filter(Boolean).join(" · ");
        assert.equal(b.body, expected, "il blocco cronologia unisce solo chrono.label e chrono.place");
        continue;
      }
      for (const phrase of b.body.split("\n").map((s) => s.trim()).filter(Boolean)) {
        const key = phrase.slice(0, 45).toLowerCase();
        assert.ok(pool.includes(key), `frase non presente nel nodo: "${phrase.slice(0, 60)}…"`);
      }
    }
  });

  it("nessuna fonte è dichiarata verificata se il nodo non lo dice", () => {
    const node = corpus.find((n) => n.id === "storia:shoah");
    const r = composeSection(corpus, { title: "Shoah", format: "dossier" });
    const real = (node.sources || []).filter((s) => s.verificationStatus === "content_reviewed").length;
    assert.equal(r.sources.contentReviewed, real, "il conteggio deve riflettere il nodo");
  });
});


describe("compose: rifiuto invece di invenzione", () => {
  it("un titolo assente dal corpus viene rifiutato, non generato", () => {
    const r = composeSection(corpus, { title: "xyzzyqqq nonsense", format: "dossier" });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, true);
    assert.equal(r.reason, "no-match");
    assert.equal(r.blocks, undefined, "un rifiuto non contiene blocchi di contenuto");
  });

  it("titolo vuoto: rifiuto esplicito, nessuna eccezione", () => {
    const r = composeSection(corpus, { title: "   " });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "empty");
  });

  it("i candidati esposti non contengono il testo dei nodi", () => {
    const r = composeSection(corpus, { title: "colonia transatlantica schiava xyzzy", format: "studio" });
    for (const c of r.candidates || []) {
      assert.ok(c.id && c.title, "il candidato ha id e titolo");
      assert.equal(c.explanations, undefined, "mai il contenuto del nodo");
      assert.equal(c.summary, undefined, "mai il riassunto del nodo");
    }
  });
});

describe("compose: risoluzione del titolo", () => {
  it("il titolo esatto di un nodo vince sui nodi che lo citano solo nel testo", () => {
    const r = composeSection(corpus, { title: "Shoah" });
    assert.equal(r.ok, true);
    assert.equal(r.nodes[0].id, "storia:shoah", "deve vincere il nodo dedicato, non quello che lo menziona");
  });

  it("un id completo risolve sempre", () => {
    const r = composeSection(corpus, { title: "storia:shoah" });
    assert.equal(r.ok, true);
    assert.equal(r.nodes[0].id, "storia:shoah");
  });

  it("il filtro per materia limita la ricerca a quella materia", () => {
    // "Rinascimento" esiste anche in filosofia ("Umanesimo e Rinascimento"):
    // il filtro deve restringere il campo, non eliminare i match legittimi.
    const r = resolveSection(corpus, "Rinascimento", { subject: "filosofia" });
    for (const m of r.matched) assert.equal(m.node.subject, "filosofia", "il match deve essere della materia scelta");
    for (const c of r.candidates) assert.equal(c.node.subject, "filosofia");
    // un titolo inesistente in quella materia non deve pescare da un'altra
    const none = resolveSection(corpus, "Rinascimento", { subject: "matematica" });
    assert.equal(none.matched.length, 0, "Rinascimento non esiste in matematica");
  });
});

describe("compose: livelli dichiarati dal nodo", () => {
  it("nodeLevels riconosce un nodo completo e uno scarno", () => {
    const full = corpus.find((n) => n.id === "storia:atene-classica");
    const lean = { summary: "x", explanations: { semplice: "y" } };
    assert.equal(nodeLevels(full).completa, true);
    assert.equal(nodeLevels(full).encyclopedic, true);
    assert.equal(nodeLevels(lean).completa, false);
    assert.equal(nodeLevels(lean).dettagliata, false);
  });

  it("chiedere un livello non coperto produce un avviso, non gonfiatura", () => {
    const lean = {
      id: "test:lean",
      subject: "test",
      title: "Nodo scarno",
      summary: "Sintesi molto breve.",
      explanations: { semplice: "Testo semplice." },
    };
    const r = composeSection([lean], { title: "Nodo scarno", format: "dossier" });
    assert.equal(r.ok, true);
    assert.equal(r.stats.depthOk, false, "il livello richiesto non è coperto");
    assert.ok(r.notices.length > 0, "deve avvisare che il livello non è coperto");
  });
});

describe("compose: export e statistiche", () => {
  it("il markdown cita ogni sezione e riporta le avvertenze", () => {
    const r = composeSection(corpus, { title: "Shoah", format: "dossier" });
    const md = toMarkdown(r);
    assert.ok(md.startsWith("# Shoah"));
    assert.ok(md.includes("storia:shoah"), "il markdown cita il nodo");
    assert.ok(md.includes("Avvertenze di completezza"));
  });

  it("toMarkdown di un rifiuto è vuoto", () => {
    const r = composeSection(corpus, { title: "xyzzyqqq" });
    assert.equal(toMarkdown(r), "");
  });
});

describe("compose: entitlement", () => {
  it("un piano free non può comporre da un nodo premium", () => {
    const pro = corpus.find((n) => n.access === "pro" && canAccess("pro", n));
    assert.ok(pro, "serve un nodo pro published nel corpus di test");
    const freePool = corpus.filter((n) => canAccess("free", n));
    const r = composeSection(freePool, { title: pro.title, format: "studio" });
    if (r.ok) {
      for (const n of r.nodes) {
        const node = corpus.find((x) => x.id === n.id);
        assert.ok(canAccess("free", node), `il piano free ha composto dal premium ${n.id}`);
      }
    }
  });
});
