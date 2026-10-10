(function () {
  'use strict';

  const MODEL_URL = 'vendor/face-api/model';
  const MAX_DIM = 1280;

  const $ = (id) => document.getElementById(id);
  const els = {
    dropzone: $('dropzone'), fileInput: $('file-input'), status: $('status'),
    cameraBtn: $('camera-btn'), cameraWrap: $('camera-wrap'), video: $('video'),
    snapBtn: $('snap-btn'), cameraClose: $('camera-close'),
    results: $('results'), canvas: $('canvas'), showOverlay: $('show-overlay'),
    restart: $('restart'), beardPref: $('beard-pref'), hairPref: $('hair-pref'),
    overall: $('overall-score'), ringFg: $('ring-fg'), faceShape: $('face-shape'),
    shapeSummary: $('shape-summary'), strengths: $('strengths'), warnings: $('warnings'),
    metrics: $('metrics'), styles: $('styles'), improvements: $('improvements'),
    general: $('general'), extras: $('extras'), inputSection: $('input-section'),
    options: $('options'), optionsSlot: $('options-slot'),
  };

  let modelsReady = null;
  let stream = null;
  let current = null; // { image, landmarks, result }

  function setStatus(msg, kind) {
    els.status.textContent = msg || '';
    els.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  // GPU (WebGL) is much faster; fall back to plain CPU where it's unavailable.
  async function initBackend() {
    const tf = faceapi.tf;
    try {
      if (await tf.setBackend('webgl')) return tf.ready();
    } catch (_) { /* fall through */ }
    await tf.setBackend('cpu');
    return tf.ready();
  }

  function loadModels() {
    if (!modelsReady) {
      modelsReady = initBackend().then(() => Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ])).catch((err) => {
        modelsReady = null;
        throw err;
      });
    }
    return modelsReady;
  }

  // ---------- Input handling ----------

  function readFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      setStatus('Please choose an image file.', 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); process(img); };
    img.onerror = () => { URL.revokeObjectURL(url); setStatus('Could not read that image.', 'error'); };
    img.src = url;
  }

  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
  });
  els.fileInput.addEventListener('change', () => readFile(els.fileInput.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault(); els.dropzone.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault(); els.dropzone.classList.remove('over');
  }));
  els.dropzone.addEventListener('drop', (e) => readFile(e.dataTransfer.files[0]));

  els.cameraBtn.addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } } });
      els.video.srcObject = stream;
      await els.video.play();
      els.cameraWrap.hidden = false;
      els.cameraBtn.hidden = true;
    } catch (err) {
      setStatus('Camera unavailable: ' + err.message, 'error');
    }
  });

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    els.cameraWrap.hidden = true;
    els.cameraBtn.hidden = false;
  }
  els.cameraClose.addEventListener('click', stopCamera);

  els.snapBtn.addEventListener('click', () => {
    const v = els.video;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    // Un-mirror: the preview is mirrored for comfort, the capture should not be.
    ctx.drawImage(v, 0, 0);
    stopCamera();
    const img = new Image();
    img.onload = () => process(img);
    img.src = c.toDataURL('image/jpeg', 0.92);
  });

  els.restart.addEventListener('click', () => {
    els.results.hidden = true;
    els.inputSection.hidden = false;
    els.dropzone.before(els.options); // move the beard/hair options back to the upload card
    els.fileInput.value = '';
    setStatus('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  els.showOverlay.addEventListener('change', () => current && draw());
  [els.beardPref, els.hairPref].forEach((s) => s.addEventListener('change', () => current && renderAdvice()));

  // ---------- Processing ----------

  async function process(img) {
    try {
      setStatus('Loading face models…', 'busy');
      await loadModels();
      setStatus('Detecting facial landmarks…', 'busy');

      // Work on a size-capped copy so huge phone photos stay fast.
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const work = document.createElement('canvas');
      work.width = Math.round(img.naturalWidth * scale);
      work.height = Math.round(img.naturalHeight * scale);
      work.getContext('2d').drawImage(img, 0, 0, work.width, work.height);

      const detections = await faceapi
        .detectAllFaces(work, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks();

      if (!detections.length) {
        setStatus('No face found. Try a brighter, front-facing photo where your whole face is visible.', 'error');
        return;
      }
      // Analyse the largest face in the picture.
      const best = detections.reduce((a, b) => (b.detection.box.area > a.detection.box.area ? b : a));
      const landmarks = best.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
      const result = FaceAnalysis.analyze(landmarks);

      current = { image: work, landmarks, box: best.detection.box, result };
      if (detections.length > 1) {
        result.warnings.unshift(`${detections.length} faces found — analysed the largest one.`);
      }
      setStatus('');
      render();
    } catch (err) {
      console.error(err);
      setStatus('Something went wrong: ' + err.message, 'error');
    }
  }

  // ---------- Rendering ----------

  function draw() {
    const { image, landmarks, box, result } = current;
    const cv = els.canvas;

    // Crop around the face with generous padding.
    const pad = Math.max(box.width, box.height) * 0.6;
    const sx = Math.max(0, box.x - pad);
    const sy = Math.max(0, box.y - pad * 1.1);
    const ex = Math.min(image.width, box.x + box.width + pad);
    const ey = Math.min(image.height, box.y + box.height + pad * 0.8);
    const sw = ex - sx;
    const sh = ey - sy;
    const k = Math.min(1, 900 / Math.max(sw, sh)) * (window.devicePixelRatio > 1 ? 1.5 : 1);
    cv.width = Math.round(sw * k);
    cv.height = Math.round(sh * k);

    const ctx = cv.getContext('2d');
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    if (!els.showOverlay.checked) return;

    const tx = (p) => ({ x: (p.x - sx) * k, y: (p.y - sy) * k });
    const lw = Math.max(1.5, cv.width / 400);

    // Guides are drawn in the "levelled" frame then rotated back with the head roll.
    const lv = result.raw.leveled.map(tx);
    const eyeC = (() => {
      const le = landmarks.slice(36, 42);
      const re = landmarks.slice(42, 48);
      const avg = (arr) => arr.reduce((a, p) => ({ x: a.x + p.x / arr.length, y: a.y + p.y / arr.length }), { x: 0, y: 0 });
      const l = avg(le);
      const r = avg(re);
      return tx({ x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 });
    })();

    ctx.save();
    ctx.translate(eyeC.x, eyeC.y);
    ctx.rotate((result.raw.rollDeg * Math.PI) / 180);
    ctx.translate(-eyeC.x, -eyeC.y);
    ctx.lineWidth = lw;

    const left = lv[0].x - 20 * lw;
    const right = lv[16].x + 20 * lw;
    const hline = (y, color) => {
      ctx.strokeStyle = color;
      ctx.setLineDash([6 * lw, 4 * lw]);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    };
    const glabellaY = (lv[21].y + lv[22].y) / 2;
    hline(glabellaY, 'rgba(255,200,80,.9)');
    hline(lv[33].y, 'rgba(255,200,80,.9)');
    hline(lv[8].y, 'rgba(255,200,80,.9)');

    // Midline
    const midX = (lv[27].x + lv[8].x) / 2;
    ctx.strokeStyle = 'rgba(120,200,255,.9)';
    ctx.beginPath(); ctx.moveTo(midX, glabellaY - (lv[8].y - glabellaY) * 0.45); ctx.lineTo(midX, lv[8].y + 10 * lw); ctx.stroke();
    ctx.setLineDash([]);

    // Fifths: eye widths and inner gap
    ctx.strokeStyle = 'rgba(160,255,170,.95)';
    const fy = Math.min(lv[37].y, lv[44].y) - 4 * lw;
    [[36, 39], [39, 42], [42, 45]].forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(lv[a].x, fy); ctx.lineTo(lv[b].x, fy);
      ctx.moveTo(lv[a].x, fy - 3 * lw); ctx.lineTo(lv[a].x, fy + 3 * lw);
      ctx.moveTo(lv[b].x, fy - 3 * lw); ctx.lineTo(lv[b].x, fy + 3 * lw);
      ctx.stroke();
    });
    ctx.restore();

    // Landmark contours (in image space)
    const pts = landmarks.map(tx);
    const groups = [[0, 16, false], [17, 21, false], [22, 26, false], [27, 30, false], [31, 35, false], [36, 41, true], [42, 47, true], [48, 59, true], [60, 67, true]];
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = lw * 0.8;
    for (const [a, b, closed] of groups) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      for (let i = a + 1; i <= b; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (closed) ctx.closePath();
      ctx.stroke();
    }
    ctx.fillStyle = '#ff5c8a';
    for (const p of pts) {
      ctx.beginPath(); ctx.arc(p.x, p.y, lw * 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function scoreClass(s) {
    return s >= 8 ? 'good' : s >= 6 ? 'ok' : 'low';
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function list(items) {
    const ul = el('ul');
    items.forEach((t) => ul.appendChild(el('li', null, t)));
    return ul;
  }

  function render() {
    const { result } = current;
    els.inputSection.hidden = true;
    els.results.hidden = false;
    els.optionsSlot.appendChild(els.options); // keep beard/hair options adjustable on the results
    draw();

    els.overall.textContent = result.overall.toFixed(1);
    const circ = 2 * Math.PI * 52;
    els.ringFg.style.strokeDasharray = `${circ}`;
    els.ringFg.style.strokeDashoffset = `${circ * (1 - result.overall / 10)}`;
    els.ringFg.setAttribute('class', 'ring-fg ' + scoreClass(result.overall));

    els.warnings.replaceChildren(...result.warnings.map((w) => el('li', null, w)));

    els.metrics.replaceChildren(...result.metrics.map((m) => {
      const card = el('div', 'metric');
      const head = el('div', 'metric-head');
      head.append(el('span', 'metric-label', m.label), el('span', 'metric-score ' + scoreClass(m.score), m.score.toFixed(1)));
      const bar = el('div', 'bar');
      const fill = el('div', 'bar-fill ' + scoreClass(m.score));
      fill.style.width = `${m.score * 10}%`;
      bar.appendChild(fill);
      const vals = el('div', 'metric-vals small');
      vals.append(el('span', null, `You: ${m.display}`), el('span', 'muted', `Typical ideal: ${m.idealText}`));
      card.append(head, bar, vals, el('p', 'small muted', m.desc));
      return card;
    }));

    renderAdvice();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderAdvice() {
    const { result } = current;
    const advice = FaceRecommendations.build(result, {
      beard: els.beardPref.value,
      hair: els.hairPref.value,
    });

    els.faceShape.textContent = advice.shape.name;
    els.shapeSummary.textContent = advice.shape.summary;

    els.strengths.replaceChildren();
    if (advice.strengths.length) {
      els.strengths.append(el('p', 'small', 'Your strongest features:'));
      const tags = el('div', 'tags');
      advice.strengths.forEach((s) => tags.appendChild(el('span', 'tag', s)));
      els.strengths.append(tags);
    }

    const blocks = [
      ['💇 Hairstyles', advice.hair],
      advice.beard && ['🧔 Facial hair', advice.beard],
      ['👓 Glasses frames', advice.glasses],
      ['🚫 Better to avoid', advice.avoid],
    ].filter(Boolean);
    els.styles.replaceChildren(...blocks.map(([title, items]) => {
      const box = el('div', 'style-box');
      box.append(el('h3', null, title), list(items));
      return box;
    }));

    if (advice.improvements.length) {
      els.improvements.replaceChildren(...advice.improvements.map((imp) => {
        const box = el('details', 'improvement');
        box.open = true;
        const sum = el('summary');
        sum.append(el('span', null, imp.title), el('span', 'metric-score ' + scoreClass(imp.score), `${imp.metric} · ${imp.score.toFixed(1)}`));
        box.append(sum, list(imp.tips));
        return box;
      }));
    } else {
      els.improvements.replaceChildren(el('p', null, 'All your measurements are within the typical range — focus on the general tips below to make the most of it.'));
    }

    els.extras.replaceChildren(...advice.extras.map((x) => {
      const box = el('details', 'improvement');
      box.open = true;
      const sum = el('summary');
      sum.append(el('span', null, x.title));
      box.append(sum, list(x.tips));
      return box;
    }));

    els.general.replaceChildren(...advice.general.map((g) => {
      const box = el('div', 'tip');
      box.append(el('h3', null, g.title), el('p', 'small', g.text));
      return box;
    }));
  }

  // Start fetching the models right away so the first analysis is quick.
  loadModels().catch(() => setStatus('Could not load the face models. Serve this folder over http (see README).', 'error'));
})();
