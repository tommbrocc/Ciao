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
    };
  }

  function classifyFaceShape(m) {
    const { lengthRatio: L, jawRatio: J, chinRatio: C } = m;
    if (L >= 1.47) return J >= 0.8 ? 'rectangle' : 'oblong';
    if (J >= 0.81) return L >= 1.4 ? 'rectangle' : 'square';
    if (J < 0.75 && C < 0.46) return 'heart';
    if (L < 1.25) return 'round';
    return 'oval';
  }

  /*
   * Metric definitions. `band` returns 'low' | 'ideal' | 'high', which the
   * recommendation engine keys off.
   */
  const METRICS = [
    {
      id: 'symmetry', label: 'Symmetry', key: 'asym', ideal: 0.02, tol: 0.03,
      fmt: (v) => `${Math.max(0, 100 - v * 400).toFixed(0)}%`,
      idealText: '≥ 90%',
      desc: 'How closely the left and right halves mirror each other. Everyone is a bit asymmetric; the head angle in the photo also affects this.',
      band: (v) => (v > 0.05 ? 'low' : 'ideal'),
      oneSided: true,
    },
    {
      id: 'thirds', label: 'Facial thirds', key: 'thirdsRatio', ideal: 0.92, tol: 0.14,
      fmt: (v) => `${v.toFixed(2)} : 1`, idealText: '0.85 – 1.0 : 1',
      desc: 'Lower face (nose base → chin) compared to mid face (brows → nose base). Balanced faces have roughly equal thirds.',
      band: (v) => (v < 0.8 ? 'low' : v > 1.05 ? 'high' : 'ideal'),
    },
    {
      id: 'eyeSpacing', label: 'Eye spacing', key: 'eyeSpacing', ideal: 1.55, tol: 0.15,
      fmt: (v) => `${v.toFixed(2)}× eye width`, idealText: '1.45 – 1.65×',
      desc: 'Gap between the inner eye corners relative to the width of one eye (the "rule of fifths"). Detected corners sit just inside the visible ones, so balanced eyes read ≈ 1.55 here.',
      band: (v) => (v < 1.4 ? 'low' : v > 1.72 ? 'high' : 'ideal'),
    },
    {
      id: 'canthalTilt', label: 'Canthal tilt', key: 'canthalTilt', ideal: 5, tol: 5,
      fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`, idealText: '+3° to +8°',
      desc: 'Angle from the inner to the outer eye corner. A slight upward tilt reads as alert and youthful.',
      band: (v) => (v < 1 ? 'low' : v > 10 ? 'high' : 'ideal'),
    },
    {
      id: 'fwhr', label: 'Width-to-height', key: 'fwhr', ideal: 1.75, tol: 0.2,
      fmt: (v) => v.toFixed(2), idealText: '1.6 – 1.9',
      desc: 'Face width divided by upper-face height (brows → upper lip). Captures how broad vs. long the mid face looks.',
      band: (v) => (v < 1.55 ? 'low' : v > 1.95 ? 'high' : 'ideal'),
    },
    {
      id: 'nose', label: 'Nose width', key: 'noseRatio', ideal: 0.63, tol: 0.1,
      fmt: (v) => `${v.toFixed(2)}× eye gap`, idealText: '0.55 – 0.7×',
      desc: 'Nostril width compared to the gap between the eyes. Classical canons put the full nose width roughly equal to the eye gap; the nostril points measured here read ≈ 0.63 for that.',
      band: (v) => (v < 0.5 ? 'low' : v > 0.76 ? 'high' : 'ideal'),
    },
    {
      id: 'mouth', label: 'Mouth width', key: 'mouthNose', ideal: 2.2, tol: 0.3,
      fmt: (v) => `${v.toFixed(2)}× nose`, idealText: '2.0 – 2.4×',
      desc: 'Mouth width relative to nose width. Smiling widens the mouth, so use a neutral expression.',
      band: (v) => (v < 1.85 ? 'low' : v > 2.6 ? 'high' : 'ideal'),
    },
    {
      id: 'lips', label: 'Lip balance', key: 'lipRatio', ideal: 1.6, tol: 0.5,
      fmt: (v) => `1 : ${v.toFixed(2)}`, idealText: '1 : 1.6',
      desc: 'Upper-lip height vs. lower-lip height. A slightly fuller lower lip is the most common aesthetic ideal.',
      band: (v) => (v < 1.15 ? 'low' : v > 2.2 ? 'high' : 'ideal'),
    },
    {
      id: 'chin', label: 'Chin & philtrum', key: 'chinPhiltrum', ideal: 2.0, tol: 0.45,
      fmt: (v) => `${v.toFixed(2)}× philtrum`, idealText: '≈ 2× philtrum',
      desc: 'Chin height (lower lip → chin) compared to the philtrum (nose → upper lip). Indicates chin projection and lower-face balance.',
      band: (v) => (v < 1.6 ? 'low' : v > 2.6 ? 'high' : 'ideal'),
    },
    {
      id: 'jaw', label: 'Jaw definition', key: 'jawAngle', ideal: 127, tol: 10,
      fmt: (v) => `${v.toFixed(0)}°`, idealText: '118° – 134°',
      desc: 'Approximate jaw angle from the front. Lower values mean a sharper, more angular jaw; higher values a softer, rounder one.',
      band: (v) => (v < 115 ? 'high' : v > 138 ? 'low' : 'ideal'),
    },
  ];

  function analyze(rawPoints) {
    const m = measure(rawPoints);
    const metrics = METRICS.map((def) => {
      const value = m[def.key];
      let score = scoreFor(value, def.ideal, def.tol);
      if (def.oneSided && value < def.ideal) score = 10;
      return {
        id: def.id, label: def.label, desc: def.desc,
        value, display: def.fmt(value), idealText: def.idealText,
        score: Math.round(score * 10) / 10,
        band: def.band(value),
      };
    });

    // Symmetry and thirds carry the most weight in perceived harmony studies.
    const weights = { symmetry: 2, thirds: 1.5, eyeSpacing: 1.2, jaw: 1.2 };
    let total = 0;
    let wsum = 0;
    for (const x of metrics) {
      const w = weights[x.id] || 1;
      total += x.score * w;
      wsum += w;
    }

    const warnings = [];
    if (Math.abs(m.yaw) > 0.12) warnings.push('Your head is turned to one side — symmetry and width readings will be off. Face the camera straight on for best accuracy.');
    if (Math.abs(m.rollDeg) > 12) warnings.push('Your head is tilted. It was auto-corrected, but a level photo is more accurate.');
    if (m.mouthOpen > 0.25) warnings.push('Your mouth is open or you are smiling — lip and mouth readings work best with a relaxed, closed-mouth expression.');

    return {
      overall: Math.round((total / wsum) * 10) / 10,
      metrics,
      faceShape: classifyFaceShape(m),
      raw: m,
      warnings,
    };
  }

  global.FaceAnalysis = { analyze, measure, classifyFaceShape, METRICS };
})(typeof window !== 'undefined' ? window : globalThis);
