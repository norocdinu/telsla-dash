import { loadFromNodes, loadFromSources, showNotice } from '../app/load-library';
import { ROOT_REFUSED } from '../app/messages';
import { pickFiles, pickFolder } from '../sources/browser';

export async function chooseFolder(): Promise<void> {
  const r = await pickFolder();
  if (r.kind === 'nodes') await loadFromNodes(r.nodes);
  else if (r.kind === 'files') await loadFromSources(r.files);
  else if (r.kind === 'refused') showNotice(ROOT_REFUSED);
}

export async function chooseFiles(): Promise<void> {
  const files = await pickFiles();
  if (files?.length) await loadFromSources(files);
}
