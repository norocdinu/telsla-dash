export { seiNal } from '../../src/dev/sei-encode';

/** A picture NAL (1 = slice, 5 = IDR) with some filler bytes. */
export function picture(type: 1 | 5): Uint8Array {
  return new Uint8Array([type === 5 ? 0x65 : 0x41, 0x88, 0x84, 0x21, 0x10]);
}
