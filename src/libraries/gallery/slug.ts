import { nanoid } from "nanoid";

// Kebab-case slug from a library name. Strips noise the browser tends to
// add to imported filenames (extensions, " (1)" duplicate suffixes).
export function suggestSlug(name: string): string {
  let out = name.toLowerCase().trim();
  out = out.replace(/\s*\(\d+\)\s*/g, " ");
  out = out.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out
      .replace(/-(?:scribblylib|scribbly|json)(?:-\d+)?$/g, "")
      .replace(/-+$/g, "");
  }
  return out.length > 0 ? out : "library";
}

// Globally-unique gallery slug. The `slug` column is `.unique()`, so the
// random suffix guarantees two libraries with the same name can coexist.
export function generateGallerySlug(name: string): string {
  return `${suggestSlug(name)}-${nanoid(6)}`;
}
