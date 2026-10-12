/**
 * Wire protocol for serverless peer-to-peer play. Pure functions, no I/O, no
 * dependencies - runs unchanged in a browser module and in node.
 *
 * Two things live here:
 *
 *   1. Frame codec. DataChannels already preserve message boundaries, so a frame
 *      needs no length prefix - but it does need chunking, because a reliable
 *      DataChannel message is capped (64 KB in libdatachannel, and browsers vary),
 *      while a map load or a replay can be megabytes. So: a fixed 16-byte header
 *      carrying type, sequence, and chunk position, plus a reassembler that
 *      refuses to buffer without bound.
 *
 *   2. Signaling blobs. There is no signaling server. Peers exchange one opaque
 *      string each (copy/paste, QR code, a DM, whatever), and that string is the
 *      entire rendezvous. Because it travels out-of-band, it is also the
 *      authentication: whoever hands you the blob is whoever you play with, and
 *      the DTLS fingerprint inside the SDP is covered by the blob's checksum, so
 *      a tampered blob fails to decode rather than connecting you to someone else.
 *
 * Everything here throws ProtocolError rather than returning a sentinel, so a
 * malformed peer input can never be mistaken for a valid frame.
 */

export const PROTOCOL_VERSION = 1;
export const BLOB_MAGIC = 'BO1ZP2P1';

/** Frame types. Keep in sync with test expectations; do not renumber. */
export const MSG = Object.freeze({
  HELLO: 1,
  WELCOME: 2,
  APP: 3,
  PING: 4,
  PONG: 5,
  BYE: 6,
});
const MSG_NAMES = Object.fromEntries(Object.entries(MSG).map(([name, value]) => [value, name]));

export const HEADER_BYTES = 16;
/** Deliberately below every implementation's reliable-message cap. */
export const MAX_CHUNK_PAYLOAD = 32 * 1024;
export const MAX_CHUNKS_PER_MESSAGE = 255;
export const MAX_MESSAGE_BYTES = MAX_CHUNK_PAYLOAD * MAX_CHUNKS_PER_MESSAGE;
/** Bound on concurrent partial messages, so a peer cannot exhaust memory. */
export const MAX_INFLIGHT_MESSAGES = 8;

export class ProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export const msgName = type => MSG_NAMES[type] ?? `type ${type}`;

/* ------------------------------------------------------------------ codec */

function assertFrameType(value) {
  if (!(value instanceof Uint8Array)) {
    throw new ProtocolError(`frame must be a Uint8Array, got ${typeof value}`);
  }
}

function u32(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new ProtocolError(`${field} out of range: ${value}`);
  }
  return value;
}

function u8(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new ProtocolError(`${field} out of range: ${value}`);
  }
  return value;
}

/**
 * Header layout, big-endian:
 *
 *   0     u8  version
 *   1     u8  type
 *   2..5  u32 seq         sender's frame counter, wraps
 *   6..9  u32 msgId       reassembly key; 0 for single-frame messages
 *  10     u8  chunkIndex  0-based
 *  11     u8  chunkCount  1 for an unchunked message
 *  12..15 u32 totalBytes  full message size, present in every chunk
 */
export function encodeFrame({ type, seq = 0, msgId = 0, chunkIndex = 0, chunkCount = 1,
                              totalBytes = null, payload = new Uint8Array(0) }) {
  if (!Number.isInteger(type) || !MSG_NAMES[type]) {
    throw new ProtocolError(`unknown message type: ${type}`);
  }
  assertFrameType(payload);
  u8(chunkIndex, 'chunkIndex');
  u8(chunkCount, 'chunkCount');
  if (chunkCount > 1 && chunkIndex >= chunkCount) {
    throw new ProtocolError(`chunkIndex ${chunkIndex} beyond chunkCount ${chunkCount}`);
  }
  u32(seq, 'seq');
  u32(msgId, 'msgId');
  if (chunkCount === 1 && (chunkIndex !== 0 || msgId !== 0)) {
    throw new ProtocolError('an unchunked frame must have msgId 0 and chunkIndex 0');
  }
  const total = totalBytes === null ? payload.length : u32(totalBytes, 'totalBytes');
  const frame = new Uint8Array(HEADER_BYTES + payload.length);
  const view = new DataView(frame.buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, type);
  view.setUint32(2, seq);
  view.setUint32(6, msgId);
  view.setUint8(10, chunkIndex);
  view.setUint8(11, chunkCount);
  view.setUint32(12, total);
  frame.set(payload, HEADER_BYTES);
  return frame;
}

export function decodeFrame(frame) {
  assertFrameType(frame);
  if (frame.length < HEADER_BYTES) {
    throw new ProtocolError(`frame too short: ${frame.length} < ${HEADER_BYTES}`);
  }
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) {
    throw new ProtocolError(`unsupported protocol version ${version}, expected ${PROTOCOL_VERSION}`);
  }
  const type = view.getUint8(1);
  if (!MSG_NAMES[type]) throw new ProtocolError(`unknown message type ${type}`);
  const seq = view.getUint32(2);
  const msgId = view.getUint32(6);
  const chunkIndex = view.getUint8(10);
  const chunkCount = view.getUint8(11);
  const totalBytes = view.getUint32(12);
  if (chunkCount === 0) throw new ProtocolError('chunkCount 0');
  if (chunkIndex >= chunkCount) throw new ProtocolError('chunkIndex beyond chunkCount');
  if (totalBytes > MAX_MESSAGE_BYTES) {
    throw new ProtocolError(`declared message size ${totalBytes} exceeds the ${MAX_MESSAGE_BYTES} cap`);
  }
  // A view, not a copy - but a plain Uint8Array, so callers in node never receive
  // a Buffer whose prototype would surprise a strict comparison downstream.
  const payload = new Uint8Array(frame.buffer, frame.byteOffset + HEADER_BYTES,
                                 frame.byteLength - HEADER_BYTES);
  if (chunkCount === 1) {
    if (msgId !== 0) throw new ProtocolError('unchunked frame carrying a msgId');
    if (payload.length !== totalBytes) {
      throw new ProtocolError(`payload ${payload.length} disagrees with declared ${totalBytes}`);
    }
  } else if (payload.length > MAX_CHUNK_PAYLOAD) {
    throw new ProtocolError(`chunk payload ${payload.length} exceeds ${MAX_CHUNK_PAYLOAD}`);
  }
  return { version, type, seq, msgId, chunkIndex, chunkCount, totalBytes, payload };
}

/** Split one application payload into 1..n APP frames. */
export function chunkPayload(payload, { seq, msgId, type = MSG.APP } = {}) {
  assertFrameType(payload);
  if (payload.length > MAX_MESSAGE_BYTES) {
    throw new ProtocolError(`message of ${payload.length} bytes exceeds the ${MAX_MESSAGE_BYTES} cap`);
  }
  if (payload.length <= MAX_CHUNK_PAYLOAD) {
    return [encodeFrame({ type, seq, payload })];
  }
  if (msgId === 0) throw new ProtocolError('a chunked message needs a non-zero msgId');
  const count = Math.ceil(payload.length / MAX_CHUNK_PAYLOAD);
  if (count > MAX_CHUNKS_PER_MESSAGE) {
    throw new ProtocolError(`needs ${count} chunks, cap is ${MAX_CHUNKS_PER_MESSAGE}`);
  }
  const frames = [];
  for (let index = 0; index < count; index++) {
    const start = index * MAX_CHUNK_PAYLOAD;
    frames.push(encodeFrame({
      type, seq: (seq + index) >>> 0, msgId, chunkIndex: index, chunkCount: count,
      totalBytes: payload.length, payload: payload.subarray(start, start + MAX_CHUNK_PAYLOAD),
    }));
  }
  return frames;
}

/**
 * Collects chunks into whole messages. Bounded on three axes at once - chunks per
 * message, total message size, and how many messages may be open simultaneously -
 * because the peer controls all three and none of them should be trusted.
 */
export function createReassembler() {
  const partial = new Map();

  return {
    get pending() {
      return partial.size;
    },
    /** @returns {{type:number, payload:Uint8Array}|null} a whole message, or null. */
    push(frame) {
      if (frame.chunkCount === 1) return { type: frame.type, payload: frame.payload };

      let entry = partial.get(frame.msgId);
      if (!entry) {
        if (partial.size >= MAX_INFLIGHT_MESSAGES) {
          // Oldest partial wins the eviction: a peer spamming new msgIds cannot
          // pin memory, and a legitimately slow message is retried by the sender.
          const oldest = partial.keys().next().value;
          partial.delete(oldest);
        }
        entry = { type: frame.type, totalBytes: frame.totalBytes, chunkCount: frame.chunkCount,
                  chunks: new Array(frame.chunkCount).fill(null), received: 0, bytes: 0 };
        partial.set(frame.msgId, entry);
      }
      if (entry.totalBytes !== frame.totalBytes || entry.chunkCount !== frame.chunkCount
          || entry.type !== frame.type) {
        partial.delete(frame.msgId);
        throw new ProtocolError(`msgId ${frame.msgId} changed shape mid-message`);
      }
      if (entry.chunks[frame.chunkIndex] !== null) return null; // duplicate chunk: ignore
      entry.chunks[frame.chunkIndex] = frame.payload;
      entry.received++;
      entry.bytes += frame.payload.length;
      if (entry.bytes > entry.totalBytes) {
        partial.delete(frame.msgId);
        throw new ProtocolError(`msgId ${frame.msgId} delivered more bytes than declared`);
      }
      if (entry.received < entry.chunkCount) return null;

      partial.delete(frame.msgId);
      const whole = new Uint8Array(entry.totalBytes);
      let at = 0;
      for (const chunk of entry.chunks) {
        whole.set(chunk, at);
        at += chunk.length;
      }
      if (at !== entry.totalBytes) {
        throw new ProtocolError(`reassembled ${at} bytes, declared ${entry.totalBytes}`);
      }
      return { type: entry.type, payload: whole };
    },
    reset() {
      partial.clear();
    },
  };
}

/* ----------------------------------------------------------------- blobs */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64Url(bytes) {
  // Written out rather than using btoa/Buffer so one implementation serves both
  // environments and the output is stable and URL-safe.
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index];
    const b1 = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const b2 = index + 2 < bytes.length ? bytes[index + 2] : 0;
    out += B64URL_ALPHABET[b0 >> 2];
    out += B64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (index + 1 < bytes.length) out += B64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    if (index + 2 < bytes.length) out += B64URL_ALPHABET[b2 & 0x3f];
  }
  return out;
}

function base64UrlToBytes(text) {
  const lookup = new Map([...B64URL_ALPHABET].map((char, index) => [char, index]));
  const groups = Math.floor(text.length / 4);
  const remainder = text.length % 4;
  if (remainder === 1) throw new ProtocolError('malformed base64url length');
  const length = groups * 3 + (remainder ? remainder - 1 : 0);
  const bytes = new Uint8Array(length);
  let at = 0;
  const value = char => {
    const found = lookup.get(char);
    if (found === undefined) throw new ProtocolError(`invalid base64url character ${JSON.stringify(char)}`);
    return found;
  };
  for (let index = 0; index < groups; index++) {
    const quad = text.slice(index * 4, index * 4 + 4);
    const n = (value(quad[0]) << 18) | (value(quad[1]) << 12) | (value(quad[2]) << 6) | value(quad[3]);
    bytes[at++] = n >> 16;
    bytes[at++] = (n >> 8) & 0xff;
    bytes[at++] = n & 0xff;
  }
  if (remainder === 2) {
    const n = (value(text.at(-2)) << 18) | (value(text.at(-1)) << 12);
    bytes[at++] = n >> 16;
  } else if (remainder === 3) {
    const n = (value(text.at(-3)) << 18) | (value(text.at(-2)) << 12) | (value(text.at(-1)) << 6);
    bytes[at++] = n >> 16;
    bytes[at++] = (n >> 8) & 0xff;
  }
  return bytes;
}

export const utf8 = {
  encode: text => new TextEncoder().encode(text),
  decode: bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
};

/**
 * Pack a signaling payload into one copy-pasteable token:
 * `BO1ZP2P1.<base64url json>.<crc32 hex>`. The checksum covers the magic and the
 * body, so a truncated or edited blob is rejected before any WebRTC object sees it.
 */
export function encodeBlob(fields) {
  if (!fields || typeof fields !== 'object') throw new ProtocolError('blob fields required');
  const { kind, sdp, room } = fields;
  if (kind !== 'offer' && kind !== 'answer') throw new ProtocolError(`bad blob kind: ${kind}`);
  if (typeof sdp !== 'string' || !sdp) throw new ProtocolError('blob needs SDP text');
  if (typeof room !== 'string' || !room) throw new ProtocolError('blob needs a room code');
  const body = JSON.stringify({
    v: PROTOCOL_VERSION, kind, room, sdp,
    nonce: fields.nonce ?? null,
    label: fields.label ?? null,
  });
  const bytes = utf8.encode(body);
  // SDP is ASCII with CRLF; a non-ASCII body means something unexpected got in.
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] > 0x7e || bytes[index] < 0x09) {
      throw new ProtocolError('signaling payload is not printable ASCII');
    }
  }
  return `${BLOB_MAGIC}.${bytesToBase64Url(bytes)}.${crc32(bytes).toString(16).padStart(8, '0')}`;
}

export function decodeBlob(token, { expectRoom = null, expectKind = null } = {}) {
  if (typeof token !== 'string') throw new ProtocolError('blob must be a string');
  const trimmed = token.trim().replace(/\s+/g, '');
  const parts = trimmed.split('.');
  if (parts.length !== 3) throw new ProtocolError('blob must have three dot-separated parts');
  const [magic, body, checksum] = parts;
  if (magic !== BLOB_MAGIC) {
    throw new ProtocolError(`not a ${BLOB_MAGIC} blob (got ${JSON.stringify(magic)})`);
  }
  if (!/^[0-9a-f]{8}$/.test(checksum)) throw new ProtocolError('blob checksum is malformed');
  const bytes = base64UrlToBytes(body);
  if (crc32(bytes).toString(16).padStart(8, '0') !== checksum) {
    throw new ProtocolError('blob checksum mismatch - the token was truncated or edited');
  }
  let fields;
  try {
    fields = JSON.parse(utf8.decode(bytes));
  } catch (error) {
    throw new ProtocolError(`blob body is not valid JSON: ${error.message}`);
  }
  if (fields.v !== PROTOCOL_VERSION) {
    throw new ProtocolError(`blob protocol version ${fields.v}, expected ${PROTOCOL_VERSION}`);
  }
  if (fields.kind !== 'offer' && fields.kind !== 'answer') {
    throw new ProtocolError(`blob kind ${JSON.stringify(fields.kind)} is not offer or answer`);
  }
  if (expectKind && fields.kind !== expectKind) {
    throw new ProtocolError(`expected a ${expectKind} blob, got ${fields.kind}`);
  }
  if (typeof fields.sdp !== 'string' || !fields.sdp.includes('v=0')) {
    throw new ProtocolError('blob SDP is missing');
  }
  if (expectRoom && fields.room !== expectRoom) {
    throw new ProtocolError(`room code mismatch: blob says ${JSON.stringify(fields.room)}, `
      + `this session is ${JSON.stringify(expectRoom)}`);
  }
  return { kind: fields.kind, room: fields.room, sdp: fields.sdp,
           nonce: fields.nonce ?? null, label: fields.label ?? null, bytes: bytes.length };
}

/**
 * A room code is a human-readable label for the session, not a secret and not an
 * authentication factor - the out-of-band blob exchange is what authenticates. It
 * exists so pasting the wrong session's blob fails loudly instead of connecting
 * two people who meant to play with someone else.
 */
export function randomRoomCode(random = Math.random) {
  const alphabet = 'ACDEFGHJKLMNPQRTUVWXY3479'; // no B/8, I/1, O/0, S/5: readable over voice chat
  let out = '';
  for (let index = 0; index < 8; index++) {
    out += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
    if (index === 3) out += '-';
  }
  return out;
}

/** Derive the DTLS fingerprint out of an SDP body, for out-of-band comparison. */
export function sdpFingerprint(sdp) {
  const match = /a=fingerprint:sha-256\s+([0-9A-Fa-f:]{95})/.exec(sdp ?? '');
  return match ? match[1].toUpperCase() : null;
}
