#!/usr/bin/env node
// Recompute geometric measures from stored landmarks with the current js/analysis.js,
// so changing a measure doesn't require re-running face detection.
//   node tools/calibrate/remeasure.js in.jsonl out.jsonl
const fs = require('fs');
require('../../js/analysis.js');
const [inp, outp] = process.argv.slice(2);
const out = [];
for (const line of fs.readFileSync(inp, 'utf8').split('\n')) {
  if (!line) continue;
  const d = JSON.parse(line);
  if (d.landmarks) {
    const m = globalThis.FaceAnalysis.measure(d.landmarks.map(([x, y]) => ({ x, y })));
    d.leveled = m.leveled.map((p) => [p.x, p.y]);
    delete m.leveled;
    d.measures = m;
  }
  out.push(JSON.stringify(d));
}
fs.writeFileSync(outp, out.join('\n') + '\n');
console.log(`remeasured ${out.length} rows`);
