# Data model

Fonte di verità: `src/model/types.mjs` (la validazione lo importa).

## Entità implementate

- **Subject** (`<materia>/subject.json`): subject, title, description, version, updatedAt, taxonomy{levels, specializations}, areas[{id,title,description,order}].
- **ConceptNode** (`nodes/*.json`): id `materia:slug`, subject, title, slug, status (planned|draft|reviewed|published|deprecated — pipeline: planned → draft → reviewed → published), access (free|pro|ultra), type (+ sotto-tipi per materia), parent (id|null), order, version, createdAt/updatedAt ISO, level (foundation|intermediate|advanced|deep), summary, explanations{semplice, approfondita, tecnica?}, definitions[], examples[], counterexamples[], errorsTypical[], keywords[], prerequisites[id], claims[{id, statement, supportedBy[source-id]}], chrono{start,end,label,place}, proof[], formulas[{expr,meaning}], relations[{type,to,note}], sources[], media{videos[],images[],audios[],documents[]}, learning{flashcards[{q,a}], quiz[{q,choices,answer,explanation?}], questionsOpen[]}.

## Relazioni ammesse

`PREREQUISITE CAUSE EFFECT PART_OF EXAMPLE_OF CONTRASTS_WITH INFLUENCES
INFLUENCED_BY SIMILAR_TO DEVELOPS_INTO APPLIES_TO RELATED_TO`

Regole: relazioni di nodi published solo verso id esistenti; cicli PREREQUISITE vietati (test+validazione).

## Source (HTTP 200 ≠ verificato)

id, title, author?, publisher?, url?, sourceType, language?, verified (legacy: true SOLO se content_reviewed), verificationStatus (unverified|reachable|verified_metadata|content_reviewed), accessedAt ISO, supports[] (quali affermazioni sostiene), note?. Solo il server serve i contenuti; `reviewed` richiede la stessa completezza di `published` ma non è mai servito via API.

## Media

Video{videoId?,url?,title,channel?,language?,duration?,level?,verifiedAt?}, Image{url?,title,category,license?,attribution?}, Audio/Podcast{url?,title,series?,language?,duration?}, Document{url?,title,kind}. Oggi: array vuoti (nessuna voce inventata).

## Entità pianificate (modello pronto, tabelle future)

User, Subscription, Entitlement, Progress, Mastery, AIConversation/AIRequest, PrintJob/Export — funzioni pure già in `learning.mjs`, `print.mjs`, `entitlements.mjs`; persistenza a carico del backend con DB (contratto in `API_CONTRACT.md`).

## Versionamento

Ogni nodo: version/createdAt/updatedAt. Modifiche = bump version + updatedAt; la storia completa (diff) è demandata a git sul corpus + futuro event-sourcing (non inventato qui).
