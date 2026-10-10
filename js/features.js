/*
 * Appearance (pixel-based) features: skin, under-eyes, facial contrast,
 * brows, facial hair, and photo quality.
 *
 * The face is first warped into a normalised frame (eyes level, inter-pupil
 * distance = 64 px), so every number is comparable across photo sizes. The
 * same code runs in the app and in tools/calibrate, which is what lets the
 * calibration data drive the app's scoring.
 */
(function (global) {
  'use strict';

  const IPD = 64;
  const SIZE = 256;
  const EYE_Y = 100;

  const avgPt = (pts) => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });

  function normalise(source, landmarks) {
    const le = avgPt(landmarks.slice(36, 42));
    const re = avgPt(landmarks.slice(42, 48));
    const ang = Math.atan2(re.y - le.y, re.x - le.x);
    const s = IPD / Math.hypot(re.x - le.x, re.y - le.y);
    const mid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
    const cos = Math.cos(-ang) * s;
    const sin = Math.sin(-ang) * s;
    // x' = cos*(x-mx) - sin*(y-my) + SIZE/2 ; y' = sin*(x-mx) + cos*(y-my) + EYE_Y
    const tx = (p) => ({
      x: cos * (p.x - mid.x) - sin * (p.y - mid.y) + SIZE / 2,
      y: sin * (p.x - mid.x) + cos * (p.y - mid.y) + EYE_Y,
    });
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.setTransform(cos, sin, -sin, cos, SIZE / 2 - cos * mid.x + sin * mid.y, EYE_Y - sin * mid.x - cos * mid.y);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { canvas, ctx, q: landmarks.map(tx) };
  }

  /** Rasterise polygons into a boolean mask. */
  function makeMask(polys) {
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    for (const poly of polys) {
      ctx.beginPath();
      poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const m = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    return m;
  }

  // sRGB → CIELAB (D65)
  function toLab(r, g, b) {
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const R = lin(r), G = lin(g), B = lin(b);
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
    const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
    const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  }

  function boxBlur(src, r) {
    const out = new Float32Array(src.length);
    const tmp = new Float32Array(src.length);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < SIZE) { s += src[y * SIZE + xx]; n++; } }
        tmp[y * SIZE + x] = s / n;
      }
    }
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < SIZE) { s += tmp[yy * SIZE + x]; n++; } }
        out[y * SIZE + x] = s / n;
      }
    }
    return out;
  }

  function stats(arr, mask) {
    let n = 0, s = 0, s2 = 0;
    for (let i = 0; i < arr.length; i++) if (mask[i]) { n++; s += arr[i]; s2 += arr[i] * arr[i]; }
    if (!n) return { n: 0, mean: NaN, sd: NaN };
    const mean = s / n;
    return { n, mean, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
  }

  function median(arr, mask) {
    const v = [];
    for (let i = 0; i < arr.length; i++) if (mask[i]) v.push(arr[i]);
    if (!v.length) return NaN;
    v.sort((a, b) => a - b);
    return v[v.length >> 1];
  }

  function extract(source, landmarks, debugCanvas) {
    const { canvas: normCanvas, ctx, q } = normalise(source, landmarks);
    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const L = new Float32Array(SIZE * SIZE);
    const A = new Float32Array(SIZE * SIZE);
    const C = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < L.length; i++) {
      const [l, a, b] = toLab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      L[i] = l; A[i] = a; C[i] = Math.hypot(a, b);
    }

    const u = IPD; // unit
    const off = (p, dx, dy) => ({ x: p.x + dx * u, y: p.y + dy * u });
    const browTop = Math.min(...q.slice(17, 27).map((p) => p.y));

    const cheekL = [q[1], q[2], off(q[31], -0.12, 0), off(q[40], 0, 0.38), off(q[36], 0, 0.38)];
    const cheekR = [q[15], q[14], off(q[35], 0.12, 0), off(q[47], 0, 0.38), off(q[45], 0, 0.38)];
    const forehead = [
      { x: q[19].x, y: browTop - 0.45 * u }, { x: q[24].x, y: browTop - 0.45 * u },
      { x: q[24].x, y: browTop - 0.12 * u }, { x: q[19].x, y: browTop - 0.12 * u },
    ];
    const underEye = (outer, inner, b1, b2) => [
      off(outer, 0, 0.1), off(b1, 0, 0.08), off(b2, 0, 0.08), off(inner, 0, 0.1),
      off(inner, 0, 0.3), off(outer, 0, 0.3),
    ];
    const browBand = (ids) => [
      ...ids.map((i) => off(q[i], 0, -0.06)),
      ...ids.slice().reverse().map((i) => off(q[i], 0, 0.07)),
    ];
    const eye = (a) => q.slice(a, a + 6);
    const lips = q.slice(48, 60);
    const chin = [q[5], q[6], q[7], q[8], q[9], q[10], q[11], off(q[54], 0, 0.05), off(q[57], 0, 0.05), off(q[48], 0, 0.05)];
    const moustache = [off(q[31], 0, 0.06), off(q[35], 0, 0.06), off(q[54], 0, -0.04), off(q[51], 0, -0.04), off(q[48], 0, -0.04)];

    const mCheekL = makeMask([cheekL]);
    const mCheekR = makeMask([cheekR]);
    const mCheeks = makeMask([cheekL, cheekR]);
    const mForehead = makeMask([forehead]);
    const mUnder = makeMask([underEye(q[36], q[39], q[41], q[40]), underEye(q[45], q[42], q[46], q[47])]);
    const mBrows = makeMask([browBand([17, 18, 19, 20, 21]), browBand([22, 23, 24, 25, 26])]);
    const mEyes = makeMask([eye(36), eye(42)]);
    const mLips = makeMask([lips]);
    const mBeard = makeMask([chin, moustache]);
    const faceBox = makeMask([[off(q[0], 0, -0.3), off(q[16], 0, -0.3), q[12], q[8], q[4]]]);

    if (debugCanvas) {
      // Developer aid: paint each region over the normalised face.
      debugCanvas.width = SIZE;
      debugCanvas.height = SIZE;
      const d = debugCanvas.getContext('2d');
      d.drawImage(normCanvas, 0, 0);
      const regions = [[mCheeks, [0, 255, 0]], [mForehead, [0, 160, 255]], [mUnder, [255, 0, 255]], [mBrows, [255, 200, 0]],
        [mEyes, [255, 0, 0]], [mLips, [255, 120, 120]], [mBeard, [0, 255, 255]]];
      const img = d.getImageData(0, 0, SIZE, SIZE);
      for (const [m, col] of regions) {
        for (let i = 0; i < m.length; i++) if (m[i]) for (let k = 0; k < 3; k++) img.data[i * 4 + k] = img.data[i * 4 + k] * 0.55 + col[k] * 0.45;
      }
      d.putImageData(img, 0, 0);
    }

    const cheekLum = median(L, mCheeks);
    const foreheadLum = median(L, mForehead);
    // Hair or a fringe covering the forehead makes it much darker than the cheeks — skip it then.
    const foreheadOk = foreheadLum > cheekLum * 0.8;
    const mSkin = new Uint8Array(mCheeks);
    if (foreheadOk) for (let i = 0; i < mSkin.length; i++) mSkin[i] |= mForehead[i];

    // Fine texture: luminance minus a small blur (pores, blemishes, stubble, noise).
    const blurSmall = boxBlur(L, 2);
    const hp = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) hp[i] = L[i] - blurSmall[i];
    // Blotchiness: medium-scale variation once fine texture is removed.
    const blurBig = boxBlur(L, 6);
    const aBlur = boxBlur(A, 2);

    const skinL = stats(L, mSkin);
    const texture = stats(hp, mSkin).sd;
    const blotch = stats(blurBig, mSkin).sd;
    const skinA = stats(aBlur, mSkin);
    const chroma = stats(C, mSkin).mean;
    const isColour = chroma > 6;

    const beardTex = stats(hp, mBeard).sd;
    const lumOf = (m) => median(L, m);

    // Sharpness: variance of the Laplacian over the face
    let lapS = 0, lapS2 = 0, lapN = 0;
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const i = y * SIZE + x;
        if (!faceBox[i]) continue;
        const v = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - SIZE] - L[i + SIZE];
        lapS += v; lapS2 += v * v; lapN++;
      }
    }
    const lapMean = lapS / lapN;
    const lCheekL = lumOf(mCheekL);
    const lCheekR = lumOf(mCheekR);

    return {
      // skin
      skinTexture: texture,
      skinBlotch: blotch,
      skinRednessVar: isColour ? skinA.sd : NaN,
      skinRedness: isColour ? skinA.mean : NaN,
      // eye area
      underEye: lumOf(mUnder) / cheekLum,
      eyeContrast: 1 - lumOf(mEyes) / cheekLum,
      browContrast: 1 - lumOf(mBrows) / (foreheadOk ? foreheadLum : cheekLum),
      lipContrast: isColour ? median(A, mLips) - skinA.mean : NaN,
      // facial hair
      beardShadow: 1 - lumOf(mBeard) / cheekLum,
      beardTexture: beardTex / Math.max(texture, 0.5),
      // photo quality
      brightness: skinL.mean,
      lightBalance: Math.abs(lCheekL - lCheekR) / cheekLum,
      sharpness: Math.sqrt(Math.max(0, lapS2 / lapN - lapMean * lapMean)),
      isColour,
      foreheadVisible: foreheadOk,
    };
  }

  global.FaceFeatures = { extract, normalise, SIZE, IPD };
})(typeof window !== 'undefined' ? window : globalThis);
