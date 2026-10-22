import { describe, expect, test } from 'bun:test';
import { seiType } from '../../src/sei/proto';
import { stripEmulation, unwrapSei } from '../../src/sei/sei';
import { picture, seiNal } from '../helpers/sei-builder';

describe('stripEmulation', () => {
  test('removes 03 after two zero bytes', () => {
    expect([...stripEmulation(new Uint8Array([0, 0, 3, 1, 0, 0, 3, 0]))]).toEqual([0, 0, 1, 0, 0, 0]);
  });

  test('keeps 03 that does not follow two zeros', () => {
    expect([...stripEmulation(new Uint8Array([0, 3, 0, 1, 3]))]).toEqual([0, 3, 0, 1, 3]);
  });
});

describe('unwrapSei', () => {
  test('ignores picture NALs', () => {
    expect(unwrapSei(picture(1))).toBeNull();
  });

  test('ignores other SEI payload types', () => {
    expect(unwrapSei(new Uint8Array([0x06, 0x04, 2, 0x42, 0x69, 0]))).toBeNull();
  });

  test('requires the 0x69 marker', () => {
    expect(unwrapSei(new Uint8Array([0x06, 0x05, 2, 0x42, 0x41, 0]))).toBeNull();
  });

  test('round-trips Tesla-style driving data, including emulation bytes', () => {
    const f = {
      vehicleSpeedMps: 15.5,
      latitudeDeg: 1.0,
      gearState: 1,
      steeringWheelAngle: -12.5,
      brakeApplied: true,
      autopilotState: 2,
      blinkerOnRight: true,
    };
    const payload = unwrapSei(seiNal(f));
    expect(payload).not.toBeNull();
    const m = seiType().toObject(seiType().decode(payload!), { enums: Number, defaults: true });
    expect(m.latitudeDeg).toBe(1.0);
    expect(m.vehicleSpeedMps).toBeCloseTo(15.5);
    expect(m.steeringWheelAngle).toBeCloseTo(-12.5);
    expect(m.gearState).toBe(1);
    expect(m.autopilotState).toBe(2);
    expect(m.brakeApplied).toBe(true);
  });
});
