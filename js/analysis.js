/*
 * Facial proportion analysis on top of the 68-point landmark model.
 *
 * Landmark index reference (image-left / image-right):
 *   0-16 jaw contour (8 = chin)      17-21 / 22-26 eyebrows
 *   27-30 nose bridge (30 = tip)     31-35 nostrils (33 = subnasale)
 *   36-41 / 42-47 eyes (36,45 outer corners; 39,42 inner corners)
 *   48-67 mouth (48,54 corners; 51 upper-lip top; 57 lower-lip bottom;
 *                62 upper-lip inner; 66 lower-lip inner)
 *
 * Every measurement is a ratio or an angle, so the result does not depend on
 * photo resolution or distance from the camera. "Ideal" values come from
 * commonly cited aesthetic-proportion literature (neoclassical canons, rule of
 * fifths/thirds, averageness studies). They describe population averages, not
 * a requirement — the UI says so explicitly.
 */
(function (global) {
  'use strict';

  const MIRROR_PAIRS = [
    [0, 16], [1, 15], [2, 14], [3, 13], [4, 12], [5, 11], [6, 10], [7, 9],
    [17, 26], [18, 25], [19, 24], [20, 23], [21, 22],
    [36, 45], [37, 44], [38, 43], [39, 42], [40, 47], [41, 46],
    [31, 35], [32, 34],
    [48, 54], [49, 53], [50, 52], [59, 55], [58, 56],
    [60, 64], [61, 63], [67, 65],
  ];

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const centroid = (pts) => ({ x: mean(pts.map((p) => p.x)), y: mean(pts.map((p) => p.y)) });
  const deg = (rad) => (rad * 180) / Math.PI;

  /** Gentle bell curve: 10 at the ideal, ~6.2 one tolerance away, never below 2. */
  function scoreFor(value, ideal, tolerance) {
    const z = (value - ideal) / tolerance;
    return 2 + 8 * Math.exp(-0.5 * z * z);
  }

  /** Angle (degrees) between two direction vectors. */
  function angleBetween(v1, v2) {
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    return deg(Math.acos(Math.max(-1, Math.min(1, dot / m))));
  }

  /** Rotate the landmarks so the line between the eye centres is horizontal. */
  function levelLandmarks(points) {
    const le = centroid(points.slice(36, 42));
    const re = centroid(points.slice(42, 48));
    const roll = Math.atan2(re.y - le.y, re.x - le.x);
    const c = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
    const cos = Math.cos(-roll);
    const sin = Math.sin(-roll);
    const out = points.map((p) => {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
    });
    return { points: out, rollDeg: deg(roll) };
  }

  function measure(raw) {
    const { points: p, rollDeg } = levelLandmarks(raw);
    const faceWidth = p[16].x - p[0].x;
    const browY = mean([17, 18, 19, 20, 21, 22, 23, 24, 25, 26].map((i) => p[i].y));
    const glabellaY = (p[21].y + p[22].y) / 2;

    // Pose / expression sanity checks
    const noseToLeft = dist(p[30], p[0]);
    const noseToRight = dist(p[30], p[16]);
    const yaw = (noseToLeft - noseToRight) / (noseToLeft + noseToRight);
    const lipGap = p[66].y - p[62].y;
    const mouthOpen = lipGap / (p[57].y - p[51].y);

    // Symmetry
    const midX = mean(MIRROR_PAIRS.map(([a, b]) => (p[a].x + p[b].x) / 2));
    const asym = mean(
      MIRROR_PAIRS.map(([a, b]) => {
        const dl = midX - p[a].x;
        const dr = p[b].x - midX;
        return Math.abs(dl - dr) + Math.abs(p[a].y - p[b].y);
      })
    ) / faceWidth;

    // Facial thirds (middle vs lower; the hairline isn't a landmark)
    const middleThird = p[33].y - glabellaY;
    const lowerThird = p[8].y - p[33].y;

    // Eyes
    const eyeWidthL = p[39].x - p[36].x;
    const eyeWidthR = p[45].x - p[42].x;
    const eyeWidth = (eyeWidthL + eyeWidthR) / 2;
    const intercanthal = p[42].x - p[39].x;
    const tiltL = deg(Math.atan2(p[39].y - p[36].y, p[39].x - p[36].x));
    const tiltR = deg(Math.atan2(p[42].y - p[45].y, p[45].x - p[42].x));
    const eyeOpenL = (dist(p[37], p[41]) + dist(p[38], p[40])) / 2 / eyeWidthL;
    const eyeOpenR = (dist(p[43], p[47]) + dist(p[44], p[46])) / 2 / eyeWidthR;

    // Brows
    const browEyeGap = mean([
      p[37].y - p[19].y, p[38].y - p[20].y, p[43].y - p[23].y, p[44].y - p[24].y,
    ]) / eyeWidth;

    // Nose, mouth, lips
    const noseWidth = p[35].x - p[31].x;
    const mouthWidth = p[54].x - p[48].x;
    const upperLip = p[62].y - p[51].y;
    const lowerLip = p[57].y - p[66].y;
    const philtrum = p[51].y - p[33].y;
    const chinHeight = p[8].y - p[57].y;

    // Jaw
    const jawAngleL = 180 - angleBetween(
      { x: p[3].x - p[0].x, y: p[3].y - p[0].y },
      { x: p[8].x - p[5].x, y: p[8].y - p[5].y }
    );
    const jawAngleR = 180 - angleBetween(
      { x: p[13].x - p[16].x, y: p[13].y - p[16].y },
      { x: p[8].x - p[11].x, y: p[8].y - p[11].y }
    );
    const jawWidth = p[12].x - p[4].x;
    const chinWidth = p[10].x - p[6].x;

    // Facial adiposity proxies (Coetzee et al. 2009): cheek-to-jaw width and the
    // jaw contour's perimeter relative to its area (rounder, fuller faces → lower).
    const cheekJaw = (p[15].x - p[1].x) / (p[11].x - p[5].x);
    let perim = 0;
    let area = 0;
    for (let i = 0; i <= 16; i++) {
      const a = p[i];
      const b = p[i === 16 ? 0 : i + 1];
      perim += dist(a, b);
      area += a.x * b.y - b.x * a.y;
    }
    const jawPerimArea = perim / Math.sqrt(Math.abs(area) / 2);

    // Face shape inputs. Forehead height is estimated as half the
    // brow-to-chin distance (equal thirds), since the hairline isn't tracked.
    const browToChin = p[8].y - glabellaY;
    const faceLength = browToChin * 1.5;

    return {
      leveled: p,
      rollDeg,
      yaw,
      mouthOpen,
      asym,
      thirdsRatio: lowerThird / middleThird,
      eyeSpacing: intercanthal / eyeWidth,
      canthalTilt: (tiltL + tiltR) / 2,
      eyeOpenness: (eyeOpenL + eyeOpenR) / 2,
      browEyeGap,
      fwhr: faceWidth / (p[51].y - browY),
      noseRatio: noseWidth / intercanthal,
      mouthNose: mouthWidth / noseWidth,
      lipRatio: lowerLip / Math.max(upperLip, 1e-6),
      chinPhiltrum: chinHeight / Math.max(philtrum, 1e-6),
      jawAngle: (jawAngleL + jawAngleR) / 2,
      jawRatio: jawWidth / faceWidth,
      chinRatio: chinWidth / faceWidth,
      lengthRatio: faceLength / faceWidth,
      cheekJaw,
      jawPerimArea,
    };
  }

  // Cut-offs are percentiles of the 2,750 reference men (68-point jaw contours
  // are smooth, so textbook ratios don't separate shapes well):
  // length ratio p20 = 1.25, p85 = 1.38; jaw ratio p15 = 0.782, p50 = 0.796,
  // p60 = 0.799, p85 = 0.81.
  function classifyFaceShape(m) {
    const { lengthRatio: L, jawRatio: J } = m;
    if (L >= 1.38) return J >= 0.799 ? 'rectangle' : 'oblong';
    if (L <= 1.25) return J >= 0.8 ? 'square' : 'round';
    if (J >= 0.81) return 'square';
    if (J <= 0.782) return 'heart';
    return 'oval';
  }

  /*
   * Displayed parameters. Scores come from js/calibration.js, learned from
   * 2,750 rated male faces (see tools/calibrate): each parameter's score is
   * where your value sits on the fitted rating curve, from 1 (lowest-rated
   * end) to 10 (highest-rated end). `impact` says how much that parameter
   * moved ratings in the data.
   */
  const fixed = (n) => (v) => v.toFixed(n);
  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  const METRICS = [
    // --- Face structure
    { key: 'shapeScore', cat: 'structure', label: 'Shape match', fmt: (v) => `${v.toFixed(2)} / 5`,
      desc: 'How closely your overall landmark geometry matches the face shapes that were rated highest, learned from all 68 points at once. The single strongest predictor in the data.' },
    { key: 'jawAngle', cat: 'structure', label: 'Jaw taper', fmt: (v) => `${v.toFixed(0)}°`,
      desc: 'How the jaw tapers from the ears to the chin, seen from the front. A leaner, more tapered lower face was rated higher; a wide, heavy lower face lower.' },
    { key: 'canthalTilt', cat: 'structure', label: 'Eye tilt', fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`,
      desc: 'Angle from the inner to the outer eye corner. An upward (positive) tilt was rated clearly higher.' },
    { key: 'browEyeGap', cat: 'structure', label: 'Brow position', fmt: (v) => `${v.toFixed(2)}× eye width`,
      desc: 'Distance from eyebrows to eyes. Lower-set brows that sit close to the eyes (a classic masculine trait) were rated higher.' },
    { key: 'eyeOpenness', cat: 'structure', label: 'Eye size', fmt: fixed(2),
      desc: 'Eye height relative to eye width. More open, less hooded or puffy eyes were rated higher.' },
    { key: 'eyeSpacing', cat: 'structure', label: 'Eye spacing', fmt: (v) => `${v.toFixed(2)}× eye width`,
      desc: 'Gap between the inner eye corners relative to eye width. Wider eyes relative to the gap were rated higher.' },
    { key: 'lipRatio', cat: 'structure', label: 'Lip balance', fmt: (v) => `1 : ${v.toFixed(2)}`,
      desc: 'Upper-lip to lower-lip height. A fuller lower lip relative to the upper was rated higher.' },
    { key: 'jawRatio', cat: 'structure', label: 'Lower-face width', fmt: pct,
      desc: 'Jaw width at mouth level as a share of face width. Narrower lower faces were rated higher in this data.' },
    { key: 'fwhr', cat: 'structure', label: 'Width-to-height', fmt: fixed(2),
      desc: 'Face width divided by upper-face height (brows → upper lip). Ratings peaked at a moderate value.' },
    { key: 'cheekJaw', cat: 'structure', label: 'Facial leanness', fmt: fixed(2),
      desc: 'Cheekbone width relative to jaw width — a standard marker of facial fat. Leaner faces (higher values) were rated higher.' },
    { key: 'thirdsRatio', cat: 'structure', label: 'Facial thirds', fmt: (v) => `${v.toFixed(2)} : 1`,
      desc: 'Lower face (nose → chin) compared to mid face (brows → nose).' },
    { key: 'noseRatio', cat: 'structure', label: 'Nose width', fmt: (v) => `${v.toFixed(2)}× eye gap`,
      desc: 'Nostril width compared to the gap between the eyes. Ratings peaked at a moderate width.' },
    { key: 'chinPhiltrum', cat: 'structure', label: 'Chin height', fmt: (v) => `${v.toFixed(2)}× philtrum`,
      desc: 'Chin height (lower lip → chin) relative to the philtrum (nose → upper lip). Ratings peaked at a balanced value.' },
    { key: 'mouthNose', cat: 'structure', label: 'Mouth width', fmt: (v) => `${v.toFixed(2)}× nose`,
      desc: 'Mouth width relative to nose width. Smiling widens the mouth, so use a neutral expression.' },
    { key: 'asym', cat: 'structure', label: 'Symmetry', fmt: (v) => `${Math.max(0, 100 - v * 400).toFixed(0)}%`, literature: true,
      desc: 'How closely the left and right halves mirror each other. In the photo data this is dominated by head angle, so it is scored from published research instead and does not count toward your score.' },

    // --- Skin & features (pixel-based)
    { key: 'eyeContrast', cat: 'features', label: 'Eye-area definition', fmt: pct,
      desc: 'How much darker the eyes, lashes and eye sockets are than the surrounding skin. Deep-set, well-defined eyes were rated much higher.' },
    { key: 'browContrast', cat: 'features', label: 'Brow density', fmt: pct,
      desc: 'How dark and dense your eyebrows are compared to your forehead. Fuller, darker brows were rated higher.' },
    { key: 'skinRedness', cat: 'features', label: 'Skin redness', fmt: fixed(1), color: true,
      desc: 'Average redness of the cheek and forehead skin. Calmer, less red skin was rated higher.' },
    { key: 'lipContrast', cat: 'features', label: 'Lip colour', fmt: fixed(1), color: true,
      desc: 'How much redder your lips are than your skin. Healthy lip colour was rated slightly higher.' },

    // --- Photo quality (not part of the face score)
    { key: 'brightness', cat: 'photo', label: 'Exposure', fmt: fixed(0),
      desc: 'Brightness of your skin in the photo. Well-lit photos were rated higher.' },
    { key: 'lightBalance', cat: 'photo', label: 'Light direction', fmt: pct,
      desc: 'Difference in light between the two sides of the face. Soft light from one side (like a window at 45°) sculpts the face; flat, frontal flash looks worse.' },
    { key: 'sharpness', cat: 'photo', label: 'Sharpness', fmt: fixed(1),
      desc: 'Fine detail in the photo. Blurry, low-resolution or heavily filtered photos were rated lower.' },
  ];

  const impactOf = (effect) => (effect >= 0.9 ? 'high' : effect >= 0.45 ? 'medium' : 'low');

  /** Mirrors curve_values() in tools/calibrate/analyze.py. */
  function curveAt(stat, value) {
    const v = value == null || Number.isNaN(value) ? stat.mean : Math.min(stat.clip[1], Math.max(stat.clip[0], value));
    const z = Math.max(-2.5, Math.min(2.5, (v - stat.mean) / stat.sd));
    return stat.curve[0] + stat.curve[1] * z + stat.curve[2] * z * z;
  }

  function idealText(stat, fmt) {
    if (stat.kind === 'peak') return `Best around ${fmt(stat.ideal)}`;
    const top = fmt(stat.top[1]);
    return stat.kind === 'up' ? `Higher is better · top men ≈ ${top}` : `Lower is better · top men ≈ ${top}`;
  }

  /** Which side of the ideal a weak value sits on — the recommendation engine keys off this. */
  function bandOf(stat, value, score) {
    if (score >= 5.5) return 'ideal';
    if (stat.kind === 'up') return 'low';
    if (stat.kind === 'down') return 'high';
    return value < stat.ideal ? 'low' : 'high';
  }

  function shapeModels(leveled) {
    const S = global.FaceCalibration.shape;
    const le = centroid(leveled.slice(36, 42));
    const re = centroid(leveled.slice(42, 48));
    const mid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
    const ipd = dist(le, re);
    const v = [];
    for (const p of leveled) v.push((p.x - mid.x) / ipd, (p.y - mid.y) / ipd);
    const P = S.pcs.map((pc) => pc.reduce((acc, w, i) => acc + w * (v[i] - S.mean[i]), 0));
    const dot = (a, b) => a.reduce((acc, x, i) => acc + x * b[i], 0);
    return {
      shapeScore: dot(P, S.attract) + S.attractBias,
      masculinity: (dot(P, S.lda) - S.ldaMean) / S.ldaSd,
    };
  }

  function percentileOf(pred) {
    const t = global.FaceCalibration.model.percentiles;
    if (pred <= t[0]) return 0;
    if (pred >= t[100]) return 100;
    let i = 0;
    while (t[i + 1] < pred) i++;
    return i + (pred - t[i]) / (t[i + 1] - t[i] || 1);
  }

  /**
   * Overall prediction: bias + sum of non-negative weights x each parameter's
   * curve, so a better parameter score can only raise the overall score.
   */
  function predict(values, photoOverride) {
    const C = global.FaceCalibration;
    const M = C.model;
    let y = M.bias;
    M.features.forEach((k, i) => {
      const st = C.features[k];
      const v = photoOverride && M.photo.includes(k) ? photoOverride(st) : values[k];
      y += M.weights[i] * (curveAt(st, v) - M.gMean[i]);
    });
    return y;
  }

  /**
   * @param rawPoints   68 landmarks in image coordinates
   * @param pixel       output of FaceFeatures.extract (optional)
   * @param expressions face-api expression probabilities (optional)
   */
  function analyze(rawPoints, pixel, expressions) {
    const C = global.FaceCalibration;
    const m = measure(rawPoints);
    const values = { ...m, ...(pixel || {}), ...shapeModels(m.leveled) };
    values.absYaw = Math.abs(m.yaw);
    values.absRoll = Math.abs(m.rollDeg);
    if (expressions) {
      values.happy = expressions.happy;
      values.negative = expressions.sad + expressions.angry + expressions.disgusted + expressions.fearful;
    }

    const metrics = [];
    for (const def of METRICS) {
      const value = values[def.key];
      if (value == null || Number.isNaN(value)) continue;
      const stat = C.features[def.key];
      let score;
      let ideal;
      let impact;
      if (def.literature) {
        score = value <= 0.02 ? 10 : scoreFor(value, 0.02, 0.03);
        ideal = '≥ 90% (research-based)';
        impact = 'not scored';
      } else {
        score = 1 + (9 * (curveAt(stat, value) - stat.lo)) / (stat.hi - stat.lo || 1);
        ideal = idealText(stat, def.fmt);
        impact = impactOf(stat.effect);
      }
      metrics.push({
        id: def.key, cat: def.cat, label: def.label, desc: def.desc,
        value, display: def.fmt(value), idealText: ideal, impact,
        score: Math.round(score * 10) / 10,
        band: def.literature ? (value > 0.05 ? 'low' : 'ideal') : bandOf(stat, value, score),
      });
    }

    // Face score: the photo-quality inputs are held at the dataset median, so the
    // same face scores the same in a good or bad photo. "As photographed" uses the
    // real photo inputs; "best photo" uses the top-rated men's photo quality.
    const facePred = predict(values, (st) => st.all[1]);
    const photoPred = predict(values);
    const bestPhotoPred = predict(values, (st) => st.top[1]);
    const facePct = percentileOf(facePred);
    const toTen = (p) => Math.round((1 + (9 * p) / 100) * 10) / 10;

    // Informational readings (no score)
    const info = [];
    const masc = values.masculinity;
    info.push({
      label: 'Masculinity of face shape',
      value: masc > 0.75 ? 'Very masculine' : masc > 0.25 ? 'Masculine' : masc > -0.25 ? 'Average for men' : masc > -0.75 ? 'Softer' : 'Much softer',
      note: 'Compared with the men in the reference set. Interestingly, it had no measurable effect on ratings.',
    });
    if (pixel) {
      const bs = C.features.beardShadow;
      const bt = C.features.beardTexture;
      const zb = (pixel.beardShadow - bs.mean) / bs.sd + (pixel.beardTexture - bt.mean) / bt.sd;
      info.push({
        label: 'Facial hair (estimated)',
        value: zb > 2 ? 'Beard or heavy stubble' : zb > 0.8 ? 'Light stubble' : 'Clean-shaven / very light',
        note: 'Estimated from shading and texture around the mouth and chin.',
      });
      values.facialHairLevel = zb;
    }
    if (expressions) {
      const top = Object.entries(expressions).sort((a, b) => b[1] - a[1])[0][0];
      info.push({
        label: 'Expression',
        value: top === 'happy' ? 'Smiling' : top === 'neutral' ? 'Neutral' : top[0].toUpperCase() + top.slice(1),
        note: 'For men a calm, confident neutral expression rated as well as or better than a big smile in this data.',
      });
    }

    const warnings = [];
    if (Math.abs(m.yaw) > 0.12) warnings.push('Your head is turned to one side — several readings will be off. Face the camera straight on for best accuracy.');
    if (Math.abs(m.rollDeg) > 12) warnings.push('Your head is tilted. It was auto-corrected, but a level photo is more accurate.');
    if (m.mouthOpen > 0.25) warnings.push('Your mouth is open or you are smiling — lip and mouth readings work best with a relaxed, closed-mouth expression.');
    if (pixel && !pixel.isColour) warnings.push('Black-and-white photo — skin and lip colour can\'t be measured.');
    if (pixel && !pixel.foreheadVisible) warnings.push('Your forehead seems covered by hair — skin readings use only the cheeks.');

    return {
      overall: toTen(facePct),
      percentile: Math.round(facePct),
      asPhotographed: toTen(percentileOf(photoPred)),
      withBestPhoto: toTen(percentileOf(bestPhotoPred)),
      metrics,
      info,
      faceShape: classifyFaceShape(m),
      raw: m,
      values,
      warnings,
    };
  }

  global.FaceAnalysis = { analyze, measure, classifyFaceShape, METRICS };
})(typeof window !== 'undefined' ? window : globalThis);
