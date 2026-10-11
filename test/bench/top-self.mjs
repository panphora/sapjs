// node test/bench/top-self.mjs <file.cpuprofile> [n]
// Prints the functions with the most self time.
import { readFileSync } from "node:fs";

const [file, n = "25"] = process.argv.slice(2);
const prof = JSON.parse(readFileSync(file, "utf8"));
const byId = new Map(prof.nodes.map((node) => [node.id, node]));
const self = new Map();
const dt = prof.timeDeltas;
for (let i = 0; i < prof.samples.length; i++) {
  const node = byId.get(prof.samples[i]);
  const cf = node.callFrame;
  const where = cf.url ? cf.url.replace(/^.*\/(node_modules\/[^/]+|src)\//, "$1/") : "(native)";
  const key = `${cf.functionName || "(anonymous)"}  ${where}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + (dt[i] || 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(n));
for (const [key, us] of rows) console.log(`${((us / total) * 100).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(6)} ms  ${key}`);
const sapShare = [...self.entries()].filter(([k]) => k.includes(" src/")).reduce((a, [, v]) => a + v, 0);
console.log(`\nsap src/ self time: ${((sapShare / total) * 100).toFixed(1)}%`);
