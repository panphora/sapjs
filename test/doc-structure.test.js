// The doc must answer five specific questions, each in its own clearly-titled
// section, behind an overview + TL;DR + a nav that actually works, with a live demo
// for each. These tests guard that information architecture against regressions.

import { parseDoc, EXPECTED_DEMOS, ALL_DEMO_IDS } from "./helpers/doc.js";

const doc = parseDoc();

const SECTIONS = [
  { id: "overview", title: /overview/i },
  { id: "transient", title: /transient/i },
  { id: "richtext", title: /rich text/i },
  { id: "extending", title: /extend/i },
  { id: "setstate", title: /set state/i },
  { id: "modals", title: /modal/i },
  { id: "verify", title: /verif/i },
];

describe("doc structure: the five questions, overview, and verify", () => {
  test.each(SECTIONS)("section #$id exists and is titled correctly", ({ id, title }) => {
    const section = doc.getElementById(id);
    expect(section).toBeTruthy();
    expect(section.tagName).toBe("SECTION");
    const heading = section.querySelector("h1, h2, h3");
    expect(heading).toBeTruthy();
    expect(heading.textContent).toMatch(title);
  });

  test("the five answer sections appear in order 01..05", () => {
    const fiveIds = ["transient", "richtext", "extending", "setstate", "modals"];
    const positions = fiveIds.map((id) => {
      const s = doc.getElementById(id);
      // each answer section opens with a numbered <h2><span class="num">0N</span>
      return s.querySelector("h2 .num")?.textContent.trim();
    });
    expect(positions).toEqual(["01", "02", "03", "04", "05"]);
  });

  test("a TL;DR states the core mental model up top", () => {
    const tldr = doc.querySelector(".tldr");
    expect(tldr).toBeTruthy();
    expect(tldr.textContent).toMatch(/TL;DR/i);
    expect(tldr.textContent).toMatch(/DOM is the only state store/i);
  });
});

describe("doc nav: the table of contents is fully wired", () => {
  const tocLinks = [...doc.querySelectorAll(".toc a[href^='#']")];

  test("the TOC links to every section (overview, 1..5, verify)", () => {
    const targets = tocLinks.map((a) => a.getAttribute("href").slice(1));
    for (const { id } of SECTIONS) expect(targets).toContain(id);
  });

  test("no TOC link is dead — every #anchor resolves to a real element", () => {
    expect(tocLinks.length).toBeGreaterThanOrEqual(SECTIONS.length);
    for (const a of tocLinks) {
      const id = a.getAttribute("href").slice(1);
      expect(doc.getElementById(id)).toBeTruthy();
    }
  });
});

describe("doc demos: every question is backed by a live demo", () => {
  const present = [...doc.querySelectorAll(".demo[data-demo]")].map((d) => d.getAttribute("data-demo"));

  test("all expected demos are present and none are extra", () => {
    expect(new Set(present)).toEqual(new Set(ALL_DEMO_IDS));
    expect(present.length).toBe(ALL_DEMO_IDS.length);
  });

  test.each(Object.entries(EXPECTED_DEMOS))("section #%s has its live demo(s)", (sectionId, demoIds) => {
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

  test("the extending section documents the real format API (Sap.formats / Sap.config)", () => {
    const section = doc.getElementById("extending");
    expect(section.textContent).toMatch(/Sap\.formats\./);
    expect(section.textContent).toMatch(/Sap\.config\(\s*\{\s*formats/);
  });
});

describe("doc visuals: the three required diagrams are present", () => {
  const diagrams = [...doc.querySelectorAll(".diagram")];
  const text = diagrams.map((d) => d.textContent).join("\n");

  test("there are three diagram blocks", () => {
    expect(diagrams.length).toBe(3);
  });

  test("(a) the pass cycle diagram names all four phases", () => {
    expect(text).toMatch(/pass cycle/i);
    for (const phase of ["intake", "compute", "paint", "discard"]) {
      expect(text.toLowerCase()).toContain(phase);
    }
  });

  test("(b) a diagram contrasts the runtime store with the saved bytes", () => {
    expect(text).toMatch(/runtime store vs\. saved bytes/i);
  });

  test("(c) a diagram shows the set-state write paths converging", () => {
    expect(text).toMatch(/writes converge/i);
  });
});
