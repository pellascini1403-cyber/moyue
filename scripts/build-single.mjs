// Inline the production build (JS + CSS + icon) into one self-contained HTML file.
// usage: npm run build && node scripts/build-single.mjs [out=dist-single/index.html] [--fragment]
// --fragment drops the <!doctype>/<html>/<head>/<body> skeleton for hosts that wrap the page themselves.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find((a) => !a.startsWith('--')) ?? 'dist-single/index.html';
let html = readFileSync('dist/index.html', 'utf8');
const assets = readdirSync('dist/assets');
html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/g, (_, f) => {
  const js = readFileSync(join('dist/assets', f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+)">/g, (_, f) => `<style>${readFileSync(join('dist/assets', f), 'utf8')}</style>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
const icon = readFileSync('dist/icon.svg', 'utf8');
html = html.replace(/<link rel="icon" href="\.\/icon\.svg" type="image\/svg\+xml" \/>/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}" />`);
html = html.replace(/<link rel="manifest"[^>]*>/, '').replace(/<link rel="apple-touch-icon"[^>]*>/, '');
if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?html[^>]*>\s*/gi, '')
    .replace(/<\/?head>\s*/gi, '')
    .replace(/<\/?body>\s*/gi, '')
    .replace(/<meta charset="UTF-8" \/>\s*/i, '');
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB (assets: ${assets.join(', ')})`);
