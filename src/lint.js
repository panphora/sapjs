// Mount-time static analysis. Loud, attributed, teaching failures: a structural
// contradiction halts the whole app (no listeners arm, file bytes stay frozen);
// warnings never halt. This is the agent-authorability gate.

import { parseStateDecl, rowsOf, templateOf } from "./dom.js";
import {
  teachForAttr, RESERVED, HTML_GLOBALS, NATIVE_BOOLEANS, didYouMean, setBeacon,
} from "./errors.js";

const NATIVE_BOOLEAN_SET = new Set(NATIVE_BOOLEANS);
const COLON_PREFIXES = new Set(["calc", "text", "attr", "class", "css", "set", "move", "sort", "option", "editmode"]);
const KNOWN_BARE = new Set([
  "app", "scope", "items", "item", "template", "bind", "show", "effect", "invalid",
  "detail", "state", "transient", "confirm", "default", "persist", "sortable",
  "trigger-add", "trigger-remove", "trigger-reset", "sap-ignore", "sap-error",
  "no-save", "no-watch", "no-undo",
]);

function isControl(el) {
  return el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA";
}

function isBound(el) {
  return el.hasAttribute("bind");
}

// Walk every element under the app, skipping inert subtrees, calling visit(el).
function walkAll(root, visit) {
  visit(root);
  for (const child of root.children) descend(child);
  function descend(el) {
    if (el.nodeType !== 1) return;
    if (el.hasAttribute("sap-ignore") || el.hasAttribute("template")) {
      // still scan template descendants for structural errors, but not sap-ignore
      if (el.hasAttribute("sap-ignore")) return;
    }
    visit(el);
    for (const c of el.children) descend(c);
  }
}

export function lintApp(root, diag) {
  let halted = false;
  const halt = (code, el, info) => {
    diag.error(code, el, info);
    halted = true;
  };

  // moustaches in any text node
  const tw = root.ownerDocument.createTreeWalker(root, 0x4 /* NodeFilter.SHOW_TEXT */);
  let node;
  while ((node = tw.nextNode())) {
    if (/\{\{.*\}\}/.test(node.nodeValue || "")) {
      halt("E02", node.parentElement || root, {
        problem: "moustaches in text content are not a Sap feature",
        fix: 'move the expression onto the element: text="state.x"',
      });
      break;
    }
  }

  walkAll(root, (el) => {
    const inDetail = el.closest && el.closest("[detail]");

    for (const a of [...el.attributes]) {
      const name = a.name;

      // foreign-dialect attributes
      const teach = teachForAttr(name);
      if (teach) {
        halt("E01", el, {
          attr: name, expr: a.value,
          problem: `"${name}" is a foreign-dialect attribute; Sap has no ${name.split(/[:=]/)[0]} directive`,
          fix: teach + " — or wrap the subtree in sap-ignore if intentional",
        });
        continue;
      }

      // unknown colon-prefixed attribute
      if (name.includes(":")) {
        const prefix = name.slice(0, name.indexOf(":"));
        if (!COLON_PREFIXES.has(prefix)) {
          const dym = didYouMean(prefix, [...COLON_PREFIXES]);
          diag.warn("W03", el, {
            attr: name,
            problem: `unknown "${prefix}:" attribute`,
            didYouMean: dym ? `${dym}:` : null,
          });
        }
      }

      // attr:hidden redirect
      if (name === "attr:hidden") {
        diag.warn("W03", el, { attr: name, problem: "attr:hidden paints the wrong attribute", fix: 'use show="expr"' });
      }

      // attr:value / attr:checked / attr:selected on a bound control
      if ((name === "attr:value" || name === "attr:checked" || name === "attr:selected") && isBound(el)) {
        halt("E30", el, { attr: name, problem: "attr: on a bound control collides with persist ownership", fix: "remove it; bind owns this attribute" });
      }

      // effect assigning value/checked on a bound control (rule-b side door)
      if (name === "effect" && isBound(el) && /\b(value|checked)\s*=[^=]/.test(a.value)) {
        halt("E30", el, { attr: name, expr: a.value, problem: "effect writes value/checked on a bound control (writes a stale value with no synthetic event)", fix: "write through onclick + Sap(this) instead" });
      }

      // text / show on a form control
      if ((name === "text" || name.startsWith("text:") || name === "show") && isControl(el)) {
        if (name === "show") {
          // show on a control is allowed (visibility); only text paints are the error
        } else {
          halt("E18", el, { attr: name, problem: "paint belongs on output elements, not form controls", fix: "move the paint to an <output> or <span>" });
        }
      }
    }

    // state= declarations
    if (el.hasAttribute("state")) {
      const decls = parseStateDecl(el.getAttribute("state"));
      const seen = new Set();
      for (const d of decls) {
        if (d.name.includes("-")) {
          halt("E08", el, { attr: "state", problem: `field "${d.name}" is not a valid identifier (the hyphen parses as subtraction)`, fix: `rename to ${d.name.replace(/-/g, "")}` });
        }
        if (seen.has(d.name)) halt("E04", el, { attr: "state", problem: `field "${d.name}" is declared twice in one scope` });
        seen.add(d.name);
        if (RESERVED.has(d.name)) halt("E05", el, { attr: "state", problem: `"${d.name}" is a reserved Sap word` });
        if (HTML_GLOBALS.has(d.name)) halt("E06", el, { attr: "state", problem: `"${d.name}" is a global HTML attribute name; pick another field name` });
        // dialog state=open
        if (d.name === "open" && el.tagName === "DIALOG") {
          halt("E33", el, { attr: "state", problem: "dialog open is transient", fix: "use showModal() — declare state= only on <details> or popovers" });
        }
      }
    }

    // bind matrix mount errors
    if (isBound(el)) {
      if (el.hasAttribute("-")) { /* noop */ }
      if (el.tagName === "INPUT") {
        const t = (el.getAttribute("type") || "text").toLowerCase();
        if (t === "file") halt("E32", el, { attr: "bind", problem: "files never serialize into an HTML file", fix: 'use no-save + effect instead of bind' });
        if (t === "password" && !el.hasAttribute("transient")) {
          halt("E31", el, { attr: "bind", problem: "a password must never serialize into a world-readable file", fix: "add transient to the password input" });
        }
      } else if (el.tagName !== "SELECT" && el.tagName !== "TEXTAREA") {
        // A bind on a leaf reads/writes textContent. On a container (element
        // children) that is not contenteditable, the first write would wipe the
        // subtree — that is never a valid two-way control.
        const ce = el.getAttribute("contenteditable");
        const editable = ce != null && ce !== "false";
        if (!editable && el.children.length > 0) {
          halt("E20", el, { attr: "bind", problem: "bind on a container element is not a control; a write would overwrite its children", fix: "bind a control (input/select/textarea), a contenteditable, or an empty text leaf" });
        }
      }
    }

    // orphan item
    if (el.hasAttribute("item") && !el.hasAttribute("template")) {
      const list = el.parentElement;
      if (!list || !list.hasAttribute("items")) {
        halt("E10", el, { problem: "an [item] must be a direct child of an [items] list", fix: "wrap it in a container with items=\"name\"" });
      }
    }

    // nested items inside detail
    if (el.hasAttribute("items") && inDetail) {
      halt("E17", el, { attr: "items", problem: "nested items inside a detail panel is a v1 mount error (nested collections ship in v1.1)" });
    }

    // list with trigger-add but no template
    if (el.hasAttribute("items")) {
      const targeted = root.querySelector(`[trigger-add="${el.getAttribute("items")}"]`);
      if (!templateOf(el) && rowsOf(el).length === 0 && targeted) {
        halt("E17", el, { attr: "items", problem: `trigger-add targets items="${el.getAttribute("items")}" but it has no [item template] to clone` });
      }
    }
  });

  if (halted) {
    diag.halted = true;
    diag.haltReason = diag.errors[0] ? diag.errors[0].code : "halt";
    setBeacon(root, diag.haltReason);
  }
  return !halted;
}
