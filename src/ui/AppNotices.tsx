import { applyUpdate, dismissInstall, installBannerVisible, isStandalone, promptInstall, pwaStore, updateText } from '../app/pwa';
import { useStore } from '../app/store';
import { APP_BUILD, APP_VERSION } from '../app/version';

/** The Install banner (when the browser offers it) and the update notice (when a new build is waiting). */
export function AppNotices() {
  const prompt = useStore(pwaStore, (s) => s.installPrompt !== null);
  const dismissed = useStore(pwaStore, (s) => s.installDismissed);
  const update = useStore(pwaStore, (s) => s.update);
  const showInstall = installBannerVisible({ prompt, dismissed, standalone: isStandalone() });
  if (!showInstall && !update) return null;

  return (
    <div className="app-notices">
      {update && (
        <div className="notice" role="status">
          <span>{updateText(update, { version: APP_VERSION, build: APP_BUILD })}</span>
          <button type="button" className="btn btn-primary" onClick={applyUpdate}>
            Reload
          </button>
          <button type="button" className="toast-close" onClick={() => pwaStore.set({ update: null })} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {showInstall && (
        <div className="notice" role="status">
          <span>Install Dashcam Viewer to open it from the Start menu, even offline.</span>
          <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
            Install
          </button>
          <button type="button" className="btn btn-quiet" onClick={dismissInstall}>
            Not now
          </button>
        </div>
      )}
    </div>
  );
}
