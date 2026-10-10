#!/usr/bin/env python3
"""
Learn the app's scoring from the SCUT-FBP5500 ratings.

    python3 tools/calibrate/analyze.py measured.jsonl js/calibration.js report.md

Input rows come from extract.js (+ remeasure.js). Only aggregate statistics and
model weights are written out; no images or per-person data.

What it produces
  * per-feature curves: rating ~ a + b*z + c*z^2 for men (z = standardised value),
    used to turn each measurement into a 0-10 score
  * shape models on the 68 normalised landmarks:
      - masculinity: LDA axis separating male from female face shapes
      - shape attractiveness: ridge regression of male ratings on shape PCs
  * an additive overall model (non-negative weights on the per-feature curves)
    predicting the male rating, validated with 5-fold cross-validation, plus
    the distribution of its predictions so the app can report a percentile.
"""
import json
import sys

import numpy as np

RNG = np.random.default_rng(0)

GEOM = ['asym', 'thirdsRatio', 'eyeSpacing', 'canthalTilt', 'eyeOpenness', 'browEyeGap', 'fwhr',
        'noseRatio', 'mouthNose', 'lipRatio', 'chinPhiltrum', 'jawAngle', 'jawRatio', 'chinRatio',
        'lengthRatio', 'cheekJaw', 'jawPerimArea']
APPEAR = ['skinTexture', 'skinBlotch', 'skinRednessVar', 'skinRedness', 'underEye', 'eyeContrast',
          'browContrast', 'lipContrast', 'beardShadow', 'beardTexture']
PHOTO = ['brightness', 'lightBalance', 'sharpness', 'absYaw', 'absRoll']
EXPR = ['happy', 'negative']
SHAPE = ['masculinity', 'shapeScore']
N_PCS = 20


def load(path):
    rows = []
    for line in open(path):
        d = json.loads(line)
        if not d.get('landmarks'):
            continue
        f = dict(d['measures'])
        f.update({k: (np.nan if v is None else v) for k, v in d['features'].items() if not isinstance(v, bool)})
        f['absYaw'] = abs(f['yaw'])
        f['absRoll'] = abs(f['rollDeg'])
        e = d['expressions']
        f['happy'] = e['happy']
        f['negative'] = e['sad'] + e['angry'] + e['disgusted'] + e['fearful']
        rows.append({'file': d['file'], 'group': d['file'][:2], 'rating': d['rating'],
                     'leveled': np.array(d['leveled']), 'f': f})
    return rows


def shape_vector(lv):
    """Landmarks centred on the eye midpoint and scaled to inter-pupil distance = 1."""
    le = lv[36:42].mean(0)
    re = lv[42:48].mean(0)
    mid = (le + re) / 2
    ipd = np.linalg.norm(re - le)
    return ((lv - mid) / ipd).ravel()


def ridge(X, y, lam):
    Xm = X.mean(0)
    ym = y.mean()
    Xc = X - Xm
    w = np.linalg.solve(Xc.T @ Xc + lam * np.eye(X.shape[1]), Xc.T @ (y - ym))
    return w, ym - Xm @ w


def cv_r(X, y, lam, k=5):
    idx = RNG.permutation(len(y))
    pred = np.empty(len(y))
    for i in range(k):
        te = idx[i::k]
        tr = np.setdiff1d(idx, te)
        w, b = ridge(X[tr], y[tr], lam)
        pred[te] = X[te] @ w + b
    return np.corrcoef(pred, y)[0, 1], pred


def best_lambda(X, y):
    best = None
    for lam in [0.1, 1, 3, 10, 30, 100, 300, 1000]:
        r, _ = cv_r(X, y, lam)
        if best is None or r > best[1]:
            best = (lam, r)
    return best


def photo_free(F, y, feats, idx):
    """Ratings with the effect of photo quality regressed out (rows idx)."""
    ph = F[idx][:, [feats.index(k) for k in PHOTO]]
    ph = (ph - ph.mean(0)) / ph.std(0)
    Ph = np.c_[np.ones(len(idx)), ph, ph * ph]
    return y[idx] - Ph @ np.linalg.lstsq(Ph, y[idx], rcond=None)[0] + y[idx].mean()


def fit_curves(F, y, feats, idx):
    """Per feature: rating ~ a + b*z (+ c*z^2 when there is a clear optimum)."""
    y_pf = photo_free(F, y, feats, idx)
    out = {}
    for j, k in enumerate(feats):
        x = F[idx, j]
        ok = ~np.isnan(x)
        lo, hi = np.nanpercentile(x, [1, 99])
        xc = np.clip(x[ok], lo, hi)
        mean, sd = xc.mean(), xc.std()
        z = (xc - mean) / sd
        yy = (y[idx] if k in PHOTO else y_pf)[ok]
        A1 = np.c_[np.ones_like(z), z]
        A2 = np.c_[A1, z * z]
        c1, res1, *_ = np.linalg.lstsq(A1, yy, rcond=None)
        c2, res2, *_ = np.linalg.lstsq(A2, yy, rcond=None)
        tot = ((yy - yy.mean()) ** 2).sum()
        vertex = -c2[1] / (2 * c2[2]) if c2[2] != 0 else np.inf
        peaked = c2[2] < 0 and abs(vertex) < 2 and (res1[0] - res2[0]) / tot > 0.003
        coef = [float(c2[0]), float(c2[1]), float(c2[2])] if peaked else [float(c1[0]), float(c1[1]), 0.0]
        grid = np.linspace(-2.5, 2.5, 101)
        fg = coef[0] + coef[1] * grid + coef[2] * grid * grid
        out[k] = {
            'mean': float(mean), 'sd': float(sd), 'clip': [float(lo), float(hi)],
            'curve': coef, 'lo': float(fg.min()), 'hi': float(fg.max()), 'effect': float(fg.max() - fg.min()),
            'kind': 'peak' if peaked else ('up' if coef[1] > 0 else 'down'),
            'ideal': float(mean + vertex * sd) if peaked else None,
        }
    return out


def curve_values(X, curves):
    """Evaluate each feature's curve (rows x features). Mirrors curveAt() in js/analysis.js."""
    G = np.empty(X.shape)
    for j, c in enumerate(curves):
        x = np.where(np.isnan(X[:, j]), c['mean'], np.clip(X[:, j], *c['clip']))
        z = np.clip((x - c['mean']) / c['sd'], -2.5, 2.5)
        G[:, j] = c['curve'][0] + c['curve'][1] * z + c['curve'][2] * z * z
    return G


def nnls(G, y, iters=400):
    """Least squares with non-negative weights (coordinate descent) plus a free intercept."""
    w = np.zeros(G.shape[1])
    b = y.mean()
    res = y - b
    nn = (G * G).sum(0)
    for _ in range(iters):
        for j in range(G.shape[1]):
            if nn[j] == 0:
                continue
            new = max(0.0, w[j] + G[:, j] @ res / nn[j])
            res -= G[:, j] * (new - w[j])
            w[j] = new
        db = res.mean()
        b += db
        res -= db
    return w, b


def main(inp, out_js, out_md):
    rows = load(inp)
    men = [r for r in rows if r['group'] in ('AM', 'CM')]
    women = [r for r in rows if r['group'] in ('AF', 'CF')]
    y = np.array([r['rating'] for r in men])
    eth = np.array([r['group'] for r in men])
    report = [f'# Calibration report\n\nFaces with landmarks: {len(rows)} ({len(men)} men, {len(women)} women).\n']

    # ---------- Shape models ----------
    S_all = np.array([shape_vector(r['leveled']) for r in rows])
    is_m = np.array([r['group'] in ('AM', 'CM') for r in rows])
    s_mean = S_all.mean(0)
    _, _, Vt = np.linalg.svd(S_all - s_mean, full_matrices=False)
    pcs = Vt[:N_PCS]
    P = (S_all - s_mean) @ pcs.T

    # Masculinity: regularised LDA on shape PCs. Balance ethnicities so the axis
    # reflects sex differences rather than the Asian/Caucasian mix.
    groups = np.array([r['group'] for r in rows])
    mu = {g: P[groups == g].mean(0) for g in ('AM', 'CM', 'AF', 'CF')}
    mu_m = (mu['AM'] + mu['CM']) / 2
    mu_f = (mu['AF'] + mu['CF']) / 2
    Sw = sum(np.cov((P[groups == g] - mu[g]).T) for g in mu) / 4
    lda = np.linalg.solve(Sw + 1e-3 * np.trace(Sw) / N_PCS * np.eye(N_PCS), mu_m - mu_f)
    proj = P @ lda
    m_proj = proj[is_m]
    lda_mu, lda_sd = m_proj.mean(), m_proj.std()
    sep = (proj[is_m].mean() - proj[~is_m].mean()) / proj.std()
    acc = ((proj > (proj[is_m].mean() + proj[~is_m].mean()) / 2) == is_m).mean()
    report.append(f'Masculinity axis: male/female classification accuracy {acc:.1%}, separation {sep:.2f} SD.\n')

    # Shape attractiveness: ridge on PCs (men only)
    Pm = P[is_m]
    lam_s, r_s = best_lambda(Pm, y)
    w_s, b_s = ridge(Pm, y, lam_s)
    report.append(f'Shape-only model (20 PCs, ridge λ={lam_s}): cross-validated r = {r_s:.3f}.\n')

    # Out-of-fold shape scores for training/validating the overall model, so its
    # cross-validated r isn't inflated; the app uses the full-data weights.
    _, shape_oof = cv_r(Pm, y, lam_s)
    for i, r in enumerate(men):
        r['f']['masculinity'] = (proj[is_m][i] - lda_mu) / lda_sd
        r['f']['shapeScore'] = shape_oof[i]

    # ---------- Per-feature curves ----------
    feats = GEOM + APPEAR + PHOTO + EXPR + SHAPE
    # Measured asymmetry mostly reflects head turn in this data; it is reported
    # but not allowed to raise or lower the overall prediction.
    model_feats = [k for k in feats if k != 'asym']
    F = np.array([[r['f'][k] for k in feats] for r in men], dtype=float)
    everyone = np.arange(len(y))
    curves = fit_curves(F, y, feats, everyone)

    stats = {}
    report.append('\n## Features vs. rating (men)\n\nNon-photo features are fitted with photo quality (lighting, sharpness, head angle) regressed out.\n\n| feature | r raw | r (photo-controlled) | r Asian | r Caucasian | shape | top-20% median | all median |\n|---|---|---|---|---|---|---|---|\n')
    top_cut = np.quantile(y, 0.8)
    y_pf = photo_free(F, y, feats, everyone)
    for j, k in enumerate(feats):
        c = curves[k]
        x = F[:, j]
        ok = ~np.isnan(x)
        xc = np.clip(x[ok], *c['clip'])
        z = (xc - c['mean']) / c['sd']
        yy = (y if k in PHOTO else y_pf)[ok]
        r_raw = np.corrcoef(z, y[ok])[0, 1]
        r_all = np.corrcoef(z, yy)[0, 1]
        rs = {g: np.corrcoef(z[eth[ok] == g], yy[eth[ok] == g])[0, 1] for g in ('AM', 'CM')}
        top = xc[y[ok] >= top_cut]
        stats[k] = {
            **c,
            'r': float(r_all), 'rRaw': float(r_raw), 'rAsian': float(rs['AM']), 'rCaucasian': float(rs['CM']),
            'top': [float(np.percentile(top, q)) for q in (25, 50, 75)],
            'all': [float(np.percentile(xc, q)) for q in (25, 50, 75)],
        }
        report.append(f'| {k} | {r_raw:+.3f} | {r_all:+.3f} | {rs["AM"]:+.3f} | {rs["CM"]:+.3f} | {c["kind"]} | '
                      f'{stats[k]["top"][1]:.3f} | {stats[k]["all"][1]:.3f} |\n')

    # ---------- Overall model ----------
    # Additive and monotone: overall = bias + sum_k w_k * curve_k(x_k), with
    # w_k >= 0. Every parameter score therefore pushes the overall score in the
    # same direction, so the advice is consistent. Curves are re-fitted inside
    # each fold so the cross-validated r is honest.
    mcols = [feats.index(k) for k in model_feats]
    idx = RNG.permutation(len(y))
    pred_cv = np.empty(len(y))
    for i in range(5):
        te = idx[i::5]
        tr = np.setdiff1d(idx, te)
        cv_curves = fit_curves(F, y, feats, tr)
        Gtr = curve_values(F[tr][:, mcols], [cv_curves[k] for k in model_feats])
        g_mu = Gtr.mean(0)
        w_cv, b_cv = nnls(Gtr - g_mu, y[tr])
        pred_cv[te] = (curve_values(F[te][:, mcols], [cv_curves[k] for k in model_feats]) - g_mu) @ w_cv + b_cv
    r_add = np.corrcoef(pred_cv, y)[0, 1]

    G = curve_values(F[:, mcols], [curves[k] for k in model_feats])
    g_mu = G.mean(0)
    w, b = nnls(G - g_mu, y)

    # Unconstrained ridge with squared terms, for comparison only.
    Z = np.column_stack([(np.where(np.isnan(F[:, j]), curves[k]['mean'], np.clip(F[:, j], *curves[k]['clip'])) - curves[k]['mean']) / curves[k]['sd'] for j, k in zip(mcols, model_feats)])
    lam, r_ridge = best_lambda(np.c_[Z, Z * Z], y)

    report.append(f'\n## Overall model\n\nAdditive, non-negative model: cross-validated r = {r_add:.3f} (R² = {r_add ** 2:.2f}) on {len(y)} men.\n'
                  f'(For comparison, an unconstrained ridge model with squared terms reaches r = {r_ridge:.3f}, but its parts can pull against each other, so it is not used.)\n\n')
    for g in ('AM', 'CM'):
        sel = eth == g
        report.append(f'- CV r within {"Asian" if g == "AM" else "Caucasian"} men: {np.corrcoef(pred_cv[sel], y[sel])[0, 1]:.3f}\n')
    report.append('\nWeights × effect (rating points each parameter can move the overall prediction):\n\n')
    for k, wk in sorted(zip(model_feats, w), key=lambda t: -t[1] * curves[t[0]]['effect']):
        report.append(f'- {k}: {wk * curves[k]["effect"]:.2f}\n')

    # The app's face score holds photo features at the dataset median, so a good
    # or bad photo doesn't move it; the photo's effect is reported separately.
    Ff = F[:, mcols].copy()
    for k in PHOTO:
        Ff[:, model_feats.index(k)] = stats[k]['all'][1]
    pred_face = (curve_values(Ff, [curves[k] for k in model_feats]) - g_mu) @ w + b
    pct = [float(np.percentile(pred_face, q)) for q in range(101)]
    report.append(f'\nFace score (photo held at median) vs rating: r = {np.corrcoef(pred_face, y)[0, 1]:.3f} (in-sample)\n')

    calib = {
        'meta': {
            'source': 'SCUT-FBP5500 (Liang et al., ICPR 2018) — 2,750 male faces rated 1–5 by 60 raters',
            'nMen': int(len(y)), 'cvR': float(r_add), 'meanRating': float(y.mean()),
        },
        'features': stats,
        'shape': {
            'mean': [round(float(v), 5) for v in s_mean],
            'pcs': [[round(float(v), 5) for v in pc] for pc in pcs],
            'lda': [float(v) for v in lda], 'ldaMean': float(lda_mu), 'ldaSd': float(lda_sd),
            'attract': [float(v) for v in w_s], 'attractBias': float(b_s),
        },
        'model': {
            'features': model_feats, 'weights': [float(v) for v in w], 'gMean': [float(v) for v in g_mu],
            'photo': PHOTO, 'bias': float(b), 'percentiles': pct,
        },
    }
    with open(out_js, 'w') as fh:
        fh.write('/* Generated by tools/calibrate/analyze.py — do not edit by hand. */\n')
        fh.write('window.FaceCalibration = ')
        json.dump(calib, fh, separators=(',', ':'))
        fh.write(';\n')
    with open(out_md, 'w') as fh:
        fh.writelines(report)
    print(''.join(report))


if __name__ == '__main__':
    main(*sys.argv[1:4])
