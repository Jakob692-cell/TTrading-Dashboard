/**
 * Minimal bundler: concatenates the ES modules into one self-contained HTML file.
 *
 * Why not a real bundler: the app has zero runtime dependencies and nine modules. Adding
 * a build toolchain to avoid 90 lines of script would be the more expensive choice.
 *
 * Each module is wrapped in an IIFE that returns its exports, so top-level names cannot
 * collide when everything lands in one scope (three modules define `money`, for instance).
 *
 * Output: dist/challenge-ready.html — openable with a double click, no server needed.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// Dependency order. No circular imports, so a flat list is enough.
const MODULES = [
  'src/engine/rulesets.js',
  'src/engine/account.js',
  'src/engine/classify.js',
  'src/engine/score.js',
  'src/engine/training.js',
  'src/data/market.js',
  'src/ui/chart.js',
  'src/ui/share.js',
  'src/ui/app.js',
];

const IMPORT_RE = /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const EXPORT_DECL_RE = /^export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;

/** Resolve a relative specifier against the importing module's directory. */
function resolveSpec(fromModule, spec) {
  const dir = dirname(fromModule);
  const parts = join(dir, spec).split('/').filter((p) => p !== '.');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function processModule(path) {
  const src = readFileSync(join(ROOT, path), 'utf8');

  const imports = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    imports.push({ names: m[1].split(',').map((s) => s.trim()).filter(Boolean), from: resolveSpec(path, m[2]) });
  }

  const exports = [...src.matchAll(EXPORT_DECL_RE)].map((m) => m[1]);
  if (!exports.length && !/^export/m.test(src)) {
    // A module with no exports is fine (none here), but flag it so a typo is not silent.
    console.warn(`  note: ${path} exports nothing`);
  }

  const body = src
    .replace(IMPORT_RE, '')
    .replace(/^export\s+/gm, '');

  const prelude = imports
    .map((i) => `const { ${i.names.join(', ')} } = __m[${JSON.stringify(i.from)}];`)
    .join('\n');

  return `__m[${JSON.stringify(path)}] = (function () {
${prelude}
${body}
return { ${exports.join(', ')} };
})();`;
}

console.log('bundling...');
const bundle = MODULES.map((p) => { console.log('  +', p); return processModule(p); }).join('\n\n');
const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');

// Written as page content only — no <html>/<head>/<body> wrappers, so the same file works
// both standalone and when embedded by a host that supplies its own document skeleton.
const html = `<title>Challenge Ready — prop firm challenge simulator</title>
<meta name="description" content="Practise a prop firm challenge under the exact rules before you pay for one. Simulated trading on synthetic data.">
<meta name="color-scheme" content="dark">
<style>
${css}
/* The host page may supply its own body background; make sure ours wins. */
html, body { background: #0B0E11 !important; color: #E6EDF3; }
</style>

<div id="app"></div>

<script type="module">
const __m = {};

${bundle}
</script>
`;

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist/challenge-ready.html');
writeFileSync(out, html);
console.log(`\nwrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
