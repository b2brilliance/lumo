/*
 * Generates public/meta.json AND injects a `<meta name="lumo-build">`
 * tag into build/index.html on every production build. This is the
 * cornerstone of our cache-buster:
 *
 *   1. `/meta.json`         — fetched by the React CacheBuster component
 *                             every 5 minutes (long-lived tabs).
 *   2. `<meta name="lumo-build">` embedded in index.html — read by the
 *      inline bootstrap `<script>` at the top of index.html. If the
 *      value baked into the CDN-cached HTML doesn't match the current
 *      `/api/meta` response, the bootstrap force-reloads the page with
 *      cleared caches, so users never get stuck on a stale build even
 *      when Cloudflare has cached the HTML aggressively.
 *
 * Run automatically by yarn's `prebuild` hook (see package.json).
 */
const fs = require("fs");
const path = require("path");
const pkg = require("../package.json");

const buildTime = new Date().toISOString();
const out = {
  version: pkg.version || "0.0.0",
  buildTime,
};

// 1) Write /public/meta.json so CRA copies it into /build/meta.json.
const pubTarget = path.join(__dirname, "..", "public", "meta.json");
fs.writeFileSync(pubTarget, JSON.stringify(out, null, 2) + "\n");
console.log(`[write-meta] wrote ${pubTarget} → ${buildTime}`);

// 2) Also drop it in /build/meta.json if the build folder exists (postbuild
//    would be the cleaner place but this handles both prebuild and postbuild
//    invocations idempotently).
const buildTarget = path.join(__dirname, "..", "build", "meta.json");
try {
  if (fs.existsSync(path.dirname(buildTarget))) {
    fs.writeFileSync(buildTarget, JSON.stringify(out, null, 2) + "\n");
    console.log(`[write-meta] wrote ${buildTarget} → ${buildTime}`);
  }
} catch (e) {
  console.warn(`[write-meta] could not write ${buildTarget}: ${e.message}`);
}

// 3) Rewrite the placeholder inside /public/index.html so that after CRA
//    substitutes %PUBLIC_URL% into build/index.html, the `<meta
//    name="lumo-build">` carries THIS build's timestamp. We use a stable
//    marker (`__LUMO_BUILD_TIME__`) so subsequent builds swap it cleanly.
function rewriteBuildMeta(htmlPath) {
  if (!fs.existsSync(htmlPath)) return;
  let html = fs.readFileSync(htmlPath, "utf8");
  const marker = /<meta\s+name="lumo-build"\s+content="[^"]*"\s*\/?>/i;
  const replacement = `<meta name="lumo-build" content="${buildTime}" />`;
  if (marker.test(html)) {
    html = html.replace(marker, replacement);
  } else {
    // Insert right before </head> if the tag doesn't exist yet
    html = html.replace(/<\/head>/i, `    ${replacement}\n    </head>`);
  }
  fs.writeFileSync(htmlPath, html);
  console.log(`[write-meta] injected lumo-build meta into ${htmlPath}`);
}

rewriteBuildMeta(path.join(__dirname, "..", "public", "index.html"));
rewriteBuildMeta(path.join(__dirname, "..", "build", "index.html"));
