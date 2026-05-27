import type { ScribblyElement } from "../canvas/elements";

export type ScribblyLibrary = {
  id: string;
  ownerKey: string;
  name: string;
  isPublic: boolean;
  source: string;
  createdAt: number;
  updatedAt: number;
  // Marketplace provenance — populated when installed from a registry.
  sourceSlug?: string;
  sourceVersion?: string;
};

export type LibraryItem = {
  id: string;
  libraryId: string;
  name: string;
  elements: ScribblyElement[];
  preview: string;
  createdAt: number;
};

export const LIBRARY_FILE_VERSION = 1 as const;
export const LIBRARY_FILE_TYPE = "scribblylib" as const;
export const LIBRARY_FILE_EXT = ".scribblylib" as const;
export const LIBRARY_SOURCE_URL = "https://scribbly.app" as const;

export type LibraryFileItem = {
  id: string;
  name: string;
  elements: ScribblyElement[];
  preview: string;
  createdAt: number;
};

export type LibraryFile = {
  type: typeof LIBRARY_FILE_TYPE;
  version: typeof LIBRARY_FILE_VERSION;
  source: string;
  libraryItems: LibraryFileItem[];
};
