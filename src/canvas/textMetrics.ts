export function measureText(
  text: string,
  fontSize: number,
  fontFamily: string,
): { width: number; height: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: 0, height: fontSize * 1.2 };
  ctx.font = `${fontSize}px ${fontFamily}`;
  const lines = text.length > 0 ? text.split("\n") : [""];
  let maxWidth = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxWidth) maxWidth = m.width;
  }
  return { width: maxWidth, height: lines.length * fontSize * 1.2 };
}

// Wraps `text` into lines that fit within `maxWidth` (in world units) using
// the same algorithm the canvas renderer uses for bound text, then returns
// the total height. Used by the text editor to grow the container as the
// user types so the rendered text never overflows the shape.
export function measureWrappedHeight(
  text: string,
  fontSize: number,
  fontFamily: string,
  maxWidth: number,
): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return fontSize * 1.2;
  ctx.font = `${fontSize}px ${fontFamily}`;
  const safeMax = Math.max(1, maxWidth);
  let lineCount = 0;
  for (const rawLine of (text.length > 0 ? text : "").split("\n")) {
    if (rawLine.length === 0) {
      lineCount += 1;
      continue;
    }
    const words = rawLine.split(/(\s+)/);
    let line = "";
    let lines = 0;
    const flush = (buf: string) => {
      if (ctx.measureText(buf).width > safeMax && buf.length > 1) {
        let cur = "";
        for (const ch of buf) {
          if (ctx.measureText(cur + ch).width > safeMax && cur.length > 0) {
            lines += 1;
            cur = ch;
          } else {
            cur += ch;
          }
        }
        if (cur.length > 0) lines += 1;
      } else {
        lines += 1;
      }
    };
    for (const word of words) {
      const candidate = line + word;
      if (ctx.measureText(candidate).width <= safeMax || line.length === 0) {
        line = candidate;
      } else {
        flush(line.replace(/\s+$/, ""));
        line = word.replace(/^\s+/, "");
      }
    }
    if (line.length === 0 && lines === 0) lines = 1;
    else if (line.length > 0) flush(line);
    lineCount += lines;
  }
  if (lineCount === 0) lineCount = 1;
  return lineCount * fontSize * 1.2;
}
