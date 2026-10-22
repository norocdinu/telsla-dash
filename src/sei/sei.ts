/** Removes H.264 emulation-prevention bytes: 00 00 03 → 00 00. */
export function stripEmulation(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let n = 0;
  let zeros = 0;
  for (const x of b) {
    if (zeros >= 2 && x === 3) {
      zeros = 0;
      continue;
    }
    out[n++] = x;
    zeros = x === 0 ? zeros + 1 : 0;
  }
  return out.subarray(0, n);
}

/**
 * Returns the protobuf payload of a Tesla SEI NAL (type 6, payload type 5), or null.
 * Layout: header, payload type, size, 0x42 padding, 0x69 marker, payload, trailing byte.
 */
export function unwrapSei(nal: Uint8Array): Uint8Array | null {
  if (nal.length < 5 || (nal[0] & 0x1f) !== 6 || nal[1] !== 5) return null;
  let i = 3;
  while (i < nal.length && nal[i] === 0x42) i++;
  if (nal[i] !== 0x69) return null;
  return stripEmulation(nal.subarray(i + 1, nal.length - 1));
}
