import { ALL_DAMAGED, ENCRYPTED, NO_CLIPS } from '../app/messages';
import type { Blocked } from '../app/open-rule';
import { LockIcon } from './icons';
import { chooseFolder } from './pick';

export function FullMessage({ kind }: { kind: Blocked }) {
  return (
    <main className="full-message">
      <section className="full-message-card" role="alert">
        {kind === 'encrypted' ? (
          <>
            <LockIcon className="full-message-icon" />
            <h1>{ENCRYPTED.all}</h1>
            <p>{ENCRYPTED.why}</p>
            <ul>
              {ENCRYPTED.fixes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </>
        ) : (
          <h1>{kind === 'empty' ? NO_CLIPS : ALL_DAMAGED}</h1>
        )}
        <button type="button" className="btn btn-primary" onClick={() => void chooseFolder()}>
          Choose another folder
        </button>
      </section>
    </main>
  );
}
