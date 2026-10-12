#!/usr/bin/env node
// Known-answer test for the reconstructed ../site/sha256.js.
//
// Why this exists: sha256.js came back through a text-extraction proxy, so the
// reconstruction is semantically equivalent but not byte-identical. Syntax
// checking alone cannot prove that 64 round constants, 8 initial hash values and
// every rotate/shift survived. This file *runs* the reconstruction and compares
// it against node:crypto, which is the reference implementation the site's own
// comment says it was checked against.
//
// If every digest below matches, the bit-exact parts of the file (constants,
// word layout, padding, length encoding) are intact.
//
// Usage: node tools/verify-sha256.mjs
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import '../site/sha256.js';

const H = globalThis.StreamingSHA256;
assert.equal(typeof H, 'function', 'sha256.js did not define globalThis.StreamingSHA256');

const reference = bytes => createHash('sha256').update(bytes).digest('hex');

// Feed the same bytes in chunks of the given sizes; exercises the 64-byte block
// buffer, the partial-block carry and the whole-block fast path.
function stream(bytes, chunkSizes) {
  const hasher = new H();
  let at = 0, i = 0;
  while (at < bytes.length) {
    const size = chunkSizes[i++ % chunkSizes.length];
    hasher.update(bytes.subarray(at, at + size));
    at += size;
  }
  return hasher.hex();
}

let checks = 0;
function check(label, bytes, chunkSizes = [bytes.length || 1]) {
  const want = reference(bytes);
  const got = stream(bytes, chunkSizes);
  assert.equal(got, want, `${label}: reconstructed ${got} != reference ${want}`);
  checks++;
}

// FIPS 180-4 / NIST published answers.
check('empty', new Uint8Array(0), [1]);
assert.equal(stream(new TextEncoder().encode(''), [1]),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
check('"abc"', new TextEncoder().encode('abc'));
check('"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"',
  new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'));

// Every length across the 55/56/63/64/65-byte padding boundaries, several feeds.
for (let length = 0; length <= 300; length++) {
  const bytes = randomBytes(length);
  check(`len ${length}`, bytes);
  check(`len ${length} by 1`, bytes, [1]);
  check(`len ${length} by 7`, bytes, [7]);
  check(`len ${length} by 64`, bytes, [64]);
  check(`len ${length} mixed`, bytes, [1, 3, 55, 56, 63, 64, 65, 128]);
}

// Multi-megabyte input, the size class the site actually hashes pack files at,
// using the same 1 MiB slicing download-worker.js uses.
const big = randomBytes(3 * 1024 * 1024 + 17);
{
  const hasher = new H();
  for (let at = 0; at < big.length; at += 1 << 20) hasher.update(big.subarray(at, at + (1 << 20)));
  assert.equal(hasher.hex(), reference(big), 'multi-MiB digest mismatch');
  checks++;
}

// Length is tracked in bytes and encoded as a 64-bit big-endian bit count: make
// sure a >4 GiB bit count would still be wired correctly by checking the field
// layout on a message that sets the high word (2^32 bits needs 512 MiB, so
// verify the low-word/high-word split arithmetically instead).
{
  const hasher = new H();
  hasher.length = 0x1_0000_0000 / 8; // pretend 2^32 bits of data were fed
  hasher.block.fill(0);
  hasher.used = 0;
  const view = new DataView(hasher.block.buffer);
  hasher.hex();
  assert.equal(view.getUint32(56), 1, 'high word of the 64-bit length not set');
  assert.equal(view.getUint32(60), 0, 'low word of the 64-bit length wrong');
  checks++;
}

console.log(`sha256.js reconstruction: ${checks} known-answer checks passed (matches node:crypto).`);
