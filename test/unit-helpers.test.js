import { num, sum, count, avg, min, max, plural, days, formats, applyFormat } from "../src/helpers.js";

describe("aggregate helpers", () => {
  const rows = [{ p: 3, sel: true }, { p: 1, sel: false }, { p: 2, sel: true }];

  test("num coerces NaN-safe", () => {
    expect(num("5")).toBe(5);
    expect(num("")).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(7)).toBe(7);
  });

  test("sum over a field or mapper", () => {
    expect(sum(rows, "p")).toBe(6);
    expect(sum(rows, (r) => r.p * 2)).toBe(12);
    expect(sum([], "p")).toBe(0);
  });

  test("count with and without predicate", () => {
    expect(count(rows)).toBe(3);
    expect(count(rows, (r) => r.sel)).toBe(2);
  });

  test("avg / min / max", () => {
    expect(avg(rows, "p")).toBe(2);
    expect(min(rows, "p")).toBe(1);
    expect(max(rows, "p")).toBe(3);
    expect(avg([], "p")).toBe(0);
  });

  test("min/max fall back to string comparison", () => {
    const names = [{ n: "Bob" }, { n: "Al" }, { n: "Cy" }];
    expect(min(names, "n")).toBe("Al");
    expect(max(names, "n")).toBe("Cy");
  });

  test("plural", () => {
    expect(plural(1, "item")).toBe("1 item");
    expect(plural(3, "item")).toBe("3 items");
    expect(plural(2, "child", "children")).toBe("2 children");
  });

  test("days diff is ISO-date aware", () => {
    expect(days("2025-01-01", "2025-01-11")).toBe(10);
    expect(days("bad", "2025-01-11")).toBe(0);
  });
});

describe("format registry", () => {
  test("currency, percent, int, clock", () => {
    expect(formats.usd(1234)).toBe("$1,234");
    expect(formats.usd2(1234.5)).toBe("$1,234.50");
    expect(formats.pct(42.4)).toBe("42%");
    expect(formats.int(1234.6)).toBe("1,235");
    expect(formats.clock(125000)).toBe("2:05.0");
  });

  test("applyFormat throws a tagged E22 on non-finite numeric input", () => {
    expect(() => applyFormat("usd", NaN)).toThrow();
    try {
      applyFormat("usd", "abc");
    } catch (e) {
      expect(e.sapCode).toBe("E22");
    }
  });

  test("applyFormat throws E22 on an unknown format name", () => {
    try {
      applyFormat("nope", 1);
    } catch (e) {
      expect(e.sapCode).toBe("E22");
    }
  });
});
