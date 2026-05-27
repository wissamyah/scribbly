import { useEffect, useMemo, useRef, useState } from "react";
import type { ScribblyElement } from "../canvas/elements";
import { dbWriteElements } from "../db/mutations";
import { downloadLibraryFile } from "../libraries/exportLibrary";
import {
  buildInsertElements,
  type InsertItemInput,
} from "../libraries/insertItem";
import {
  importLibraryFromFile,
  LibraryImportError,
  readLibraryFile,
} from "../libraries/importLibrary";
import type { ManifestEntry } from "../libraries/marketplace/types";
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
import { PromptDialog } from "./PromptDialog";
import styles from "./LibrarySidebar.module.scss";

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4z" />
      <path d="M4 17a3 3 0 0 1 3-3h11" />
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

type Props = {
  roomId: string;
};

const NEW_LIBRARY_LABEL = "Untitled library";

export function LibrarySidebar({ roomId }: Props) {
  const open = useAppState((s) => s.librarySidebarOpen);
  const setOpen = useAppState((s) => s.setLibrarySidebarOpen);
  const ownerKey = useOwnerKey();
  const { libraries } = useLibraries(ownerKey);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);

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

  if (!open) {
    return (
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        title="Library"
        aria-label="Open library"
      >
        <BookIcon />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${styles.active}`}
        onClick={() => setOpen(false)}
        title="Library"
        aria-label="Close library"
      >
        <BookIcon />
      </button>
      <SidebarBody
        roomId={roomId}
        ownerKey={ownerKey}
        libraries={libraries}
        activeLibraryId={activeLibraryId}
        setActiveLibraryId={setActiveLibraryId}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

type SidebarBodyProps = {
  roomId: string;
  ownerKey: string;
  libraries: ReturnType<typeof useLibraries>["libraries"];
  activeLibraryId: string | null;
  setActiveLibraryId: (id: string | null) => void;
  onClose: () => void;
};

type SidebarTab = "my" | "browse";

function SidebarBody({
  roomId,
  ownerKey,
  libraries,
  activeLibraryId,
  setActiveLibraryId,
  onClose,
}: SidebarBodyProps) {
  // Tab state is local — the parent (LibrarySidebar) doesn't care which
  // tab is showing. Deep-link installs nudge `tab` to "browse" via the
  // Zustand `pendingMarketplaceEntry` field (read below).
  const pendingMarketplaceEntry = useAppState(
    (s) => s.pendingMarketplaceEntry,
  );
  const clearPendingMarketplaceEntry = useAppState(
    (s) => s.clearPendingMarketplaceEntry,
  );
  const [tab, setTab] = useState<SidebarTab>(
    pendingMarketplaceEntry ? "browse" : "my",
  );
  useEffect(() => {
    if (pendingMarketplaceEntry) setTab("browse");
  }, [pendingMarketplaceEntry]);
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

  useEffect(() => setKeyDraft(ownerKey), [ownerKey]);

  useEffect(() => {
    if (toast === null) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const handleNewLibrary = () => {
    const id = createLibrary({ ownerKey, name: NEW_LIBRARY_LABEL });
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
      libraryId = createLibrary({ ownerKey, name: NEW_LIBRARY_LABEL });
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
    // Only clear when leaving the panel entirely.
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
    <div
      ref={panelRef}
      className={`${styles.panel} ${dragOver ? styles.dragOver : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.header}>
        <div className={styles.title}>Library</div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close library"
        >
          <CloseIcon />
        </button>
      </div>

      <div className={styles.tabBar} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "my"}
          className={`${styles.tab} ${tab === "my" ? styles.tabActive : ""}`}
          onClick={() => setTab("my")}
        >
          My libraries
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
      </div>

      {tab === "browse" ? (
        <BrowseTab
          ownerKey={ownerKey}
          installedLibraries={libraries}
          onInstalled={(id) => {
            setTab("my");
            setActiveLibraryId(id);
          }}
          initialEntry={pendingMarketplaceEntry as ManifestEntry | null}
          onInitialEntryConsumed={clearPendingMarketplaceEntry}
        />
      ) : (
      <>
      <div className={styles.row}>
        <select
          className={styles.select}
          value={activeLibraryId ?? ""}
          onChange={(e) => setActiveLibraryId(e.target.value || null)}
          disabled={libraries.length === 0}
        >
          {libraries.length === 0 && <option value="">No libraries yet</option>}
          {libraries.map((lib) => (
            <option key={lib.id} value={lib.id}>
              {lib.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={handleNewLibrary}
          title="New library"
          aria-label="New library"
        >
          <PlusIcon />
        </button>
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
          className={styles.iconBtn}
          onClick={handleDeleteLibrary}
          title="Delete library"
          aria-label="Delete library"
          disabled={!activeLibrary}
        >
          <TrashIcon />
        </button>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Items</div>
        {items.length === 0 ? (
          <div className={styles.empty}>
            {activeLibrary
              ? "Select shapes on the canvas, then click “Save selection” below."
              : "Create a library to start saving shapes."}
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
                  <img src={item.preview} alt={item.name} draggable={false} />
                ) : (
                  <span>{item.name}</span>
                )}
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

      {selectedElements.length === 0 ? (
        <div className={styles.savePreviewEmpty}>
          Select shapes on the canvas to save them here
        </div>
      ) : (
        <button
          type="button"
          className={styles.savePreview}
          onClick={handleSaveSelection}
          title="Add selection to library"
          aria-label="Add selection to library"
        >
          {selectionPreview && (
            <img src={selectionPreview} alt="" draggable={false} />
          )}
          <span className={styles.savePreviewPlus} aria-hidden="true">
            <PlusIcon />
          </span>
        </button>
      )}

      <div className={styles.divider} />

      <div className={styles.row}>
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
        <button
          type="button"
          className={styles.button}
          onClick={handleImportClick}
          title="Import a .scribblylib file"
        >
          <UploadIcon />
          Import
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

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.label}>Library key (same key = same libraries)</div>
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
            disabled={keyDraft.trim() === ownerKey || keyDraft.trim().length === 0}
          >
            <CheckIcon />
          </button>
        </div>
        <div className={styles.keyHelp}>
          Paste your key on another device to access the same libraries. Anyone
          with the key has full read/write — keep it private.
        </div>
      </div>
      </>
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
    </div>
  );
}
