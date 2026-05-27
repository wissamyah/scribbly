import { useEffect, useState } from "react";
import { Canvas } from "./canvas/Canvas";
import { useCollabPresence, type Peer } from "./collab/usePresence";
import { useElementsSync } from "./db/useElements";
import { useRoom } from "./db/useRoom";
import { useTombstoneCleanup } from "./db/useTombstoneCleanup";
import { useAppState } from "./store/appState";
import { BottomLeftControls } from "./ui/BottomLeftControls";
import { EditorMenu } from "./ui/EditorMenu";
import { LibrarySidebar } from "./ui/LibrarySidebar";
import { LiveCollabDialog } from "./ui/LiveCollabDialog";
import { LoadingRoomScreen } from "./ui/LoadingRoomScreen";
import { MarketplaceDeepLink } from "./ui/MarketplaceDeepLink";
import { PeersCursors } from "./ui/PeersCursors";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { SessionEndedScreen } from "./ui/SessionEndedScreen";
import { ShareExport } from "./ui/ShareExport";
import { ShortcutsOverlay } from "./ui/ShortcutsOverlay";
import { FrameNameEditor } from "./ui/FrameNameEditor";
import { TextEditor } from "./ui/TextEditor";
import { Toolbar } from "./ui/Toolbar";
import { VerticalZoomControl } from "./ui/VerticalZoomControl";

export default function App() {
  const room = useRoom();
  const theme = useAppState((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (room.isLoading) {
    return <LoadingRoomScreen />;
  }

  // Peers (non-owners) lose access entirely when the owner stops sharing.
  // The owner keeps editing locally — sharingActive only gates peers.
  if (!room.isOwner && !room.sharingActive) {
    return <SessionEndedScreen />;
  }

  return (
    <AppInner
      roomId={room.roomId}
      isOwner={room.isOwner}
      sharingActive={room.sharingActive}
      setSharingActive={room.setSharingActive}
    />
  );
}

type CollabHandle = {
  peers: Peer[];
  publishCursor: (world: { x: number; y: number } | null) => void;
};

const INACTIVE_COLLAB: CollabHandle = {
  peers: [],
  publishCursor: () => {},
};

type AppInnerProps = {
  roomId: string;
  isOwner: boolean;
  sharingActive: boolean;
  setSharingActive: (active: boolean) => void;
};

function AppInner({
  roomId,
  isOwner,
  sharingActive,
  setSharingActive,
}: AppInnerProps) {
  useElementsSync(roomId);
  // Tombstone cleanup is a destructive housekeeping job — only the owner
  // performs it, so peers without owner status never delete anything.
  useTombstoneCleanup(roomId, { enabled: isOwner });
  const zenMode = useAppState((s) => s.zenMode);
  const [collab, setCollab] = useState<CollabHandle>(INACTIVE_COLLAB);
  // Presence runs only while the owner is sharing. When the owner stops,
  // the bridge unmounts on every client and cursors disappear locally.
  const presenceLive = sharingActive;
  const handle = presenceLive ? collab : INACTIVE_COLLAB;

  return (
    <>
      <Canvas roomId={roomId} publishCursor={handle.publishCursor} />
      <PeersCursors peers={handle.peers} />
      {presenceLive && (
        <CollabBridge roomId={roomId} onChange={setCollab} />
      )}
      {!zenMode && (
        <>
          <EditorMenu />
          <Toolbar roomId={roomId} />
          <PropertiesPanel />
          <LibrarySidebar roomId={roomId} />
          <ShareExport
            roomId={roomId}
            sharingActive={sharingActive}
            isOwner={isOwner}
          />
          <ShortcutsOverlay />
          <VerticalZoomControl />
        </>
      )}
      <BottomLeftControls />
      <TextEditor roomId={roomId} />
      <FrameNameEditor />
      <MarketplaceDeepLink />
      <LiveCollabDialog
        peers={handle.peers}
        isOwner={isOwner}
        sharingActive={sharingActive}
        setSharingActive={setSharingActive}
      />
      {zenMode && <ZenModeBadge />}
    </>
  );
}

function CollabBridge({
  roomId,
  onChange,
}: {
  roomId: string;
  onChange: (handle: CollabHandle) => void;
}) {
  const { peers, publishCursor } = useCollabPresence(roomId);
  useEffect(() => {
    onChange({ peers, publishCursor });
  }, [peers, publishCursor, onChange]);
  useEffect(() => {
    return () => onChange(INACTIVE_COLLAB);
  }, [onChange]);
  return null;
}

function ZenModeBadge() {
  const setZenMode = useAppState((s) => s.setZenMode);
  return (
    <button
      type="button"
      onClick={() => setZenMode(false)}
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 20,
        background: "#111827",
        color: "#ffffff",
        border: "none",
        borderRadius: 8,
        padding: "8px 14px",
        fontSize: 13,
        cursor: "pointer",
        boxShadow: "var(--shadow-md)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      Exit zen mode
    </button>
  );
}
