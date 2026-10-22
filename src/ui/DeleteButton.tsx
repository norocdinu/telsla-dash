import type { DeleteOrigin } from '../app/delete';
import { DELETE } from '../app/messages';
import { appStore } from '../app/state';
import { useStore } from '../app/store';
import { canDelete, deleteFlow } from './deleting';
import { TrashIcon } from './icons';

/** A trash button for one event or drive; greyed out (with why) when the folder wasn't opened for editing. */
export function DeleteButton({ id, origin, className, label }: { id: string; origin: DeleteOrigin; className: string; label: string }) {
  // Re-render when the library changes (deletable or not depends on how the folder was opened).
  useStore(appStore, (s) => s.library);
  const ok = canDelete([id]);
  return (
    <button
      type="button"
      className={`${className}${ok ? '' : ' is-disabled'}`}
      aria-disabled={!ok}
      aria-label={ok ? label : `${label} (not available)`}
      title={ok ? label : DELETE.notDeletable}
      onClick={(e) => {
        e.stopPropagation();
        if (ok) deleteFlow.open([id], origin);
      }}
    >
      <TrashIcon />
    </button>
  );
}
