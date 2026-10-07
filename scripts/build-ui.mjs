// Bundles the plugin UI (src/ui/main.ts + styles.css, including the
// src/colors logic and the color library) into a single root ui.html with
// everything inlined, so Figma can load it with no network requests.
// Usage: node scripts/build-ui.mjs [--watch]
import { readdirSync, readFileSync, statSync, unlinkSync, watch, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawn } from "node:child_process";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(root, "src", "ui", "main.ts");
const TEMPLATE = join(root, "src", "ui", "template.html");
const OUT = join(root, "ui.html");
const isWatch = process.argv.includes("--watch");

const esbuildOptions = (minify) => ({
  entryPoints: [ENTRY],
  bundle: true,
  platform: "browser",
  format: "iife",
  minify,
  write: false,
  outfile: "app.js",
  logLevel: "warning",
  loader: { ".css": "css" },
});

function findOutput(files, ext) {
  const f = files.find((o) => o.path.endsWith(ext));
  if (!f) throw new Error(`esbuild produced no ${ext} output`);
  return f.text;
}

function writeHtml(jsText, cssText) {
  const safeJs = jsText.replace(/<\/script/gi, "<\\/script");
  const template = readFileSync(TEMPLATE, "utf8");
  const html = template
    .replace("/*__APP_CSS__*/", () => cssText)
    .replace("/*__APP_JS__*/", () => safeJs);
  if (html.includes("__APP_")) throw new Error("UI placeholder was not replaced");
  // No external requests allowed: remote src/href, css @import/url(), links.
  const remote = /(src|href)\s*=\s*["']https?:\/\/|@import\b|url\(\s*["']?https?:\/\/|<link\b/i;
  if (remote.test(html)) throw new Error("ui.html would make external requests");
  writeFileSync(OUT, html);
  console.log(`ui.html written (${(html.length / 1024).toFixed(1)} KB)`);
}

function buildHtmlFromResult(result) {
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(e.text);
    return;
  }
  writeHtml(
    findOutput(result.outputFiles, ".js"),
    findOutput(result.outputFiles, ".css"),
  );
}

async function buildOnce() {
  const result = await esbuild.build(esbuildOptions(true));
  buildHtmlFromResult(result);
}

function cleanStrayJs() {
  // tsc -p tsconfig.json emits compiled js next to sources; only the root
  // code.js is needed by the plugin, the rest is removed.
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".js")) unlinkSync(p);
    }
  };
  walk(join(root, "src"));
}

function runTscOnce() {
  execSync("npx tsc -p tsconfig.json", { cwd: root, stdio: "inherit" });
  cleanStrayJs();
}

async function main() {
  if (!isWatch) {
    await buildOnce();
    runTscOnce();
    return;
  }
  const plugin = {
    name: "write-html",
    setup(build) {
      build.onEnd((result) => buildHtmlFromResult(result));
    },
  };
  const ctx = await esbuild.context({ ...esbuildOptions(false), plugins: [plugin] });
  await ctx.watch();
  // template.html is not part of the bundle graph, watch it separately.
  watch(TEMPLATE, () => {
    ctx.rebuild().catch((e) => console.error(e.message));
  });
  console.log("watching UI (esbuild) and code.ts (tsc)...");
  cleanStrayJs();
  spawn("npx", ["tsc", "-p", "tsconfig.json", "--watch"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
