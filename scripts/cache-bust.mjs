#!/usr/bin/env node
/**
 * Подставляет единый cache-bust query (?v=…) для локальных CSS/JS в HTML.
 * Запускается на Netlify / CI; локально по умолчанию пропускается (не пачкает git).
 * Принудительно: FORCE_CACHE_BUST=1 node scripts/cache-bust.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const shouldRun =
  process.env.NETLIFY === "true" ||
  process.env.CI === "true" ||
  process.env.GITHUB_ACTIONS === "true" ||
  process.env.FORCE_CACHE_BUST === "1";

if (!shouldRun) {
  console.log(
    "[cache-bust] Пропуск: не CI/Netlify. Для проверки: FORCE_CACHE_BUST=1 node scripts/cache-bust.mjs"
  );
  process.exit(0);
}

const bust =
  process.env.NETLIFY_BUILD_ID ||
  process.env.GITHUB_SHA ||
  process.env.COMMIT_REF ||
  String(Date.now());

const shortBust = String(bust).replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
const v = shortBust || String(Date.now());

const htmlFiles = readdirSync(root).filter((name) => name.endsWith(".html"));

function patchHtml(html) {
  let out = html;
  out = out.replace(
    /href="styles\.css(\?[^"#]*)?"/g,
    `href="styles.css?v=${v}"`
  );
  out = out.replace(
    /src="rates\.js(\?[^"#]*)?"/g,
    `src="rates.js?v=${v}"`
  );
  out = out.replace(
    /src="rail-express\.js(\?[^"#]*)?"/g,
    `src="rail-express.js?v=${v}"`
  );
  return out;
}

for (const file of htmlFiles) {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  const after = patchHtml(before);
  if (after !== before) {
    writeFileSync(path, after, "utf8");
    console.log(`[cache-bust] ${file} → ?v=${v.slice(0, 24)}…`);
  }
}

console.log("[cache-bust] Готово.");
