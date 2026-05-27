import { i } from "@instantdb/react";

const _schema = i.schema({
  rooms: {
    canvas: {
      presence: i.entity({
        // Plaintext presence (used when the room is not encrypted).
        userId: i.string().optional(),
        name: i.string().optional(),
        color: i.string().optional(),
        cursor: i.json<{ x: number; y: number } | null>().optional(),
        t: i.number().optional(),
        // Encrypted presence (used when the room is end-to-end encrypted).
        // The decrypted payload has the same shape as the plaintext fields
        // above. Peers without the room key are filtered out client-side.
        ciphertext: i.string().optional(),
        iv: i.string().optional(),
      }),
    },
  },
  entities: {
    rooms: i.entity({
      slug: i.string().unique().indexed(),
      name: i.string(),
      createdAt: i.number(),
      // When true, all elements in this room are stored as AES-GCM
      // ciphertext. Clients must supply the room key (from the URL hash)
      // to read or write. Older rooms without this flag are plaintext.
      encrypted: i.boolean().optional(),
      // Local userId of whoever created the room. Only this client can
      // toggle `sharingActive`. Legacy rooms without this field have no
      // owner — sharing stays open.
      ownerUserId: i.string().optional(),
      // When false, only the owner sees/edits the canvas. Peers are
      // ejected client-side. Undefined is treated as true (legacy rooms).
      sharingActive: i.boolean().optional(),
    }),
    elements: i.entity({
      roomId: i.string().indexed(),
      type: i.string(),
      x: i.number(),
      y: i.number(),
      width: i.number(),
      height: i.number(),
      angle: i.number(),
      strokeColor: i.string(),
      backgroundColor: i.string(),
      fillStyle: i.string(),
      strokeWidth: i.number(),
      strokeStyle: i.string(),
      roughness: i.number(),
      opacity: i.number(),
      points: i.json(),
      text: i.string(),
      fontSize: i.number(),
      fontFamily: i.string(),
      fontColor: i.string().optional(),
      textAlign: i.string(),
      verticalAlign: i.string().optional(),
      seed: i.number(),
      version: i.number(),
      isDeleted: i.boolean().indexed(),
      updatedAt: i.number(),
      // Arrow-only; non-arrow elements legitimately send null.
      bendPoint: i.json().optional(),
      startBinding: i.json().optional(),
      endBinding: i.json().optional(),
      zIndex: i.number().indexed(),
      cornerRadius: i.number(),
      groupId: i.string().indexed(),
      isLocked: i.boolean().indexed().optional(),
      frameId: i.string().indexed().optional(),
      name: i.string().optional(),
      startArrowhead: i.string(),
      endArrowhead: i.string(),
      // Only text elements set this; rectangles/ellipses/etc. leave it null.
      containerId: i.string().indexed().optional(),
      // When set, the row's semantic fields above are zeroed out and the
      // real payload is encrypted here. `id`, `roomId`, `isDeleted`,
      // `version`, `updatedAt`, `zIndex` stay plain so the query layer
      // can still filter and sort.
      ciphertext: i.string().optional(),
      iv: i.string().optional(),
    }),
    libraries: i.entity({
      ownerKey: i.string().indexed(),
      name: i.string(),
      isPublic: i.boolean(),
      source: i.string(),
      createdAt: i.number(),
      updatedAt: i.number(),
      // Marketplace provenance. Set when a library was installed from
      // libraries.scribbly.app (or another registry); empty for libraries
      // the user authored locally. Drives the "Update available" banner —
      // compare `sourceVersion` against the manifest entry's `version`.
      sourceSlug: i.string().optional(),
      sourceVersion: i.string().optional(),
    }),
    libraryItems: i.entity({
      libraryId: i.string().indexed(),
      name: i.string(),
      elements: i.json(),
      preview: i.string(),
      createdAt: i.number(),
    }),
  },
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
