import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFromSources } from './app/load-library';
import { registerServiceWorker } from './app/pwa';
import './styles/tokens.css';
import './styles/app.css';
import './styles/player.css';
import './styles/list.css';
import './styles/map.css';
import './styles/manage.css';
import './styles/stats.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();

// Dev only: ?dev-root=Samples (or .fake-drive/<name>) loads local clips without file dialogs.
if (import.meta.env.DEV) {
  const root = new URLSearchParams(location.search).get('dev-root');
  if (root) void import('./dev/dev-samples').then(async (m) => loadFromSources(await m.devSampleSources(root)));
}
