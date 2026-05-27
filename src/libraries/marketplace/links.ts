// External link builders for the marketplace UI. The gallery's Report and
// View-source links live in the registry's GitHub repo so all moderation
// flows route through PR/issue tooling — no in-app reporting endpoint.

import type { ManifestEntry } from "./types";

export const REGISTRY_REPO =
  (import.meta.env["VITE_LIBRARY_REGISTRY_REPO"] as string | undefined) ??
  "scribbly/scribbly-libraries";

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
