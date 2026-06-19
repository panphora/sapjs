// index.html is the public homepage and, after the explainer is retired, the single
// complete sapjs doc. These tests guard its information architecture: the sections
// exist in order, the nav is wired with no dead links, every demo is present and
// runnable, and the two carried diagrams are intact.

import { parseDoc, EXPECTED_DEMOS, ALL_DEMO_IDS, HERO_DEMO } from "./helpers/index-doc.js";

const doc = parseDoc();

const SECTIONS = [
  { id: "why", title: /why the page is the program/i },
  { id: "quickstart", title: /first app/i },
  { id: "model", title: /three words/i },
  { id: "demos", title: /live demos/i },
  { id: "writing", title: /write path/i },
  { id: "persistence", title: /persistence/i },
  { id: "text", title: /text .* editors|rich/i },
  { id: "console", title: /inspectable/i },
  { id: "reference", title: /reference/i },
  { id: "agents", title: /agents/i },
];

describe("index structure: sections, order, and the on-ramp", () => {
  test.each(SECTIONS)("section #$id exists and is titled correctly", ({ id, title }) => {
    const section = doc.getElementById(id);
    expect(section).toBeTruthy();
    expect(section.tagName).toBe("SECTION");
    const heading = section.querySelector("h1, h2, h3");
    expect(heading).toBeTruthy();
    expect(heading.textContent).toMatch(title);
  });

  test("the numbered sections run 01..09 in document order", () => {
    const ids = ["quickstart", "model", "demos", "writing", "persistence", "text", "console", "reference", "agents"];
    const nums = ids.map((id) => doc.getElementById(id).querySelector("h2 .num")?.textContent.trim());
    expect(nums).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
  });

  test("the hero leads with the attribute pitch and a six-line live demo", () => {
    expect(doc.querySelector("header.hero h1").textContent).toMatch(/attributes/i);
    expect(doc.querySelector(`.demo[data-demo="${HERO_DEMO}"]`)).toBeTruthy();
  });
});

describe("index nav: the top links are wired with no dead anchors", () => {
  const navLinks = [...doc.querySelectorAll("nav.top .links a[href^='#']")];

  test("every #anchor in the nav resolves to a real element", () => {
    expect(navLinks.length).toBeGreaterThan(0);
    for (const a of navLinks) {
      const id = a.getAttribute("href").slice(1);
      expect(doc.getElementById(id)).toBeTruthy();
    }
  });

  test("the nav surfaces the two new concept sections", () => {
    const targets = navLinks.map((a) => a.getAttribute("href").slice(1));
    expect(targets).toContain("persistence");
    expect(targets).toContain("text");
  });

  test("in-prose pointers to the inspectable section are not stale", () => {
    // section numbering moved console to 07; nothing should still say "section 04"
    // while linking to #console.
    for (const a of doc.querySelectorAll('a[href="#console"]')) {
      expect(a.textContent).not.toMatch(/section 0[1-6]/i);
    }
  });
});

describe("index demos: every concept is backed by a live demo", () => {
  const present = [...doc.querySelectorAll(".demo[data-demo]")].map((d) => d.getAttribute("data-demo"));

  test("all expected demos are present and none are extra", () => {
    expect(new Set(present)).toEqual(new Set(ALL_DEMO_IDS));
    expect(present.length).toBe(ALL_DEMO_IDS.length);
  });

  test.each(Object.entries(EXPECTED_DEMOS))("section #%s ships its live demo(s)", (sectionId, demoIds) => {
    const section = doc.getElementById(sectionId);
    const inSection = [...section.querySelectorAll(".demo[data-demo]")].map((d) => d.getAttribute("data-demo"));
    for (const id of demoIds) expect(inSection).toContain(id);
  });

  test("each demo provides runnable markup (a text/html script or editable textarea) and a live mount slot", () => {
    for (const demo of doc.querySelectorAll(".demo[data-demo]")) {
      const hasSource = demo.querySelector('script[type="text/html"]') || demo.querySelector("textarea.src-edit");
      expect(hasSource).toBeTruthy();
      expect(demo.querySelector(".live")).toBeTruthy();
    }
  });

  test("the editable bind-matrix is tamed behind an edit toggle (not always-on)", () => {
    const demo = doc.querySelector('.demo[data-demo="set-bindmatrix"]');
    expect(demo.hasAttribute("data-editable")).toBe(true);
    expect(demo.querySelector(".edit-toggle")).toBeTruthy();
    expect(demo.querySelector(".editwrap").hasAttribute("hidden")).toBe(true);
    expect(demo.querySelector("pre.code")).toBeTruthy();
  });
});

describe("index reference: the JS surface and extension point are documented", () => {
  const ref = doc.getElementById("reference");

  test("the reference lists the JavaScript API surface", () => {
    for (const m of ["Sap.refresh()", "Sap.mount(", "Sap.batch(", "Sap.status()"]) {
      expect(ref.textContent).toContain(m);
    }
  });

  test("the reference names the one extension point and that there are no plugins", () => {
    expect(ref.textContent).toMatch(/Sap\.formats\./);
    expect(ref.textContent).toMatch(/no custom directives or plugins/i);
  });
});

describe("index persistence: the typed-value durability nuance is stated", () => {
  const sec = doc.getElementById("persistence");

  test("the persist vs. transient distinction is explicit", () => {
    expect(sec.textContent).toMatch(/persist/i);
    expect(sec.textContent).toMatch(/reactivity/i);
    expect(sec.textContent).toMatch(/durability/i);
  });

  test("the survival table covers select and textarea (the easy-to-miss cases)", () => {
    const table = sec.querySelector("table.ref");
    expect(table).toBeTruthy();
    expect(table.textContent).toMatch(/select/i);
    expect(table.textContent).toMatch(/textarea/i);
  });
});

describe("index visuals: the two carried diagrams are present and intact", () => {
  const diagrams = [...doc.querySelectorAll(".diagram")];
  const text = diagrams.map((d) => d.textContent).join("\n");

  test("there are exactly two diagram blocks (pass cycle + writes converge)", () => {
    expect(diagrams.length).toBe(2);
  });

  test("the pass-cycle diagram names all four phases", () => {
    expect(text).toMatch(/pass cycle/i);
    for (const phase of ["intake", "compute", "paint", "discard"]) {
      expect(text.toLowerCase()).toContain(phase);
    }
  });

  test("a diagram shows the write paths converging on one schedule", () => {
    expect(text).toMatch(/writes converge/i);
    expect(text.toLowerCase()).toContain("schedule");
  });
});
