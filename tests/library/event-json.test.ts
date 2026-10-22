import { describe, expect, test } from 'bun:test';
import { parseEventJson, reasonInfo } from '../../src/library/event-json';

describe('parseEventJson', () => {
  test('reads every field the car writes', () => {
    const j =
      '{"timestamp":"2026-10-18T14:11:57","city":"Town","street":"Main St","est_lat":"10.5","est_lon":"20.25","reason":"sentry_locked_handle_pulled","camera":"5"}';
    expect(parseEventJson(j)).toEqual({
      wallMs: Date.UTC(2026, 9, 18, 14, 11, 57),
      city: 'Town',
      street: 'Main St',
      lat: 10.5,
      lon: 20.25,
      reason: 'sentry_locked_handle_pulled',
      category: 'handle',
      label: 'Handle pulled',
    });
  });

  test('returns null for text that is not JSON', () => {
    expect(parseEventJson('not json')).toBeNull();
  });

  test('missing fields become null with an Other reason', () => {
    expect(parseEventJson('{}')).toEqual({
      wallMs: null,
      city: null,
      street: null,
      lat: null,
      lon: null,
      reason: null,
      category: 'other',
      label: 'Other',
    });
  });

  test('unusable coordinates become null', () => {
    const e = parseEventJson('{"est_lat":"","est_lon":"x"}');
    expect(e?.lat).toBeNull();
    expect(e?.lon).toBeNull();
  });
});

describe('reasonInfo', () => {
  test('object detection', () => {
    expect(reasonInfo('sentry_aware_object_detection')).toEqual({ category: 'object', label: 'Object detected' });
  });

  test('bump or acceleration', () => {
    expect(reasonInfo('sentry_aware_accel_0.53').category).toBe('accel');
  });

  test('horn', () => {
    expect(reasonInfo('user_interaction_honk').category).toBe('honk');
  });

  test('manual saves from the dashcam icon or launcher', () => {
    expect(reasonInfo('user_interaction_dashcam_icon_tapped').category).toBe('manual');
    expect(reasonInfo('user_interaction_dashcam_launcher_action_tapped').category).toBe('manual');
  });

  test('unknown reasons are humanised under Other', () => {
    expect(reasonInfo('user_interaction_something_new')).toEqual({ category: 'other', label: 'User interaction something new' });
  });
});
