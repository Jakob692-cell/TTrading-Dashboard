import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * Finishing touches for the single-file build so it opens straight from disk:
 * the inlined module script becomes a classic script at the end of <body>
 * (runs in more places: older in-app browsers, some file viewers), the
 * favicon is inlined and the manifest link (a separate file) is dropped.
 */
function standaloneHtml(): Plugin {
  return {
    name: 'novape-standalone-html',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset' || typeof html.source !== 'string') return;
      const match = html.source.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
      if (!match) return;
      const code = match[1];
      const icon = `data:image/svg+xml,${encodeURIComponent(readFileSync('public/favicon.svg', 'utf8').trim())}`;
      html.source = html.source
        .replace(match[0], '')
        .replace(/<link rel="manifest"[^>]*>\s*/, '')
        .replace('href="./favicon.svg"', () => `href="${icon}"`)
        .replace('</body>', () => `<script>${code}</script>\n</body>`);
    },
  };
}

/** Ships the 3D hardware plan with the web build: /bauplan/ (+ its CAD files) and /firmware/. */
function hardwarePlan(): Plugin {
  const files = (dir: URL, prefix: string): Array<[string, URL]> =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      return entry.isDirectory() ? files(url, `${prefix}${entry.name}/`) : [[`${prefix}${entry.name}`, url] as [string, URL]];
    });
  return {
    name: 'novape-hardware-plan',
    apply: 'build',
    generateBundle() {
      const hardware = new URL('../hardware/', import.meta.url);
      this.emitFile({ type: 'asset', fileName: 'bauplan/index.html', source: readFileSync(new URL('novape-one-bauplan.html', hardware), 'utf8') });
      for (const [name, url] of files(new URL('cad/', hardware), 'bauplan/cad/')) this.emitFile({ type: 'asset', fileName: name, source: readFileSync(url) });
      for (const [name, url] of files(new URL('../firmware/', import.meta.url), 'firmware/')) this.emitFile({ type: 'asset', fileName: name, source: readFileSync(url) });
    },
  };
}

// `vite build --mode single` emits one self-contained index.html
// (JS, CSS, fonts and images inlined) that opens straight from disk.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile(), standaloneHtml()] : [hardwarePlan()])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    // Reach older iOS Safari / Android WebView versions too.
    target: ['es2019', 'safari13', 'chrome80', 'firefox78', 'edge88'],
    rollupOptions: mode === 'single' ? { output: { format: 'iife' } } : undefined,
  },
  test: {
    environment: 'node',
  },
}));
