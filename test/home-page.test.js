// The saphtml.com home page (index.html). Its hero demo is live markup that must match
// the code shown beside it, mount clean, and write nothing on load.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mount, type, Sap } from "./helpers/mount.js";

const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const live = /<main sap id="hero-demo"[\s\S]*?<\/main>/.exec(html)?.[0];
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const shown = [...html.matchAll(/<code class="language-html hero-src"[^>]*>([\s\S]*?)<\/code>/g)].map((m) => unescape(m[1])).join("\n");

describe("home page", () => {
  test("the live hero demo is the code shown", () => {
    expect(live).toBeTruthy();
    expect(shown).toBe(live.trim());
  });

  test("the hero demo mounts clean with zero writes", () => {
    mount(live);
    expect(Sap.status().ok).toBe(true);
    expect(Sap.report().errors).toEqual([]);
    expect(Sap.report().warnings).toEqual([]);
    expect(Sap.status().apps[0].mountWrites).toBe(0);
  });

  test("its local links point at files that exist", () => {
    for (const href of ["./guide.html", "./demos.html", "./llms.txt"]) {
      expect(html).toContain(`href="${href}`);
      expect(existsSync(join(ROOT, href))).toBe(true);
    }
  });

  test("the hero demo adds and checks tasks", async () => {
    const root = mount(live);
    const out = root.querySelector("output");
    const rows = () => [...root.querySelectorAll("li[item]:not([template])")];
    const input = root.querySelector('form [bind="title"]');
    type(input, "Water the plants");
    input.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    Sap.refresh();
    expect(rows()).toHaveLength(3);
    expect(out.textContent).toBe("2 tasks left");

    const box = rows()[2].querySelector('input[type="checkbox"]');
    type(box, true);
    await flush();
    Sap.refresh();
    expect(box.hasAttribute("checked")).toBe(true);
    expect(out.textContent).toBe("1 task left");
  });

  test("its guide anchors exist in guide.html", () => {
    const guideHtml = readFileSync(join(ROOT, "guide.html"), "utf8");
    const ids = new Set([...guideHtml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const anchors = [...html.matchAll(/href="\.\/guide\.html#([^"]+)"/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(ids.has(a)).toBe(true);
  });
});
