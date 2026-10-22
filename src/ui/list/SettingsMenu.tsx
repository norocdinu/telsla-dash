import { useEffect, useRef, useState } from 'react';
import { appStore, updateSettings } from '../../app/state';
import { APP_BUILD, APP_VERSION, buildLabel } from '../../app/version';
import { useStore } from '../../app/store';
import { MoreIcon } from '../icons';
import { SHORTCUTS } from '../player/useShortcuts';

const shortcutsTip = `Keyboard shortcuts:\n${SHORTCUTS.map((s) => `${s.key} — ${s.label}`).join('\n')}`;

export function SettingsMenu() {
  const settings = useStore(appStore, (s) => s.settings);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="settings" ref={box}>
      <button type="button" className="sheet-icon-btn" aria-label="Settings" aria-expanded={open} title={shortcutsTip} onClick={() => setOpen((o) => !o)}>
        <MoreIcon />
      </button>
      {open && (
        <div className="settings-pop" role="dialog" aria-label="Settings">
          <div className="settings-row">
            <span>Units</span>
            <div className="segmented" role="radiogroup" aria-label="Units">
              {(['kmh', 'mph'] as const).map((u) => (
                <button key={u} type="button" role="radio" aria-checked={settings.units === u} onClick={() => updateSettings({ units: u })}>
                  {u === 'kmh' ? 'km/h' : 'mph'}
                </button>
              ))}
            </div>
          </div>
          <label className="settings-row">
            <span>Show driving panel</span>
            <input type="checkbox" checked={settings.showPanel} onChange={(e) => updateSettings({ showPanel: e.target.checked })} />
          </label>
          <label className="settings-row">
            <span>Map</span>
            <input
              type="checkbox"
              checked={settings.showMap}
              onChange={(e) => {
                updateSettings({ showMap: e.target.checked });
                appStore.set({ mapOpen: e.target.checked });
              }}
            />
          </label>
          <label className="settings-row">
            <span>Stats for nerds</span>
            <input type="checkbox" checked={settings.showStats} onChange={(e) => updateSettings({ showStats: e.target.checked })} />
          </label>
          <button
            type="button"
            className="settings-row settings-action"
            onClick={() => {
              setOpen(false);
              appStore.set({ manageOpen: true, listOpen: false });
            }}
          >
            Manage events…
          </button>
          <div className="settings-shortcuts">
            {SHORTCUTS.map((s) => (
              <div key={s.key}>
                <kbd>{s.key}</kbd> {s.label}
              </div>
            ))}
          </div>
          <div className="settings-version tabular">Dashcam Viewer {buildLabel(APP_VERSION, APP_BUILD)}</div>
        </div>
      )}
    </div>
  );
}
