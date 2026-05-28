import { useEffect, useMemo, useRef, useState } from "react";
import type { ScribblyElement } from "../canvas/elements";
import { AccountControl } from "../auth/AccountControl";
import { isAdminEmail } from "../auth/isAdmin";
import { SignInDialog } from "../auth/SignInDialog";
import { useSession } from "../auth/useSession";
import { dbWriteElements } from "../db/mutations";
import { downloadLibraryFile } from "../libraries/exportLibrary";
import type { GalleryLibrary } from "../libraries/gallery/types";
import {
  buildInsertElements,
  type InsertItemInput,
} from "../libraries/insertItem";
import {
  importLibraryFromFile,
  LibraryImportError,
  readLibraryFile,
} from "../libraries/importLibrary";
import {
  dismissMigration,
  migrateLibrariesToAccount,
  useMigrationCandidates,
  wasMigrationDismissed,
} from "../libraries/migrateToAccount";
import {
  createLibrary,
  deleteLibrary,
  deleteLibraryItem,
  renameLibrary,
} from "../libraries/mutations";
import { getOwnerKey, setOwnerKey, useOwnerKey } from "../libraries/ownerKey";
import { renderItemPreview } from "../libraries/preview";
import { saveSelectionToLibrary } from "../libraries/saveSelection";
import { useLibraries } from "../libraries/useLibraries";
import { useLibraryItems } from "../libraries/useLibraryItems";
import type { LibraryItem } from "../libraries/types";
import { useAppState } from "../store/appState";
import { BrowseTab } from "./BrowseTab";
import { ConfirmDialog } from "./ConfirmDialog";
import { MySubmissions } from "./MySubmissions";
import { PromptDialog } from "./PromptDialog";
import { PublishLibraryDialog } from "./PublishLibraryDialog";
import { ReviewQueue } from "./ReviewQueue";
import styles from "./LibrarySidebar.module.scss";

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l11-11-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v12M6 11l6 6 6-6M4 21h16" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20V8M6 13l6-6 6 6M4 4h16" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6M20 4L10 14M18 14v6H4V6h6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

type Props = {
  roomId: string;
};

const NEW_LIBRARY_LABEL = "Untitled library";

export function LibrarySidebar({ roomId }: Props) {
  const open = useAppState((s) => s.librarySidebarOpen);
  const setOpen = useAppState((s) => s.setLibrarySidebarOpen);
  const ownerKey = useOwnerKey();
  const session = useSession();
  const { libraries } = useLibraries(ownerKey, session.userId);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);

  // Keep the drawer mounted briefly after `open` flips to false so the
  // slide-out animation can play before it unmounts.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 220);
    return () => clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (libraries.length === 0) {
      if (activeLibraryId !== null) setActiveLibraryId(null);
      return;
    }
    if (
      activeLibraryId === null ||
      !libraries.find((l) => l.id === activeLibraryId)
    ) {
      setActiveLibraryId(libraries[0]!.id);
    }
  }, [libraries, activeLibraryId]);

  return (
    <>
      {!open && (
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpen(true)}
          title="Library"
          aria-label="Open library"
        >
          <BookIcon />
          <span className={styles.triggerLabel}>Library</span>
        </button>
      )}
      {mounted && (
        <SidebarBody
          roomId={roomId}
          ownerKey={ownerKey}
          session={session}
          libraries={libraries}
          activeLibraryId={activeLibraryId}
          setActiveLibraryId={setActiveLibraryId}
          closing={closing}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type SidebarBodyProps = {
  roomId: string;
  ownerKey: string;
  session: ReturnType<typeof useSession>;
  libraries: ReturnType<typeof useLibraries>["libraries"];
  activeLibraryId: string | null;
  setActiveLibraryId: (id: string | null) => void;
  closing: boolean;
  onClose: () => void;
};

type SidebarTab = "my" | "browse" | "submissions" | "review";

type PublishState =
  | { mode: "new" }
  | { mode: "edit"; entry: GalleryLibrary }
  | null;

function SidebarBody({
  roomId,
  ownerKey,
  session,
  libraries,
  activeLibraryId,
  setActiveLibraryId,
  closing,
  onClose,
}: SidebarBodyProps) {
  const pendingGallerySlug = useAppState((s) => s.pendingGallerySlug);
  const clearPendingGallerySlug = useAppState((s) => s.clearPendingGallerySlug);
  const [tab, setTab] = useState<SidebarTab>(
    pendingGallerySlug ? "browse" : "my",
  );
  useEffect(() => {
    if (pendingGallerySlug) setTab("browse");
  }, [pendingGallerySlug]);

  const isAdmin = isAdminEmail(session.email);
  const { items } = useLibraryItems(activeLibraryId);
  const selectedIds = useAppState((s) => s.selectedIds);
  const elements = useAppState((s) => s.elements);
  const addElements = useAppState((s) => s.addElements);
  const view = useAppState((s) => s.view);

  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === activeLibraryId) ?? null,
    [libraries, activeLibraryId],
  );

  const selectedElements = useMemo(() => {
    if (selectedIds.length === 0) return [] as ScribblyElement[];
    const set = new Set(selectedIds);
    return elements.filter((el) => set.has(el.id));
  }, [selectedIds, elements]);

  const selectionPreview = useMemo(() => {
    if (selectedElements.length === 0) return "";
    return renderItemPreview(selectedElements);
  }, [selectedElements]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [keyDraft, setKeyDraft] = useState(ownerKey);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [libMenuOpen, setLibMenuOpen] = useState(false);
  const libMenuRef = useRef<HTMLDivElement>(null);
  const [promptConfig, setPromptConfig] = useState<{
    title: string;
    message?: string;
    label?: string;
    initialValue: string;
    confirmLabel: string;
    onConfirm: (value: string) => void;
  } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone?: "default" | "danger";
    onConfirm: () => void;
  } | null>(null);
  const [publishState, setPublishState] = useState<PublishState>(null);
  const [signInReason, setSignInReason] = useState<string | null>(null);
  const requireSignIn = (reason: string) => setSignInReason(reason);

  // First-sign-in migration: offer to move libraries created under the local
  // ownerKey into the signed-in account.
  const migrationCandidates = useMigrationCandidates(ownerKey, session.userId);
  const [migrationOpen, setMigrationOpen] = useState(false);
  useEffect(() => {
    if (!session.userId) return;
    if (migrationCandidates.length === 0) return;
    if (wasMigrationDismissed(session.userId)) return;
    setMigrationOpen(true);
  }, [session.userId, migrationCandidates.length]);

  const handleOpenSubmit = () => {
    if (!session.userId) {
      requireSignIn("Sign in to submit a library to the gallery.");
      return;
    }
    if (!activeLibrary || items.length === 0) {
      setTab("my");
      setToast("Pick a library with at least one item, then Submit");
      return;
    }
    setPublishState({ mode: "new" });
  };

  useEffect(() => setKeyDraft(ownerKey), [ownerKey]);

  useEffect(() => {
    if (toast === null) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  // Escape closes the drawer, but only when no nested dialog is open — those
  // own the key while visible so the user can dismiss them first. An open
  // library dropdown swallows the first Escape so it closes before the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        promptConfig ||
        confirmConfig ||
        publishState ||
        signInReason ||
        migrationOpen
      )
        return;
      if (libMenuOpen) {
        setLibMenuOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    promptConfig,
    confirmConfig,
    publishState,
    signInReason,
    migrationOpen,
    libMenuOpen,
    onClose,
  ]);

  // Dismiss the library dropdown on outside click, and whenever the tab changes.
  useEffect(() => {
    if (!libMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (libMenuRef.current && !libMenuRef.current.contains(e.target as Node)) {
        setLibMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [libMenuOpen]);

  useEffect(() => setLibMenuOpen(false), [tab]);

  const handleNewLibrary = () => {
    const id = createLibrary({
      ownerKey,
      name: NEW_LIBRARY_LABEL,
      ...(session.userId ? { userId: session.userId } : {}),
    });
    setActiveLibraryId(id);
  };

  const handleRenameLibrary = () => {
    if (!activeLibrary) return;
    const target = activeLibrary;
    setPromptConfig({
      title: "Rename library",
      label: "Library name",
      initialValue: target.name,
      confirmLabel: "Rename",
      onConfirm: (value) => renameLibrary(target.id, value),
    });
  };

  const handleDeleteLibrary = () => {
    if (!activeLibrary) return;
    const target = activeLibrary;
    const itemIds = items.map((i) => i.id);
    setConfirmConfig({
      title: "Delete library",
      message: `Delete library "${target.name}"? This removes all of its items.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: () => {
        deleteLibrary(target.id, itemIds);
        setActiveLibraryId(null);
      },
    });
  };

  const handleSaveSelection = () => {
    if (selectedElements.length === 0) return;
    let libraryId = activeLibraryId;
    if (!libraryId) {
      libraryId = createLibrary({
        ownerKey,
        name: NEW_LIBRARY_LABEL,
        ...(session.userId ? { userId: session.userId } : {}),
      });
      setActiveLibraryId(libraryId);
    }
    const targetLibraryId = libraryId;
    const snapshot = selectedElements;
    setPromptConfig({
      title: "Save to library",
      label: "Item name",
      initialValue: "Item",
      confirmLabel: "Save",
      onConfirm: (value) => {
        saveSelectionToLibrary({
          libraryId: targetLibraryId,
          name: value,
          elements: snapshot,
        });
        setToast("Saved to library");
      },
    });
  };

  const insertItem = (item: LibraryItem) => {
    const center = {
      x: (window.innerWidth / 2 - view.x) / view.scale,
      y: (window.innerHeight / 2 - view.y) / view.scale,
    };
    const input: InsertItemInput = { item, roomId, drop: center };
    const fresh = buildInsertElements(input);
    if (fresh.length === 0) return;
    addElements(fresh);
    void dbWriteElements(fresh);
  };

  const handleExport = () => {
    if (!activeLibrary) return;
    downloadLibraryFile(activeLibrary, items);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const importFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try {
        const parsed = await readLibraryFile(f);
        const id = importLibraryFromFile(parsed, {
          ownerKey,
          ...(session.userId ? { userId: session.userId } : {}),
          defaultName: f.name.replace(/\.scribblylib$/i, "") || NEW_LIBRARY_LABEL,
        });
        setActiveLibraryId(id);
        setToast(`Imported ${parsed.libraryItems.length} item(s)`);
      } catch (err) {
        const msg =
          err instanceof LibraryImportError
            ? err.message
            : "Could not import file";
        setToast(msg);
      }
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await importFiles(e.target.files);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    setDragOver(false);
    await importFiles(e.dataTransfer.files);
  };

  const applyKeyPaste = () => {
    const trimmed = keyDraft.trim();
    if (trimmed.length === 0) return;
    if (trimmed === ownerKey) {
      setToast("Already using this key");
      return;
    }
    setOwnerKey(trimmed);
    setActiveLibraryId(null);
    setToast("Switched to pasted key");
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(getOwnerKey());
      setToast("Key copied to clipboard");
    } catch {
      setToast("Could not copy");
    }
  };

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-label="Library"
      className={`${styles.panel} ${closing ? styles.closing : ""} ${
        dragOver ? styles.dragOver : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandBadge} aria-hidden="true">
            <BookIcon />
          </span>
          <span className={styles.brandText}>
            <span className={styles.title}>Library</span>
            <span className={styles.subtitle}>Your shape collections</span>
          </span>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close library"
        >
          <CloseIcon />
        </button>
      </div>

      <div className={styles.account}>
        <AccountControl
          session={session}
          onSignIn={() =>
            requireSignIn("Sign in to publish and manage libraries.")
          }
        />
      </div>

      <div className={styles.tabBar} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "my"}
          className={`${styles.tab} ${tab === "my" ? styles.tabActive : ""}`}
          onClick={() => setTab("my")}
        >
          Mine
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "browse"}
          className={`${styles.tab} ${tab === "browse" ? styles.tabActive : ""}`}
          onClick={() => setTab("browse")}
        >
          Browse
        </button>
        {session.userId && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "submissions"}
            className={`${styles.tab} ${tab === "submissions" ? styles.tabActive : ""}`}
            onClick={() => setTab("submissions")}
          >
            Submitted
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "review"}
            className={`${styles.tab} ${tab === "review" ? styles.tabActive : ""}`}
            onClick={() => setTab("review")}
          >
            Review
          </button>
        )}
      </div>

      {tab === "my" && (
        <div className={styles.switcherBar} ref={libMenuRef}>
          <div className={styles.switcher}>
            <button
              type="button"
              className={styles.switcherBtn}
              onClick={() => setLibMenuOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={libMenuOpen}
            >
              <span className={styles.switcherName}>
                {activeLibrary ? activeLibrary.name : "No libraries yet"}
              </span>
              {activeLibrary && (
                <span className={styles.switcherCount}>
                  {items.length} item{items.length === 1 ? "" : "s"}
                </span>
              )}
              <span className={styles.switcherChevron} aria-hidden="true">
                <ChevronIcon />
              </span>
            </button>
            {libMenuOpen && (
              <div className={styles.switcherMenu} role="listbox">
                <div className={styles.switcherList}>
                  {libraries.length === 0 && (
                    <div className={styles.switcherEmpty}>No libraries yet</div>
                  )}
                  {libraries.map((lib) => (
                    <button
                      key={lib.id}
                      type="button"
                      role="option"
                      aria-selected={lib.id === activeLibraryId}
                      className={`${styles.switcherOption} ${
                        lib.id === activeLibraryId
                          ? styles.switcherOptionActive
                          : ""
                      }`}
                      onClick={() => {
                        setActiveLibraryId(lib.id);
                        setLibMenuOpen(false);
                      }}
                    >
                      <span className={styles.switcherOptionName}>
                        {lib.name}
                      </span>
                      {lib.id === activeLibraryId && (
                        <span className={styles.switcherTick} aria-hidden="true">
                          <CheckIcon />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.switcherNew}
                  onClick={() => {
                    handleNewLibrary();
                    setLibMenuOpen(false);
                  }}
                >
                  <PlusIcon />
                  New library
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleRenameLibrary}
            title="Rename library"
            aria-label="Rename library"
            disabled={!activeLibrary}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.danger}`}
            onClick={handleDeleteLibrary}
            title="Delete library"
            aria-label="Delete library"
            disabled={!activeLibrary}
          >
            <TrashIcon />
          </button>
        </div>
      )}

      <div className={styles.body}>
        {tab === "browse" ? (
          <BrowseTab
            ownerKey={ownerKey}
            session={session}
            installedLibraries={libraries}
            onInstalled={(id) => {
              setTab("my");
              setActiveLibraryId(id);
            }}
            onSubmitClick={handleOpenSubmit}
            requireSignIn={requireSignIn}
            initialSlug={pendingGallerySlug}
            onInitialSlugConsumed={clearPendingGallerySlug}
          />
        ) : tab === "submissions" ? (
          <MySubmissions
            session={session}
            onEdit={(entry) => setPublishState({ mode: "edit", entry })}
          />
        ) : tab === "review" ? (
          <ReviewQueue enabled={isAdmin} />
        ) : (
          <div className={styles.myTab}>
            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.label}>Items</span>
                {items.length > 0 && (
                  <span className={styles.count}>{items.length}</span>
                )}
              </div>
              {items.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyArt} aria-hidden="true">
                    <GridIcon />
                  </span>
                  <span>
                    {activeLibrary
                      ? "No items yet — select shapes on the canvas and save them with the bar below."
                      : "Create a library to start saving shapes."}
                  </span>
                </div>
              ) : (
                <div className={styles.itemsGrid}>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.itemTile}
                      title={`${item.name} — click to insert`}
                      onClick={() => insertItem(item)}
                    >
                      {item.preview ? (
                        <img
                          src={item.preview}
                          alt={item.name}
                          draggable={false}
                        />
                      ) : (
                        <span>{item.name}</span>
                      )}
                      <span className={styles.itemCaption}>{item.name}</span>
                      <span
                        role="button"
                        tabIndex={-1}
                        className={styles.itemRemove}
                        title="Remove from library"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmConfig({
                            title: "Remove item",
                            message: `Remove "${item.name}" from this library?`,
                            confirmLabel: "Remove",
                            tone: "danger",
                            onConfirm: () => deleteLibraryItem(item.id),
                          });
                        }}
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.submitCard}>
              <div className={styles.submitCardHead}>
                <span className={styles.submitCardTitle}>Share with everyone</span>
                <span className={styles.submitCardText}>
                  Publish to the public gallery — a maintainer reviews it before
                  it goes live.
                </span>
              </div>
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleOpenSubmit}
                disabled={!activeLibrary || items.length === 0}
                title={
                  activeLibrary && items.length > 0
                    ? "Share this library in the public gallery"
                    : "Add at least one item before submitting"
                }
              >
                <ShareIcon />
                Submit to gallery
              </button>
            </div>

            <div className={styles.fileRow}>
              <button
                type="button"
                className={styles.button}
                onClick={handleImportClick}
                title="Import a .scribblylib file"
              >
                <UploadIcon />
                Import
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={handleExport}
                disabled={!activeLibrary || items.length === 0}
                title="Export library as .scribblylib"
              >
                <DownloadIcon />
                Export
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".scribblylib,application/json"
                style={{ display: "none" }}
                onChange={handleFileInput}
                multiple
              />
            </div>

            <div className={styles.section}>
              <button
                type="button"
                className={styles.keyToggle}
                onClick={() => setShowKey((v) => !v)}
                aria-expanded={showKey}
              >
                <span>Sync key &amp; advanced</span>
                <ChevronIcon />
              </button>
              {showKey && (
                <div className={styles.keyPanel}>
                  <div className={styles.keyRow}>
                    <input
                      type="text"
                      className={styles.keyInput}
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      spellCheck={false}
                      aria-label="Library key"
                    />
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={copyKey}
                      title="Copy key"
                      aria-label="Copy key"
                    >
                      <CopyIcon />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={applyKeyPaste}
                      title="Apply pasted key"
                      aria-label="Apply pasted key"
                      disabled={
                        keyDraft.trim() === ownerKey ||
                        keyDraft.trim().length === 0
                      }
                    >
                      <CheckIcon />
                    </button>
                  </div>
                  <div className={styles.keyHelp}>
                    {session.userId
                      ? "Signed in — your libraries follow your account automatically. The key still works for sharing with devices that aren't signed in."
                      : "Same key = same libraries. Paste your key on another device to access these libraries. Anyone with the key has full read/write — keep it private."}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {tab === "my" && (
        <div className={styles.saveBar}>
          {selectedElements.length === 0 ? (
            <div className={styles.saveBarHint}>
              <span className={styles.saveBarHintIcon} aria-hidden="true">
                <PlusIcon />
              </span>
              <span>Select shapes on the canvas to save them</span>
            </div>
          ) : (
            <button
              type="button"
              className={styles.saveBarAction}
              onClick={handleSaveSelection}
              title="Add selection to library"
            >
              <span className={styles.saveBarThumb}>
                {selectionPreview && (
                  <img src={selectionPreview} alt="" draggable={false} />
                )}
              </span>
              <span className={styles.saveBarLabel}>
                Save {selectedElements.length} shape
                {selectedElements.length === 1 ? "" : "s"}
              </span>
              <span className={styles.saveBarPlus} aria-hidden="true">
                <PlusIcon />
              </span>
            </button>
          )}
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}

      <PromptDialog
        open={promptConfig !== null}
        title={promptConfig?.title ?? ""}
        message={promptConfig?.message}
        label={promptConfig?.label}
        initialValue={promptConfig?.initialValue ?? ""}
        confirmLabel={promptConfig?.confirmLabel}
        onCancel={() => setPromptConfig(null)}
        onConfirm={(value) => {
          promptConfig?.onConfirm(value);
          setPromptConfig(null);
        }}
      />

      <ConfirmDialog
        open={confirmConfig !== null}
        title={confirmConfig?.title ?? ""}
        message={confirmConfig?.message ?? ""}
        confirmLabel={confirmConfig?.confirmLabel}
        tone={confirmConfig?.tone}
        onCancel={() => setConfirmConfig(null)}
        onConfirm={() => {
          confirmConfig?.onConfirm();
          setConfirmConfig(null);
        }}
      />

      <PublishLibraryDialog
        open={publishState !== null}
        library={publishState?.mode === "edit" ? null : activeLibrary}
        items={publishState?.mode === "edit" ? [] : items}
        session={session}
        existing={publishState?.mode === "edit" ? publishState.entry : null}
        onClose={() => setPublishState(null)}
        onPublished={(message) => {
          setToast(message);
          setTab("submissions");
        }}
      />

      <SignInDialog
        open={signInReason !== null}
        reason={signInReason}
        onClose={() => setSignInReason(null)}
      />

      <ConfirmDialog
        open={migrationOpen}
        title="Move libraries to your account?"
        message={`You have ${migrationCandidates.length} local librar${
          migrationCandidates.length === 1 ? "y" : "ies"
        } on this device. Move ${
          migrationCandidates.length === 1 ? "it" : "them"
        } to your account so they sync across your devices automatically?`}
        confirmLabel="Move to account"
        cancelLabel="Not now"
        onCancel={() => {
          if (session.userId) dismissMigration(session.userId);
          setMigrationOpen(false);
        }}
        onConfirm={() => {
          if (session.userId) {
            migrateLibrariesToAccount(migrationCandidates, session.userId);
            dismissMigration(session.userId);
          }
          setMigrationOpen(false);
          setToast("Libraries moved to your account");
        }}
      />
    </aside>
  );
}
