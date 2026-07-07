/*
 * Postbuild HTML hardener.
 *
 * After CRA emits `build/index.html`, this script walks every
 * `<script src="/static/...">` tag CRA generated and adds two safety nets:
 *
 *   1. `onerror="__lumoAssetFail(event)"` — Chrome/Firefox/Safari fire
 *      onerror when a `<script src>` fails to load OR is refused
 *      execution due to a MIME-type mismatch (the exact scenario that
 *      breaks us today: the CDN serves index.html for a missing bundle,
 *      Content-Type says text/html, browser refuses to run it as JS).
 *
 *   2. `data-lumo-asset="js"` — makes the tags searchable for future
 *      diagnostics and greppable in bug reports.
 *
 * The `__lumoAssetFail` handler is defined inline (see index.html) and
 * force-reloads the page with a cache-buster query, which fetches fresh
 * HTML from origin (no-cache headers guarantee that), which then loads
 * the CORRECT current JS hashes.
 *
 * Combined with the inline `<script>` cache-buster bootstrap at the top
 * of index.html, this makes the site self-heal in a SINGLE deploy:
 * currently-stuck users trigger onerror the moment their stale JS 404s,
 * reload to fresh HTML, and are healed for the rest of eternity.
 */
const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", "build", "index.html");
if (!fs.existsSync(target)) {
  console.warn(`[postbuild-harden] no build/index.html found — skipping (dev build?)`);
  process.exit(0);
}
let html = fs.readFileSync(target, "utf8");

// 1) Add onerror handlers to every script tag that references /static/js/*
// We intentionally leave inline <script>…</script> alone.
const before = html;
html = html.replace(
  /<script\s+([^>]*\bsrc=["'][^"']*\/static\/(?:js|media)\/[^"']+["'][^>]*)>/gi,
  (_full, attrs) => {
    if (/\bonerror\s*=/.test(attrs)) return `<script ${attrs}>`; // already patched
    return `<script ${attrs} onerror="__lumoAssetFail && __lumoAssetFail(event)" data-lumo-asset="js">`;
  },
);

// 2) Add onerror to <link rel="stylesheet" href="/static/css/…"> too.
html = html.replace(
  /<link\s+([^>]*\bhref=["'][^"']*\/static\/css\/[^"']+["'][^>]*\brel=["']stylesheet["'][^>]*)>/gi,
  (_full, attrs) => {
    if (/\bonerror\s*=/.test(attrs)) return `<link ${attrs}>`;
    return `<link ${attrs} onerror="__lumoAssetFail && __lumoAssetFail(event)" data-lumo-asset="css">`;
  },
);
// Alt attribute order (rel before href).
html = html.replace(
  /<link\s+([^>]*\brel=["']stylesheet["'][^>]*\bhref=["'][^"']*\/static\/css\/[^"']+["'][^>]*)>/gi,
  (_full, attrs) => {
    if (/\bonerror\s*=/.test(attrs)) return `<link ${attrs}>`;
    return `<link ${attrs} onerror="__lumoAssetFail && __lumoAssetFail(event)" data-lumo-asset="css">`;
  },
);

if (html !== before) {
  fs.writeFileSync(target, html);
  console.log(`[postbuild-harden] added onerror handlers to ${target}`);
} else {
  console.log(`[postbuild-harden] no <script src> or <link rel=stylesheet> tags found to patch in ${target}`);
}
