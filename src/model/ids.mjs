/**
 * ID stabili e slug. Formato: "<subject>:<slug-path>".
 * @module model/ids
 */

/** Normalizza una stringa in slug URL-safe. */
export function slugify(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Costruisce un id stabile. */
export function makeId(subject, ...parts) {
  const slug = parts.map(slugify).filter(Boolean).join("/");
  return `${subject}:${slug}`;
}

/** Divide un id in {subject, path}. Ritorna null se malformato. */
export function parseId(id) {
  const m = /^([a-z0-9-]+):([a-z0-9][a-z0-9\-/]*)$/.exec(String(id || ""));
  if (!m) return null;
  return { subject: m[1], path: m[2] };
}

/** Valida il formato di un id (non l'esistenza). */
export function isValidId(id) {
  return parseId(id) !== null;
}
