// External link builders for the marketplace UI. The gallery's Report,
// View-source, and Submit links live in the registry's GitHub repo so all
// moderation flows route through PR/issue tooling — no in-app endpoint.

import type { ScribblyLibrary } from "../types";
import type { ManifestEntry } from "./types";

export const REGISTRY_REPO =
  (import.meta.env["VITE_LIBRARY_REGISTRY_REPO"] as string | undefined) ??
  "wissamyah/scribbly-libraries";

// Public source view for a single library's submission directory.
export function viewSourceUrl(entry: ManifestEntry): string {
  return `https://github.com/${REGISTRY_REPO}/tree/main/submissions/${entry.slug}`;
}

// Pre-filled GitHub issue link. Encodes title + body so the reporter only
// has to add context. Kept as a thin URL builder — no network calls.
export function reportLibraryIssueUrl(entry: ManifestEntry): string {
  const title = `Report: ${entry.slug} (v${entry.version})`;
  const body =
    `**Library:** ${entry.slug} \`v${entry.version}\`\n` +
    `**Reason for report:**\n\n` +
    `<!-- describe what's wrong with this library — wrong content, ` +
    `attribution issue, broken on install, etc. -->\n\n` +
    `**License declared:** ${entry.license}\n` +
    `**Submitter:** [@${entry.author.handle}](https://github.com/${entry.author.handle})\n`;
  const params = new URLSearchParams({
    title,
    body,
    labels: "report",
  });
  return `https://github.com/${REGISTRY_REPO}/issues/new?${params.toString()}`;
}

// Kebab-case slug suggestion derived from a library name. The reviewer can
// override it in the issue body — this is just a starting point. We strip
// the noise the OS/browser tends to add to imported filenames (extensions,
// " (1)" duplicate-download suffixes) so a library accidentally named
// "Foo.scribblylib (1).json" doesn't produce a garbage slug. Mirrors
// scripts/review.ts in the scribbly-libraries repo.
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
  return out.length > 0 ? out : "my-library";
}

// URL of the registry's Issue Form for submitting a new library. Prefills
// the structured fields the form expects (name, slug) so the submitter
// only has to pick license/tags from dropdowns + drag in their file.
// A bot in the registry repo (intake.yml) auto-creates a PR from any
// issue that uses this form.
export function submitLibraryIssueUrl(input: {
  name: string;
  itemCount: number;
}): string {
  const slug = suggestSlug(input.name);
  const params = new URLSearchParams({
    template: "submit-library.yml",
    title: `Submit: ${input.name}`,
    // The Issue Form looks these up by field `id`. Other required fields
    // (license, tags, description, file) can't be prefilled — the user
    // picks them in the form UI. itemCount goes unused; the bot reads the
    // real count from the attached file.
    name: input.name,
    slug,
  });
  void input.itemCount;
  return `https://github.com/${REGISTRY_REPO}/issues/new?${params.toString()}`;
}

// Static guide URL — explains submission rules, licensing, and the review
// timeline. Lives in the registry repo's CONTRIBUTING.md.
export function submissionGuideUrl(): string {
  return `https://github.com/${REGISTRY_REPO}/blob/main/CONTRIBUTING.md`;
}

// Convenience: when the user has an active library loaded, prefill from it.
export function submitLibraryIssueUrlFor(
  library: Pick<ScribblyLibrary, "name">,
  itemCount: number,
): string {
  return submitLibraryIssueUrl({ name: library.name, itemCount });
}
