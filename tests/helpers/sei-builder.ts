import { seiType } from '../../src/sei/proto';

/** Inserts H.264 emulation-prevention bytes (00 00 0x → 00 00 03 0x for x ≤ 3). */
function addEmulation(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  let zeros = 0;
  for (const x of b) {
    if (zeros >= 2 && x <= 3) {
      out.push(3);
      zeros = 0;
    }
    out.push(x);
    zeros = x === 0 ? zeros + 1 : 0;
  }
  return new Uint8Array(out);
}

/** An SEI NAL laid out like Tesla's: header, payload type 5, size, 0x42 padding, 0x69, protobuf, 0x80. */
export function seiNal(fields: Record<string, unknown>): Uint8Array {
  const T = seiType();
  const payload = addEmulation(T.encode(T.fromObject(fields)).finish());
  return new Uint8Array([0x06, 0x05, payload.length + 4, 0x42, 0x42, 0x42, 0x69, ...payload, 0x80]);
}

/** A picture NAL (1 = slice, 5 = IDR) with some filler bytes. */
export function picture(type: 1 | 5): Uint8Array {
  return new Uint8Array([type === 5 ? 0x65 : 0x41, 0x88, 0x84, 0x21, 0x10]);
}
