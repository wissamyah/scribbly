// Mounts once at the app root. Reads ?library=<slug> on first paint, opens
// the Library sidebar, and stashes the slug so BrowseTab opens the install
// dialog for that entry. No external URLs or trusted-host checks — every
// gallery library lives in our own DB, so there's nothing untrusted to warn
// about. ?library= is stripped from the URL so reloads don't re-trigger.

import { useEffect } from "react";

import {
  clearLibraryParam,
  readLibraryParam,
} from "../libraries/gallery/deepLink";
import { useAppState } from "../store/appState";

export function GalleryDeepLink() {
  const setLibrarySidebarOpen = useAppState((s) => s.setLibrarySidebarOpen);
  const setPendingGallerySlug = useAppState((s) => s.setPendingGallerySlug);

  useEffect(() => {
    const slug = readLibraryParam();
    if (!slug) return;
    clearLibraryParam();
    setPendingGallerySlug(slug);
    setLibrarySidebarOpen(true);
  }, [setLibrarySidebarOpen, setPendingGallerySlug]);

  return null;
}
