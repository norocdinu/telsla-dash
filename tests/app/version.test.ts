import { describe, expect, test } from 'bun:test';
import { buildLabel, versionLabel } from '../../src/app/version';

describe('versionLabel', () => {
  test('a .0 patch is dropped', () => {
    expect(versionLabel('0.3.0')).toBe('v0.3');
  });

  test('other versions stay whole', () => {
    expect(versionLabel('1.2.3')).toBe('v1.2.3');
    expect(versionLabel('2.0.10')).toBe('v2.0.10');
  });
});

describe('buildLabel', () => {
  test('settings line joins version and build', () => {
    expect(buildLabel('0.3.0', '1a2b3c4')).toBe('v0.3 · 1a2b3c4');
    expect(buildLabel('0.3.0', '1a2b3c4+')).toBe('v0.3 · 1a2b3c4+');
  });
});
