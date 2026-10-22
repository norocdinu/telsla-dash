import { useEffect } from 'react';
import { DELETE } from '../app/messages';
import { appStore } from '../app/state';
import { useStore } from '../app/store';
import { ConfirmDialog } from './ConfirmDialog';
import { bulkDialogText, leftLines, singleDialogText } from './delete-text';
import { deleteFlow } from './deleting';

const MESSAGE_MS = 6000;

function progressText(p: { event: number; events: number; file: number; files: number } | null, bulk: boolean): string {
  if (!p) return 'Deleting…';
  const files = `${p.file.toLocaleString('en-US')} of ${p.files.toLocaleString('en-US')} files`;
  return bulk ? `Deleting ${p.event} of ${p.events}… · ${files}` : `Deleting… ${files}`;
}

/** The confirmation for any delete (player, clip list, Manage events), and the message afterwards. */
export function DeleteDialog() {
  const flow = useStore(deleteFlow.store, (s) => s);
  const library = useStore(appStore, (s) => s.library);

  // A message naming events that were left stays until dismissed.
  useEffect(() => {
    if (!flow.message || flow.message.left.length) return;
    const t = setTimeout(() => deleteFlow.dismissMessage(), MESSAGE_MS);
    return () => clearTimeout(t);
  }, [flow.message]);

  const left = flow.message?.left.length
    ? leftLines(flow.message.left.map((id) => library?.timelines.find((t) => t.id === id)).filter((t) => t !== undefined))
    : [];
  const toast = flow.message ? (
    <div className="toast" role="status">
      <div className="toast-text">
        <span>{flow.message.text}</span>
        {left.length > 0 && (
          <ul className="toast-list tabular">
            {left.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="toast-close" onClick={() => deleteFlow.dismissMessage()} aria-label="Dismiss">
        ×
      </button>
    </div>
  ) : null;

  if (flow.step === 'idle') return toast;

  const bulk = flow.origin === 'manage';
  const busy = flow.step === 'running';
  const counting = flow.step === 'measuring';
  const tl = library?.timelines.find((t) => t.id === flow.ids[0]) ?? null;

  let title: string;
  let confirm: string;
  let body;
  if (bulk || !tl) {
    const text = bulkDialogText(flow.ids.length, flow.measure ?? { files: 0, bytes: 0 });
    title = text.title;
    confirm = text.confirm;
    body = <p>{counting ? DELETE.counting : text.warning}</p>;
  } else {
    const text = singleDialogText(tl, flow.measure, flow.firstTime);
    title = text.title;
    confirm = text.confirm;
    body = (
      <>
        <p className="modal-what tabular">{text.what}</p>
        <p>{counting ? DELETE.counting : text.warning}</p>
        {text.note && <p className="modal-note">{text.note}</p>}
      </>
    );
  }
  if (bulk && flow.firstTime && !busy) body = (
    <>
      {body}
      <p className="modal-note">{DELETE.firstTime}</p>
    </>
  );

  return (
    <>
      <ConfirmDialog
        title={title}
        confirmLabel={confirm}
        onConfirm={() => void deleteFlow.confirm()}
        onCancel={() => deleteFlow.cancel()}
        confirmDisabled={counting}
        busy={busy}
        extra={
          bulk ? (
            <button type="button" className="btn btn-quiet" onClick={() => deleteFlow.stop()}>
              Stop
            </button>
          ) : null
        }
      >
        {busy ? <p role="status">{progressText(flow.progress, bulk)}</p> : body}
      </ConfirmDialog>
      {toast}
    </>
  );
}
