// Regenerate docs/sapjs-explained.html by inlining the built engine (dist/sap.js)
// into the content template (docs/sapjs-explained.template.html).
//
// The template carries the entire explainer EXCEPT the engine, which is spliced
// at the __SAP_ENGINE_PLACEHOLDER__ token. This keeps the 74KB build out of the
// hand-edited source while leaving the shipped doc fully self-contained: it opens
// from file:// with no network and no build step. Run this only to refresh the
// inlined engine after a `npm run build` (dist rebuild) or when editing the template.
//
//   npm run build:docs
//
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "__SAP_ENGINE_PLACEHOLDER__";

// Defensive: a stray "</script" in the engine would close the inline tag early.
// dist has none today, but escape it so a future build can never break the file.
const engine = readFileSync(join(root, "dist/sap.js"), "utf8").split("</script").join("<\\/script");
const template = readFileSync(join(root, "docs/sapjs-explained.template.html"), "utf8");

if (!template.includes(TOKEN)) {
  console.error(`template is missing ${TOKEN} — nothing to inject`);
  process.exit(1);
}

const out = template.split(TOKEN).join(engine);
writeFileSync(join(root, "docs/sapjs-explained.html"), out, "utf8");
console.log(`build:docs → docs/sapjs-explained.html (${out.length} bytes; engine ${engine.length} bytes)`);
