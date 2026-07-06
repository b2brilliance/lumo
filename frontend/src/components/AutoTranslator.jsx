// AutoTranslator: scans the entire app's DOM and rewrites visible text into
// the user's locale (via /api/i18n/translate, cached server-side), and
// rewrites "$25.00"-style USD prices into the local currency via live FX.
//
// - One initial batch translate, then everything is server-cached.
// - Currency rewrite is idempotent: "$25" → "₹2,083" on first pass; subsequent
//   passes see no $-prefixed numbers and leave it alone.
// - Skips <input>, <textarea>, <code>, <pre>, <script>, <style>, SVG, and any
//   element marked data-no-i18n="true".
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/locale";

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT",
  "SVG", "PATH", "CIRCLE", "G", "RECT", "LINE", "POLYGON", "POLYLINE", "USE",
]);

function shouldSkipNode(node) {
  let el = node.parentElement;
  while (el) {
    const tag = (el.tagName || "").toUpperCase();
    if (SKIP_TAGS.has(tag)) return true;
    if (el.getAttribute) {
      if (el.getAttribute("data-no-i18n") === "true") return true;
      if (el.getAttribute("contenteditable") === "true") return true;
    }
    el = el.parentElement;
  }
  return false;
}

// "Just digits/punctuation/symbols" — never *translatable* but may still contain
// "$N" patterns we need to rewrite into the local currency.
const NUMERIC_ONLY = /^[\s\d.,:;%+\-/()\[\]–—•·×\u00A0$£€¥₹₦#@*&|]+$/;

function isTranslatable(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;
  if (NUMERIC_ONLY.test(trimmed)) return false;
  return true;
}

// A text node is worth visiting if it's translatable OR if it contains a "$"
// (so we can rewrite USD prices into local currency).
function isWorthVisiting(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  if (trimmed.indexOf("$") !== -1) return true;
  return isTranslatable(text);
}

// Rewrite "$25", "$25.00", "$2,500.50" into the local currency.
function rewriteCurrency(text, formatPrice, isUsd) {
  if (isUsd) return text;
  if (!text || text.indexOf("$") === -1) return text;
  return text.replace(/\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g, (m, num) => {
    const usd = parseFloat(num.replace(/,/g, ""));
    if (!Number.isFinite(usd)) return m;
    const out = formatPrice(usd);
    return out || m;
  });
}

// Per-node state — WeakMap so React-removed nodes get GC'd.
const nodeState = new WeakMap();
const elemState = new WeakMap();
// Source-text → already-translated text (per language). Survives React node
// swaps so identical strings get re-translated instantly from cache.
const translationCache = new Map(); // key = `${lang}::${source}` → applied

export default function AutoTranslator() {
  const { lang, country, formatPrice, ratesLoaded } = useLocale();
  const isUsd = country === "US";
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    if (!ratesLoaded) return;
    let cancelled = false;
    let scanTimer = null;
    let mutating = false;

    const collectNodes = () => {
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (shouldSkipNode(n)) return NodeFilter.FILTER_REJECT;
          if (!isWorthVisiting(n.nodeValue || "")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let cur = walker.nextNode();
      while (cur) { out.push(cur); cur = walker.nextNode(); }
      return out;
    };

    /**
     * Pass 2: currency rewrite at the element level — handles the case where
     * JSX `${expr}` splits the visible string into two adjacent text nodes
     * ("$" + "40.00"). We only touch elements with multiple text children and
     * no element descendants (true leaves).
     */
    const syncElementPrices = () => {
      if (isUsd) return;  // nothing to convert
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode(el) {
          const tag = (el.tagName || "").toUpperCase();
          if (SKIP_TAGS.has(tag)) return NodeFilter.FILTER_REJECT;
          if (el.getAttribute && el.getAttribute("data-no-i18n") === "true") return NodeFilter.FILTER_REJECT;
          if (el.children && el.children.length > 0) return NodeFilter.FILTER_SKIP;  // not a leaf
          if (!el.childNodes || el.childNodes.length < 2) return NodeFilter.FILTER_SKIP;  // single text already handled by node walker
          const tc = el.textContent || "";
          if (tc.indexOf("$") === -1) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let el = walker.nextNode();
      while (el) {
        const current = el.textContent || "";
        const prev = elemState.get(el);
        const source = (prev && prev.applied === current) ? prev.source : current;
        const next = rewriteCurrency(source, formatPrice, isUsd);
        if (next !== current) {
          el.textContent = next;  // collapses to a single text node
        }
        elemState.set(el, { source, applied: next, lang: langRef.current });
        el = walker.nextNode();
      }
    };

    /**
     * Pass 3: handle Emergent's visual-editor wrappers. JSX `${expr}` becomes
     *   "$" + <span data-ve-dynamic="true">40.00</span>
     * so the price is split across a text node and a dynamic span. We detect
     * any "$"-ending text node followed by a sibling element whose textContent
     * is a bare number, and rewrite the pair into a single local-currency
     * string.
     */
    const NUM_ONLY = /^\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*$/;
    const syncSplitPrices = () => {
      if (isUsd) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (shouldSkipNode(n)) return NodeFilter.FILTER_REJECT;
          const v = n.nodeValue || "";
          if (v.length === 0 || v.indexOf("$") === -1) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const pairs = [];
      let n = walker.nextNode();
      while (n) {
        const v = n.nodeValue || "";
        // "$" at the very end of this text node
        if (/\$\s*$/.test(v)) {
          const next = n.nextSibling;
          if (next && next.nodeType === 1) {
            const tc = (next.textContent || "");
            if (NUM_ONLY.test(tc)) {
              pairs.push({ textNode: n, dynEl: next });
            }
          }
        }
        n = walker.nextNode();
      }
      for (const { textNode, dynEl } of pairs) {
        const numStr = (dynEl.textContent || "").trim().replace(/,/g, "");
        const usd = parseFloat(numStr);
        if (!Number.isFinite(usd)) continue;
        const formatted = formatPrice(usd);
        if (!formatted) continue;
        // Strip the trailing "$" from the text node
        textNode.nodeValue = (textNode.nodeValue || "").replace(/\$\s*$/, "");
        // Replace the dynamic span's text with the localized price
        if ((dynEl.textContent || "") !== formatted) {
          dynEl.textContent = formatted;
        }
      }
    };

    const sync = async () => {
      if (cancelled) return;
      const nodes = collectNodes();
      const items = [];
      const sourceSet = new Set();
      for (const n of nodes) {
        const text = n.nodeValue || "";
        const prev = nodeState.get(n);
        let source;
        if (prev && prev.applied === text) {
          source = prev.source;
        } else {
          // New or React-replaced node — text is the English source
          source = text;
        }
        items.push({ node: n, source });
        // Only ask for translation on actually translatable strings (not pure "$9.50").
        // Cache key uses the TRIMMED source so "Get started" and "Get started "
        // (trailing space before an icon) share the same translation entry.
        const trimmedSrc = source.trim();
        if (langRef.current !== "en" && isTranslatable(source) && !translationCache.has(`${langRef.current}::${trimmedSrc}`)) {
          sourceSet.add(trimmedSrc);
        }
      }
      let translated = {};
      if (langRef.current !== "en" && sourceSet.size) {
        const texts = Array.from(sourceSet);
        // Batch in chunks of 60 to avoid huge prompts
        for (let i = 0; i < texts.length; i += 60) {
          if (cancelled) return;
          const batch = texts.slice(i, i + 60);
          try {
            const { data } = await api.post("/i18n/translate", {
              texts: batch, target_lang: langRef.current,
            });
            Object.assign(translated, data.translations || {});
          } catch {
            // keep originals
          }
        }
        // Persist into the cross-render cache so React-replaced nodes can
        // get instantly re-translated next pass without another API call.
        for (const [src, out] of Object.entries(translated)) {
          if (out && out !== src) translationCache.set(`${langRef.current}::${src}`, out);
        }
      }
      mutating = true;
      try {
        for (const { node, source } of items) {
          let display = source;
          if (langRef.current !== "en") {
            const trimmedSrc = source.trim();
            const cacheKey = `${langRef.current}::${trimmedSrc}`;
            // Look up translation on the trimmed key, then preserve the
            // original leading/trailing whitespace so we don't collapse
            // "Get started " → "Commencer" (which would eat the space
            // between the label and the icon that follows it).
            const trans = translated[trimmedSrc] || translationCache.get(cacheKey);
            if (trans) {
              const leading = source.match(/^\s*/)[0];
              const trailing = source.match(/\s*$/)[0];
              display = leading + trans + trailing;
            }
          }
          display = rewriteCurrency(display, formatPrice, isUsd);
          if (node.nodeValue !== display) {
            node.nodeValue = display;
          }
          nodeState.set(node, { source, applied: display, lang: langRef.current });
        }
        // Pass 2: handle JSX `${expr}` split-node prices at the element level
        syncElementPrices();
        // Pass 3: handle Emergent visual-editor's data-ve-dynamic wrappers
        syncSplitPrices();
      } finally {
        // Small delay so the observer-fired mutations we just caused are flushed
        setTimeout(() => { mutating = false; }, 30);
      }
    };

    const scheduleScan = () => {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(sync, 250);
    };

    scheduleScan();

    // Safety net: re-scan every 4s to catch any React re-renders that the
    // MutationObserver missed (replaced text nodes, late-mounted components,
    // conditional renders triggered after the initial pass). Translations are
    // server-cached so this is cheap.
    const intervalId = setInterval(() => { if (!cancelled) scheduleScan(); }, 4000);

    const observer = new MutationObserver((mutations) => {
      if (mutating) return;
      // ignore noisy mutations that are just our own characterData rewrites
      let meaningful = false;
      for (const m of mutations) {
        if (m.type === "childList" && (m.addedNodes.length || m.removedNodes.length)) { meaningful = true; break; }
        if (m.type === "characterData") {
          const txt = m.target.nodeValue || "";
          const st = nodeState.get(m.target);
          if (!st || st.applied !== txt) { meaningful = true; break; }
        }
      }
      if (meaningful) scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelled = true;
      if (scanTimer) clearTimeout(scanTimer);
      clearInterval(intervalId);
      observer.disconnect();
    };
  }, [lang, country, isUsd, formatPrice, ratesLoaded]);

  return null;
}
