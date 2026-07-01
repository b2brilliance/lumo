/*
 * Generates public/meta.json with a fresh buildTime timestamp on every
 * production build. The React app fetches this file with a cache-busting
 * query string on load, compares the buildTime to whatever it saw last,
 * and forces a hard reload if the deploy is newer. This is the standard
 * workaround for the "users need incognito to see the new version" problem
 * caused by browsers caching index.html.
 */
const fs = require("fs");
const path = require("path");
const pkg = require("../package.json");

const out = {
  version: pkg.version || "0.0.0",
  buildTime: new Date().toISOString(),
};

const target = path.join(__dirname, "..", "public", "meta.json");
fs.writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`[write-meta] wrote ${target} → ${out.buildTime}`);
