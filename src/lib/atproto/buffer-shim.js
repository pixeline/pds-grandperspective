import { Buffer } from 'buffer';

// @atproto/repo's CAR reader calls Buffer.concat/from/isView/byteLength, which
// are Node globals. Without this the CAR path throws on the first varint and
// read.js silently falls back to listRecords -- losing the exact stored byte
// sizes that are the whole reason the CAR path exists.
const g = /** @type {{ Buffer?: typeof Buffer }} */ (/** @type {unknown} */ (globalThis));
if (typeof g.Buffer === 'undefined') g.Buffer = Buffer;
