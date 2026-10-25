// Mount-time static analysis. Loud, attributed, teaching failures: a structural
// contradiction halts the whole app (no listeners arm, file bytes stay frozen);
// warnings never halt. This is the agent-authorability gate.

import { parseStateDecl, rowsOf, templateOf, sharedTemplate, isNativeBoolean } from "./dom.js";
import { RESERVED, HTML_GLOBALS, NATIVE_BOOLEANS, didYouMean, setBeacon } from "./errors.js";

const NATIVE_BOOLEAN_SET = new Set(NATIVE_BOOLEANS);
// `editmode` and `viewmode` are platform prefixes (editmode:onclick etc.), not Sap
// verbs. They are allow-listed here so Sap stays quiet about them when co-loaded;
// each single entry covers its whole family, so new members in hyperclayjs need no
// change. Sap has no engine branch for either (both are no-ops in Sap).
const COLON_PREFIXES = new Set(["calc", "text", "attr", "class", "css", "set", "move", "sort", "option", "option-not", "show-when", "hide-when", "editmode", "viewmode"]);
// The show-when family compares against a literal attribute value (or `|`-list),
// never a JS expression. An expression-shaped value means the author reached for
// show= by mistake; catch it loudly instead of failing the match silently.
const WHEN_PREFIXES = new Set(["show-when", "hide-when", "option", "option-not"]);
const EXPR_SHAPED = /\b(?:state|item|root)\.|===|!==|&&|\|\||[()]|^\s*!/;
const KNOWN_BARE = new Set([
  "sap", "scope", "items", "item", "template", "bind", "show", "effect", "invalid",
  "detail", "state", "transient", "confirm", "default", "persist", "sortable",
  "trigger-add", "trigger-remove", "trigger-reset", "sap-ignore", "sap-error",
  "no-save", "no-watch", "no-undo",
  // hyperclayjs platform region markers (canonical + legacy aliases). sapjs tolerates
  // them so a co-loaded region attribute inside a [sap] root is never flagged a typo.
  "no-trigger-autosave", "freeze", "mutations-ignore", "save-remove", "save-ignore", "save-freeze",
]);

const extraChecks = [];

export function addLintCheck(check) {
  if (!extraChecks.includes(check)) extraChecks.push(check);
}

function isControl(el) {
  return el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA";
}

function isBound(el) {
  return el.hasAttribute("bind");
}

// Walk every element under the app, skipping inert subtrees, calling visit(el).
// A shared <template items> blueprint is checked through its content.
function walkAll(root, visit) {
  visit(root);
  for (let child = root.firstElementChild; child; child = child.nextElementSibling) descend(child);
  function descend(el) {
    if (el.hasAttribute("sap-ignore")) return;
    if (el.tagName === "TEMPLATE") {
      if (el.hasAttribute("items")) for (let c = el.content.firstElementChild; c; c = c.nextElementSibling) descend(c);
      return;
    }
    visit(el);
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) descend(c);
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
    const claimed = new Set();
    for (const check of extraChecks) check(el, halt, (name) => claimed.add(name));
    const inDetail = el.closest && el.closest("[detail]");

    for (const a of [...el.attributes]) {
      const name = a.name;
      if (claimed.has(name)) continue;

      // colon-prefixed attribute checks
      if (name.includes(":")) {
        const prefix = name.slice(0, name.indexOf(":"));
        if (!COLON_PREFIXES.has(prefix)) {
          const dym = didYouMean(prefix, [...COLON_PREFIXES]);
          diag.warn("W03", el, {
            attr: name,
            problem: `unknown "${prefix}:" attribute`,
            didYouMean: dym ? `${dym}:` : null,
          });
        } else if (WHEN_PREFIXES.has(prefix) && EXPR_SHAPED.test(a.value)) {
          const field = name.slice(name.indexOf(":") + 1);
          diag.warn("W04", el, {
            attr: name, expr: a.value,
            problem: `${prefix}: compares the "${field}" attribute against a literal value, not a JS expression`,
            fix: `use show="${a.value}" for an expression, or a literal like ${prefix}:${field}="overview"`,
          });
        }
      } else if (
        !KNOWN_BARE.has(name) &&
        !HTML_GLOBALS.has(name) &&
        !NATIVE_BOOLEAN_SET.has(name) &&
        !/^(data-|aria-|on)/.test(name) &&
        !(name in el)
      ) {
        // Bare (no-colon) attribute that looks like a typo'd Sap directive. Only
        // warn when it is near a known directive (didYouMean returns a match) and
        // is not a native HTML attribute (no matching IDL property), so ordinary
        // HTML attributes never trip it.
        const dym = didYouMean(name, [...KNOWN_BARE]);
        if (dym) {
          diag.warn("W03", el, { attr: name, problem: `unknown "${name}" attribute`, didYouMean: dym });
        }
      }

      // attr:hidden redirect
      if (name === "attr:hidden") {
        diag.warn("W03", el, { attr: name, problem: "attr:hidden paints the wrong attribute", fix: 'use show="expr"' });
      }

      // attr:value / attr:checked / attr:selected on a bound control
      const ownedByBind = isBound(el) || (name === "attr:selected" && el.tagName === "OPTION" && !!el.closest("select[bind]"));
      if ((name === "attr:value" || name === "attr:checked" || name === "attr:selected") && ownedByBind) {
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
        if (RESERVED.has(d.attr)) halt("E05", el, { attr: "state", problem: `"${d.name}" is a reserved Sap word` });
        if (HTML_GLOBALS.has(d.attr)) halt("E06", el, { attr: "state", problem: `"${d.name}" is a global HTML attribute name; pick another field name` });
        // dialog state=open
        if (d.name === "open" && el.tagName === "DIALOG") {
          halt("E33", el, { attr: "state", problem: "dialog open is transient", fix: "use showModal() — declare state= only on <details> or popovers" });
        }
        const native = isNativeBoolean(el, d.attr);
        if (native && (d.attr === "checked" || d.attr === "selected")) {
          halt("E35", el, { attr: "state", problem: `"${d.attr}" on a form control is the control's own state, not a declared field`, fix: "bind the control instead, e.g. <input type=\"checkbox\" bind=\"done\">" });
        }
        if (native && d.type === "num") {
          halt("E35", el, { attr: "state", problem: `"${d.attr}" is an HTML boolean attribute; it cannot hold a number`, fix: `declare it bare: state="${d.attr}"` });
        }
        if (d.transient && (native || d.type === "presence")) {
          halt("E35", el, { attr: "state", problem: `"${d.name}" is carried by attribute presence, which transient would strip`, fix: "declare a separate name:bool:transient field and paint the attribute from it" });
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

    // transient + persist are opposite intents on one control: transient strips
    // the value every pass (never serialized); persist forces it into the saved
    // bytes and wins, leaking exactly what transient promised to drop.
    if (el.hasAttribute("transient") && el.hasAttribute("persist")) {
      halt("E34", el, {
        problem: "transient and persist are opposite: persist forces the live value into the saved bytes, leaking exactly what transient drops",
        fix: "remove one — transient to keep it out of the file, or persist to save it",
      });
    }

    // showModal() writes open; only a freeze ancestor keeps the dialog in the file
    // while saving it as it first appeared (no open). editor-ui and no-save would
    // delete the dialog from the file, and freeze on the dialog itself saves open.
    if (el.tagName === "DIALOG" && el.hasAttribute("detail") &&
        !(el.parentElement && el.parentElement.closest('[clay~="freeze"], [freeze], [save-freeze]'))) {
      diag.warn("W31", el, {
        attr: "detail",
        problem: "a detail dialog writes open when it opens, and that attribute would be saved into the file",
        fix: 'wrap the dialog in an element with clay="freeze" (not editor-ui, which removes it from the file), and make its key field transient',
      });
    }

    // orphan item
    if (el.hasAttribute("item") && !el.hasAttribute("template") && el.parentNode && el.parentNode.nodeType === 1) {
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
      if (!templateOf(el) && !sharedTemplate(root, el.getAttribute("items")) && rowsOf(el).length === 0 && targeted) {
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
