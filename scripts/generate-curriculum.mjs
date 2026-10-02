/** Regenerate class chunks and their revision from the webapp's source catalog. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const directory = new URL("../data/curriculum/", import.meta.url);
const catalog = JSON.parse(
  await readFile(new URL("ncert-cbse-2026-27.json", directory), "utf8"),
);

/** Sort object keys while preserving chapter order for a stable content hash. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

// ASCII escapes preserve the existing fingerprint convention across languages.
const canonical = JSON.stringify(sortKeys(catalog)).replace(
  /[\u0080-\uffff]/g,
  (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
);
const manifest = {
  catalog_id: "ncert-cbse",
  catalog_version: `sha256-${createHash("sha256").update(canonical).digest("hex")}`,
  classLevels: catalog.classes.map((grade) => grade.classLevel),
};

await writeFile(
  new URL("manifest.json", directory),
  JSON.stringify(manifest, null, 2) + "\n",
);
for (const grade of catalog.classes) {
  await writeFile(
    new URL(`class-${grade.classLevel}.json`, directory),
    JSON.stringify({ classes: [grade] }, null, 2) + "\n",
  );
}
