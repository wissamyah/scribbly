import type { InstantRules } from "@instantdb/react";

// Gallery admins. Hardcoded here because permission rules can't read Vite
// env vars — this list is the server-side source of truth for who can
// approve/reject submissions and resolve reports. Mirror it in
// VITE_ADMIN_EMAILS so the client knows whether to render the admin UI
// (visibility only — enforcement is here).
const ADMIN_EMAILS = "auth.email in ['wissam.yahfoufi@gmail.com']";

const rules = {
  // Canvas stays no-auth: the room slug is the only access control, same
  // trust model as before. Personal libraries also stay open — the
  // ownerKey/userId is the obscurity lever, identical to room slugs.
  rooms: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  elements: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  libraries: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  libraryItems: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  // Gallery: published entries are world-readable; pending/rejected ones
  // are visible only to their owner and admins. Anyone signed in can
  // submit (forced to `pending`); only admins can flip `status`/
  // `publishedAt`. Owners can edit their own entry's content or delete it.
  galleryLibraries: {
    bind: ["isAdmin", ADMIN_EMAILS],
    allow: {
      view: "data.status == 'published' || isAdmin || (auth.id != null && data.ownerId == auth.id)",
      create:
        "auth.id != null && newData.ownerId == auth.id && newData.status == 'pending'",
      // Owner may edit their own entry; if they touch `status` it can only
      // go back to `pending` (re-review on edit) — never self-publish — and
      // they can never set `publishedAt`. Admins are unrestricted.
      update:
        "isAdmin || (data.ownerId == auth.id && (!('status' in request.modifiedFields) || newData.status == 'pending') && !('publishedAt' in request.modifiedFields))",
      delete: "isAdmin || data.ownerId == auth.id",
    },
  },
  // Reports are write-only for signed-in users (who can only file under
  // their own id); only admins can read or resolve them.
  galleryReports: {
    bind: ["isAdmin", ADMIN_EMAILS],
    allow: {
      view: "isAdmin",
      create: "auth.id != null && newData.reporterId == auth.id",
      update: "isAdmin",
      delete: "isAdmin",
    },
  },
} satisfies InstantRules;

export default rules;
