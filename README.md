# FaceFit — men's facial analysis & style advisor

A static web app for men that analyses a face photo and gives:

- **A harmony score** built from 10 proportion measurements: symmetry, facial thirds, eye spacing, canthal tilt, width-to-height ratio, nose width, mouth width, lip balance, chin/philtrum ratio and jaw definition. Each one gets its own 0–10 score, your value, and the typical range.
- **Face shape detection** (oval, round, square, rectangle, oblong, heart).
- **Styles that could suit you**: haircuts, beard styles and glasses frames for your face shape, plus what to avoid. The advice adapts to whether you can grow a full beard, it grows patchy or you prefer clean-shaven, and to whether your hair is thick or thinning.
- **What you could work on**: specific tips for each measurement outside the typical range (e.g. a goatee for a short chin, a boxed beard with a sharp neckline to define a soft jaw), plus thinning-hair advice when relevant.
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
index.html              page markup
css/style.css           styles (light & dark mode, mobile friendly)
js/analysis.js          landmark geometry → measurements, scores, face shape
js/recommendations.js   face shape + measurements → style suggestions & tips
js/app.js               upload/camera handling, detection, drawing, rendering
vendor/face-api/        face-api.js (MIT) + SSD MobileNet & 68-landmark models
```

The ideal ranges are tuned for adult male faces. To adjust what counts as "ideal", edit the `METRICS` table in `js/analysis.js`. Each entry has an `ideal`, a `tol` (tolerance) and `band` cut-offs. To change the advice, edit `FACE_SHAPES` and `METRIC_TIPS` in `js/recommendations.js`.

## Limitations

The scores are an approximation. They compare geometry from 68 landmarks with commonly cited aesthetic averages. Head angle, lens distortion, lighting and expression all affect the numbers, and the app warns when it detects a turned or tilted head or an open mouth. The hairline isn't a landmark, so the forehead third and face length are estimated. Treat the results as a fun guide, not a verdict.
