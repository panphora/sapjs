// guide.html is generated from guide.md by scripts/build-guide.mjs. saphtml.com serves both,
// so a stale guide.html would contradict the Markdown it was built from.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

test("guide.html is current with guide.md", () => {
  const script = join(__dirname, "..", "scripts", "build-guide.mjs");
  expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
});
