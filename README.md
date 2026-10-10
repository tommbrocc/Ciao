# FaceFit — men's facial analysis & style advisor

A static web app for men that analyses a face photo and gives:

- **A face score (1–10) and percentile**, learned from 2,750 real male faces that were each rated by 60 people (see *How the scoring works*). It also shows how the photo itself changes the result: "as photographed" and "with a studio-quality photo".
- **22 scored parameters** in three groups. Each has a 1–10 score, your value, what the top-rated men look like, and an impact badge showing how much it mattered for ratings.
  - **Face structure:** shape match to top-rated faces, jaw taper, eye tilt, brow position, eye size, eye spacing, lip balance, lower-face width, width-to-height, facial leanness, facial thirds, nose width, chin height, mouth width, symmetry.
  - **Skin & features** (from colour and shading): eye-area definition, brow density, skin redness, lip colour.
  - **Photo quality** (not part of the face score): exposure, light direction, sharpness.
- **Other readings:** masculinity of face shape, facial hair, and expression.
- **Face shape detection** (oval, round, square, rectangle, oblong, heart).
- **Styles that could suit you**: haircuts, beard styles and glasses frames for your face shape, plus what to avoid. The advice adapts to whether you can grow a full beard, it grows patchy or you prefer clean-shaven, and to whether your hair is thick or thinning.
- **What you could work on**: specific tips for each weak parameter, ordered by impact (e.g. brow grooming for high-set brows, beard shaping for a heavy lower face, skincare for redness), plus photo tips and thinning-hair advice when relevant.
- **General grooming tips** (skin, beard care, haircut routine, brows, training, sleep, posture).

Photos are processed **entirely in the browser** using [face-api](https://github.com/vladmandic/face-api) (68-point facial landmarks). Nothing is uploaded anywhere.

## Run it

The models are loaded with `fetch`, so the folder has to be served over HTTP (opening `index.html` directly with `file://` won't work):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

You can also deploy it as-is to any static host, such as GitHub Pages (Settings → Pages → deploy from branch), Netlify or Vercel.

## Project layout

```
index.html                 page markup
css/style.css              styles (light & dark mode, mobile friendly)
js/analysis.js             landmark geometry, shape models, scoring
js/features.js             pixel features: skin, eye area, brows, lips, facial hair, photo quality
js/calibration.js          generated scoring data (curves, shape models, weights)
js/recommendations.js      face shape + weak parameters → style suggestions & tips
js/backend.js              picks WebGL → WebAssembly → CPU for TensorFlow.js
js/app.js                  upload/camera handling, detection, drawing, rendering
tools/calibrate/           scripts that produce js/calibration.js, plus REPORT.md
vendor/face-api/           face-api.js (MIT) + detector, 68-landmark and expression models
vendor/tfjs-wasm/          TensorFlow.js WebAssembly binaries (Apache-2.0)
```

## How the scoring works

The scoring is learned from **[SCUT-FBP5500](https://github.com/HCIILAB/SCUT-FBP5500-Database-Release)** (Liang et al., ICPR 2018). It contains 2,750 male face photos (2,000 East Asian, 750 white), each rated 1–5 by 60 volunteers in China. The app's own pipeline was run on every photo, then:

1. **Per-parameter curves.** Each measurement is fitted against the ratings, either "higher is better", "lower is better" or "best at a specific value", with the effect of photo quality (lighting, sharpness, head angle) regressed out. Your score for a parameter is where your value sits on that curve, from 1 (the lowest-rated end) to 10 (the highest-rated end).
2. **Shape models** on all 68 landmarks:
   - *Shape match*, a regression of ratings on face-shape components (cross-validated r = 0.64).
   - *Masculinity*, an axis separating male from female face shapes (it turned out not to predict ratings).
3. **Overall score.** A weighted sum of the parameter curves, with weights constrained to be ≥ 0 so a better parameter score can never lower the overall score. In 5-fold cross-validation it predicts ratings of unseen men with **r = 0.72**. The face score holds the photo-quality inputs at the dataset median, so the same face scores the same in a good or bad photo. It's shown as a percentile among the 2,750 men, mapped to 1–10.

`tools/calibrate/REPORT.md` has every correlation, both overall and separately for Asian and white men. Some findings surprised me: low-set brows, deep-set and well-defined eyes, an upward eye tilt, a fuller lower lip and a lean, tapered lower face mattered most, while masculinity of shape and smiling did not.

**Limitations of the data:** the raters were all in China, most faces are East Asian, and many top-rated photos are professional headshots. Men of other ethnicities are under-represented, so results for them are less reliable. Symmetry is scored from published research instead, because in these photos it mostly reflected head angle.

### Re-running the calibration

The dataset is licensed for non-commercial research and is **not** included in this repo; only the derived statistics in `js/calibration.js` are. To regenerate them:

```bash
# 1. Get the images + ratings (e.g. the GitHub mirror brunoalano/fastai-scut-fbp5500)
git clone --depth 1 https://github.com/brunoalano/fastai-scut-fbp5500 ../scut

# 2. Run the app's detection + feature pipeline on every photo (headless Chromium, ~12 min)
npm install playwright   # or point PLAYWRIGHT=/path/to/playwright
node tools/calibrate/extract.js ../scut /tmp/scut.jsonl 3

# 3. Recompute geometry with the current js/analysis.js, then fit the models
node tools/calibrate/remeasure.js /tmp/scut.jsonl /tmp/measured.jsonl
python3 tools/calibrate/analyze.py /tmp/measured.jsonl js/calibration.js tools/calibrate/REPORT.md
```

To change the advice, edit `FACE_SHAPES`, `METRIC_TIPS` and `PHOTO_TIPS` in `js/recommendations.js`.

## Licensing note

The scoring data is derived from SCUT-FBP5500, which its authors released for **non-commercial research use**. Check that before using this app commercially. face-api is MIT-licensed and TensorFlow.js is Apache-2.0.
