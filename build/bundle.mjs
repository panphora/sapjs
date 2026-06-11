import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });

const common = {
  entryPoints: ["src/sap.js"],
  bundle: true,
  format: "iife",
  globalName: "Sap",
  // The entry assigns window.Sap itself; expose the default export as window.Sap.
  footer: { js: "if (typeof window !== 'undefined' && Sap && Sap.default) window.Sap = Sap.default;" },
  logLevel: "info",
};

await build({ ...common, outfile: "dist/sap.js" });
await build({ ...common, minify: true, outfile: "dist/sap.min.js" });

console.log("built dist/sap.js and dist/sap.min.js");
