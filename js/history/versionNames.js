import { MODELS, DEFAULT_MODEL } from '../config.js';

// Versions are numbered per model in the order they were saved: Meridian 1, 2, 3 …, Lumen 1, 2 …
// The stored id (v001 …) stays the file name and never changes; only what is shown is per model.

// Entries saved before there was more than one model have no model field: they are Meridian versions
export const modelOf = (v) => v.model ?? DEFAULT_MODEL;
export const modelLabel = (id) => MODELS[id]?.label ?? id;

// Adds name ("Meridian 21") and slug ("meridian-21", for links) to every entry of the index
export function nameVersions(versions) {
  const counts = {};
  for (const v of versions) {
    const model = modelOf(v);
    counts[model] = (counts[model] ?? 0) + 1;
    v.number = counts[model];
    v.name = `${modelLabel(model)} ${v.number}`;
    v.slug = `${model}-${v.number}`;
  }
  return versions;
}
