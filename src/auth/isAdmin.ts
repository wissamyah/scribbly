// Client-side admin check — controls whether the admin UI (review queue,
// reports inbox) is shown. This is NOT the security boundary: the real
// enforcement lives in instant.perms.ts, which hardcodes the same list.
// Keep VITE_ADMIN_EMAILS in sync with the perms file.

const ADMIN_EMAILS = parseAdmins(
  (import.meta.env["VITE_ADMIN_EMAILS"] as string | undefined) ?? "",
);

function parseAdmins(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
