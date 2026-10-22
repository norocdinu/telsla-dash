import { describe, expect, test } from 'bun:test';
import { encodePng } from '../../scripts/png';

/** The chunks of a PNG, as [type, data]. */
function chunks(png: Uint8Array): [string, Uint8Array][] {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: [string, Uint8Array][] = [];
  for (let p = 8; p < png.length; ) {
    const len = v.getUint32(p);
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    out.push([type, png.subarray(p + 8, p + 8 + len)]);
    p += 12 + len;
  }
  return out;
}

describe('encodePng', () => {
  const w = 3;
  const h = 2;
  const rgba = Uint8Array.from({ length: w * h * 4 }, (_, i) => (i * 37) % 256);

  test('a PNG starts with the signature and an IHDR of the right size', () => {
    const png = encodePng(w, h, rgba);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const [type, data] = chunks(png)[0];
    expect(type).toBe('IHDR');
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect([v.getUint32(0), v.getUint32(4), data[8], data[9]]).toEqual([3, 2, 8, 6]); // 8-bit RGBA
    expect(chunks(png).at(-1)?.[0]).toBe('IEND');
  });

  test('the pixel data round-trips through inflate', () => {
    const idat = chunks(encodePng(w, h, rgba)).find(([t]) => t === 'IDAT')![1];
    const raw = Bun.inflateSync(new Uint8Array(idat.subarray(2, idat.length - 4))); // zlib header and Adler-32 around deflate
    expect(raw.length).toBe(h * (1 + w * 4));
    expect(raw[0]).toBe(0); // filter: none
    expect([...raw.subarray(1, 1 + w * 4)]).toEqual([...rgba.subarray(0, w * 4)]);
    expect([...raw.subarray(2 + w * 4)]).toEqual([...rgba.subarray(w * 4)]);
  });
});
