// Mirrors the manifest shape produced by scribbly-libraries' build-manifest.ts.
// Kept here as a local copy because the app does not depend on the registry
// repo at build time — it only reads the deployed libraries.json over HTTP.

export type ManifestAuthor = {
  handle: string;
  url: string;
  displayName?: string;
};

export type ManifestEntry = {
  slug: string;
  name: string;
  description: string;
  author: ManifestAuthor;
  homepage?: string;
  license: string;
  tags: string[];
  itemCount: number;
  version: string;
  preview: string;
  download: string;
  sha256: string;
  publishedAt: number;
  updatedAt: number;
  deprecated?: boolean;
  deprecationNote?: string;
};

export type ManifestV1 = {
  type: "scribbly-libraries-manifest";
  version: 1;
  generatedAt: number;
  libraries: ManifestEntry[];
};
