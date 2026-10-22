import { describe, expect, test } from 'bun:test';
import { ENCRYPTED } from '../../src/app/messages';
import { slotMessage } from '../../src/ui/player/slot-message';

describe('slotMessage', () => {
  test('an encrypted clip says why and what to do', () => {
    expect(slotMessage('front', 'encrypted')).toEqual({ title: ENCRYPTED.clip, lines: [ENCRYPTED.why, ...ENCRYPTED.fixes] });
  });

  test('other states are one line', () => {
    expect(slotMessage('back', 'missing')).toEqual({ title: 'No video', lines: [] });
    expect(slotMessage('back', 'damaged')).toEqual({ title: 'Damaged file', lines: [] });
    expect(slotMessage('left_pillar', 'codec')?.title).toBe("The Left Pillar camera uses a video format this browser can't play. Try Chrome or Edge.");
  });

  test('nothing for a camera that plays', () => {
    expect(slotMessage('front', 'ok')).toBeNull();
    expect(slotMessage('front', undefined)).toBeNull();
  });
});
