import { LANDING } from '../app/messages';
import { appStore } from '../app/state';
import { useStore } from '../app/store';
import { FolderIcon } from './icons';
import { chooseFiles, chooseFolder } from './pick';

export function Landing() {
  const loading = useStore(appStore, (s) => s.loading);
  const notice = useStore(appStore, (s) => s.notice);
  return (
    <main className="landing">
      <section className="landing-drop" aria-busy={loading}>
        <FolderIcon className="landing-icon" />
        <h1 className="landing-title">{LANDING.drop}</h1>
        <p className="landing-sub">{LANDING.dropSub}</p>
        {notice && (
          <p className="landing-notice" role="status">
            {notice}
          </p>
        )}
        {loading ? (
          <div className="landing-loading" role="status">
            <span>{LANDING.reading}</span>
            <span className="progress-line" aria-hidden="true" />
          </div>
        ) : (
          <div className="landing-actions">
            <button type="button" className="btn btn-primary" onClick={() => void chooseFolder()}>
              {LANDING.chooseFolder}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void chooseFiles()}>
              {LANDING.chooseFiles}
            </button>
          </div>
        )}
      </section>
      <ul className="landing-lines">
        {LANDING.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </main>
  );
}
