#!/usr/bin/env node
/*
 * Runs the app's own landmark + feature pipeline over the SCUT-FBP5500 faces
 * and writes one JSON line per image (resumable).
 *
 *   node tools/calibrate/extract.js <scut-dir> <out.jsonl> [workers]
 *
 * <scut-dir> must contain train_test_files/All_labels.txt and the images
 * (searched recursively). Images are only read locally — they are never
 * copied into this repository (the dataset is for non-commercial research).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const [scutDir, outFile, workersArg] = process.argv.slice(2);
const WORKERS = Number(workersArg || 3);
const repoRoot = path.resolve(__dirname, '../..');

const labels = fs.readFileSync(path.join(scutDir, 'train_test_files/All_labels.txt'), 'utf8')
  .trim().split('\n').map((l) => l.trim().split(/\s+/)).map(([f, r]) => ({ file: f, rating: Number(r) }));

const imgPath = {};
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.jpg')) imgPath[e.name] = p;
  }
})(scutDir);

const done = new Set();
if (fs.existsSync(outFile)) {
  for (const l of fs.readFileSync(outFile, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).file);
}
const todo = labels.filter((l) => !done.has(l.file) && imgPath[l.file]);
console.log(`${labels.length} labelled, ${done.size} done, ${todo.length} to go`);

// Static server: repo at /, dataset images at /scut/<name>
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const file = u.startsWith('/scut/') ? imgPath[u.slice(6)] : path.join(repoRoot, path.normalize(u));
  if (!file || (!u.startsWith('/scut/') && !file.startsWith(repoRoot)) || !fs.existsSync(file)) {
    res.writeHead(404); return res.end();
  }
  const ext = path.extname(file);
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg' }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(file).pipe(res);
});

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const out = fs.createWriteStream(outFile, { flags: 'a' });
  let next = 0;
  let finished = 0;
  const t0 = Date.now();

  async function worker() {
    const page = await browser.newPage();
    await page.goto(`${base}/tools/calibrate/extract.html`);
    const backend = await page.evaluate(() => window.ready);
    if (next === 0) console.log('backend:', backend);
    while (next < todo.length) {
      const item = todo[next++];
      let result;
      try {
        result = await page.evaluate((u) => window.extractOne(u), `${base}/scut/${item.file}`);
      } catch (e) {
        // Page/browser errors are not recorded, so a re-run retries the image.
        console.error(item.file, e.message);
        continue;
      }
      out.write(JSON.stringify({ ...item, ...(result || { noFace: true }) }) + '\n');
      finished++;
      if (finished % 50 === 0) {
        const rate = finished / ((Date.now() - t0) / 1000);
        console.log(`${finished}/${todo.length}  ${rate.toFixed(2)} img/s  ~${((todo.length - finished) / rate / 60).toFixed(1)} min left`);
      }
    }
    await page.close();
  }

  await Promise.all(Array.from({ length: WORKERS }, worker));
  out.end();
  await browser.close();
  server.close();
  console.log('done');
});
