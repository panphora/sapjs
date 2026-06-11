import { compile, run, topoSort, clearCompileCache } from "../src/compile.js";

describe("compile", () => {
  test("compiles an expression and runs it with the frozen signature", () => {
    const e = compile("state.a + item.b");
    expect(e.error).toBeNull();
    expect(run(e, { state: { a: 2 }, item: { b: 3 }, root: {} })).toBe(5);
  });

  test("helpers are in scope", () => {
    const e = compile("sum(state.rows, 'p')");
    expect(run(e, { state: { rows: [{ p: 1 }, { p: 2 }] }, item: null, root: {} })).toBe(3);
  });

  test("statement body (effect) runs without a return", () => {
    const e = compile("el.dataset.n = state.x", true);
    expect(e.statement).toBe(true);
    const el = { dataset: {} };
    run(e, { state: { x: "9" }, item: null, el, root: {} });
    expect(el.dataset.n).toBe("9");
  });

  test("syntax errors are captured, not thrown at compile", () => {
    const e = compile("state.a +");
    expect(e.error).not.toBeNull();
    expect(() => run(e, { state: {}, root: {} })).toThrow();
  });

  test("dependency extraction finds state.x and item.y", () => {
    const e = compile("state.qty * state.price + item.discount");
    expect([...e.deps.state].sort()).toEqual(["price", "qty"]);
    expect([...e.deps.item]).toEqual(["discount"]);
  });

  test("the cache returns the same entry for the same source", () => {
    clearCompileCache();
    const a = compile("state.z");
    const b = compile("state.z");
    expect(a).toBe(b);
    // statement variant is a distinct cache key
    expect(compile("state.z", true)).not.toBe(a);
  });
});

describe("topoSort", () => {
  test("orders a calc that reads another calc after it", () => {
    const calcs = [
      { name: "total", entry: compile("state.subtotal + state.tax") },
      { name: "subtotal", entry: compile("sum(state.lines, 'amt')") },
      { name: "tax", entry: compile("state.subtotal * 0.1") },
    ];
    const order = topoSort(calcs).map((c) => c.name);
    expect(order.indexOf("subtotal")).toBeLessThan(order.indexOf("tax"));
    expect(order.indexOf("subtotal")).toBeLessThan(order.indexOf("total"));
    expect(order.indexOf("tax")).toBeLessThan(order.indexOf("total"));
  });

  test("a cycle throws a tagged E07 naming the chain", () => {
    const calcs = [
      { name: "a", entry: compile("state.b") },
      { name: "b", entry: compile("state.a") },
    ];
    try {
      topoSort(calcs);
      throw new Error("expected a cycle error");
    } catch (e) {
      expect(e.sapCode).toBe("E07");
      expect(e.cycle).toMatch(/a|b/);
    }
  });
});
