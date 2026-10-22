// `bun run install-app`: builds the app, serves it on http://localhost:5191 and opens the browser to install it.
// Run it again later to update the installed app to this code. `--no-open` only serves.
import { build } from 'vite';
import { filesFrom, runInstaller } from './serve-app';

await build({ logLevel: 'warn' });
const code = await runInstaller(filesFrom('dist'), !process.argv.includes('--no-open'));
if (code !== null) process.exit(code);
