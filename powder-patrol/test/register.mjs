// Lets Node resolve the browser-style "/shared/..." imports used by the client modules.
import { register } from 'node:module';
register('./resolve-hooks.mjs', import.meta.url);
