import { pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('/shared/')) return next(pathToFileURL(path.join(ROOT, specifier)).href, context);
  return next(specifier, context);
}
