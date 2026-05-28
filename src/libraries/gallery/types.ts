import type { LibraryFile } from "../types";

export type GalleryStatus = "pending" | "published" | "rejected";

// A library published to the in-app gallery. The full .scribblylib payload
// is stored inline (`payload`) so install is a pure DB read.
export type GalleryLibrary = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  license: string;
  authorHandle: string;
  itemCount: number;
  coverPreview: string;
  payload: LibraryFile;
  status: GalleryStatus;
  rejectionNote?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
};

export type GalleryReport = {
  id: string;
  librarySlug: string;
  reason: string;
  detail?: string;
  resolved: boolean;
  createdAt: number;
};

// SPDX license ids the gallery accepts. Mirrors the set the old registry
// allowed; permissive + Creative Commons.
export const LICENSES = [
  "MIT",
  "Apache-2.0",
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
] as const;
export type License = (typeof LICENSES)[number];

// Controlled tag vocabulary — keeps the Browse filter list bounded.
export const TAG_VOCAB = [
  "diagrams",
  "infrastructure",
  "ui",
  "icons",
  "flowcharts",
  "shapes",
  "annotations",
  "mindmap",
  "wireframe",
  "education",
  "business",
  "misc",
] as const;
export type Tag = (typeof TAG_VOCAB)[number];

export const REPORT_REASONS = [
  "Inappropriate content",
  "Copyright / attribution issue",
  "Spam or low quality",
  "Broken on install",
  "Other",
] as const;

// What the publish form collects. The payload/preview/itemCount are derived
// from the library being published, not entered by the user.
export type PublishMeta = {
  name: string;
  description: string;
  tags: string[];
  license: string;
  authorHandle: string;
};
