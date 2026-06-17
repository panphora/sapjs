// The doc's #1 deliverable: ONE self-contained file that opens and fully works from
// file:// with no network and no build step, with the REAL engine inlined. These
// tests guard that contract and keep the shipped file in sync with dist/sap.js.

import { readFileSync } from "node:fs";
import { docHtml, DIST_PATH, inlinedEngineCode, parseDoc } from "./helpers/doc.js";

describe("doc is self-contained and in sync with the built engine", () => {
  test("the shipped file exists and is substantial", () => {
    expect(docHtml.length).toBeGreaterThan(100_000);
    expect(docHtml).toMatch(/^<!doctype html>/i);
  });

  test("the engine placeholder was replaced (the doc was actually built)", () => {
    expect(docHtml).not.toContain("__SAP_ENGINE_PLACEHOLDER__");
  });

  test("the inlined engine is exactly dist/sap.js (escaped) — not a stale copy", () => {
    // build-doc.mjs splices dist into the template, escaping any "</script" so the
    // inline tag can't close early. Reproduce that and assert the doc carries it
    // verbatim. Fails if dist was rebuilt without re-running `npm run build:docs`.
    const dist = readFileSync(DIST_PATH, "utf8");
    const escaped = dist.split("</script").join("<\\/script");
    expect(docHtml).toContain("<script>" + escaped + "</script>");
  });

  test("the inlined engine parses intact as a single script (no premature close)", () => {
    const code = inlinedEngineCode();
    // First and last meaningful lines of the IIFE bundle must both survive; if a
    // stray "</script>" had split the block, the tail would be truncated away.
    expect(code).toContain("var Sap = (() =>");
    expect(code).toContain("window.Sap = Sap.default");
    // exactly two attribute-less scripts: the engine and the boot harness
    const doc = parseDoc();
    const typeless = [...doc.querySelectorAll("script")].filter((s) => !s.getAttribute("type"));
    expect(typeless.length).toBe(2);
  });

  test("no external script is loaded (engine is inlined, not a CDN <script src>)", () => {
    expect(docHtml).not.toMatch(/<script[^>]+\bsrc\s*=/i);
  });

  test("no external stylesheet, font, or preloaded resource", () => {
    // All CSS is an inline <style>; the only <link> is a data: favicon.
    expect(docHtml).not.toMatch(/<link[^>]+rel\s*=\s*["']?(stylesheet|preload|prefetch|dns-prefetch)/i);
    expect(docHtml).not.toMatch(/<link[^>]+href\s*=\s*["']https?:/i);
    expect(docHtml).not.toContain("@import");
  });

  test("no remote URLs are fetched at load (no http(s) in src/url())", () => {
    // A remote <img src>, background, or @font-face would break offline use.
    expect(docHtml).not.toMatch(/\bsrc\s*=\s*["']https?:\/\//i);
    expect(docHtml).not.toMatch(/url\(\s*['"]?https?:\/\//i);
  });

  test("the only http(s) URL in the whole file is the inert SVG namespace", () => {
    // Sanity backstop: prove the bans above aren't missing a network dependency.
    // The lone remaining http(s) string is the xmlns inside the data-URI favicon.
    const urls = [...new Set(docHtml.match(/https?:\/\/[^"'\s)<]+/g) || [])];
    expect(urls).toEqual(["http://www.w3.org/2000/svg"]);
  });
});
