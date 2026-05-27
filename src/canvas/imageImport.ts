import { useAppState } from "../store/appState";
import { createImage } from "./elements";

// Display cap on canvas. The element's stored width/height never exceed this.
const DISPLAY_MAX_DIM = 800;
// Source-pixel cap for the stored data URL. 2x display so the image stays
// crisp when the user zooms in.
const STORAGE_MAX_DIM = 1600;
// JPEG quality for re-encoded images. 0.85 is the standard "visually lossless"
// sweet spot — well below the size cliff while staying perceptually clean.
const JPEG_QUALITY = 0.85;
// Files smaller than this and already within STORAGE_MAX_DIM are kept as-is.
// Avoids re-encoding tiny logos/icons (and stripping their transparency).
const SKIP_COMPRESS_BYTES = 64 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImageBitmap(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function viewportCenterWorld(): { x: number; y: number } {
  const view = useAppState.getState().view;
  return {
    x: (window.innerWidth / 2 - view.x) / view.scale,
    y: (window.innerHeight / 2 - view.y) / view.scale,
  };
}

type CompressedImage = {
  dataUrl: string;
  // Natural pixel dimensions of the dataUrl (post-resize source).
  naturalWidth: number;
  naturalHeight: number;
};

async function compressImage(
  file: File,
  bitmap: HTMLImageElement,
): Promise<CompressedImage> {
  const sw = bitmap.naturalWidth;
  const sh = bitmap.naturalHeight;
  const ratio = Math.min(1, STORAGE_MAX_DIM / Math.max(sw, sh));
  const tw = Math.max(1, Math.round(sw * ratio));
  const th = Math.max(1, Math.round(sh * ratio));

  // Small originals within the storage cap: keep the bytes the browser gave
  // us. Preserves PNG transparency for icons/logos and avoids needless work.
  if (ratio === 1 && file.size <= SKIP_COMPRESS_BYTES) {
    const dataUrl = await readFileAsDataUrl(file);
    return { dataUrl, naturalWidth: sw, naturalHeight: sh };
  }

  // Lazy-load pica so it stays out of the initial bundle.
  const Pica = (await import("pica")).default;
  const pica = Pica();

  const source = document.createElement("canvas");
  source.width = sw;
  source.height = sh;
  const sctx = source.getContext("2d");
  if (!sctx) throw new Error("2D context unavailable");
  sctx.drawImage(bitmap, 0, 0);

  const target = document.createElement("canvas");
  target.width = tw;
  target.height = th;
  await pica.resize(source, target);

  // JPEG for photos (smaller); PNG only when the original had a transparency
  // hint (image/png) and we should preserve alpha. SVG/GIF/WEBP all flatten
  // safely to JPEG for this use case.
  const preservesAlpha = file.type === "image/png";
  const mime = preservesAlpha ? "image/png" : "image/jpeg";
  const quality = preservesAlpha ? undefined : JPEG_QUALITY;
  const blob = await pica.toBlob(target, mime, quality);
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, naturalWidth: tw, naturalHeight: th };
}

export async function importImageFile(
  file: File,
  opts: { roomId: string; centerWorld?: { x: number; y: number } },
): Promise<void> {
  if (!file.type.startsWith("image/")) return;
  const sourceUrl = await readFileAsDataUrl(file);
  const bitmap = await loadImageBitmap(sourceUrl);
  const compressed = await compressImage(file, bitmap);

  const displayRatio = Math.min(
    1,
    DISPLAY_MAX_DIM /
      Math.max(compressed.naturalWidth, compressed.naturalHeight),
  );
  const width = compressed.naturalWidth * displayRatio;
  const height = compressed.naturalHeight * displayRatio;
  const center = opts.centerWorld ?? viewportCenterWorld();
  const el = createImage({
    roomId: opts.roomId,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    dataUrl: compressed.dataUrl,
  });
  const state = useAppState.getState();
  state.pushHistory();
  state.addElement(el);
  state.setActiveTool("selection");
  state.setSelectedIds([el.id]);
}
