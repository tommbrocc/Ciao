# Calibration report

Faces with landmarks: 5495 (2748 men, 2747 women).
Masculinity axis: male/female classification accuracy 78.5%, separation 1.24 SD.
Shape-only model (20 PCs, ridge λ=0.1): cross-validated r = 0.636.

## Features vs. rating (men)

Non-photo features are fitted with photo quality (lighting, sharpness, head angle) regressed out.

| feature | r raw | r (photo-controlled) | r Asian | r Caucasian | shape | top-20% median | all median |
|---|---|---|---|---|---|---|---|
| asym | +0.284 | +0.071 | +0.197 | -0.139 | up | 0.025 | 0.017 |
| thirdsRatio | -0.136 | -0.170 | -0.135 | -0.332 | down | 0.824 | 0.847 |
| eyeSpacing | -0.395 | -0.319 | -0.399 | -0.178 | down | 1.580 | 1.601 |
| canthalTilt | +0.407 | +0.403 | +0.439 | +0.380 | up | 5.674 | 4.502 |
| eyeOpenness | +0.319 | +0.313 | +0.352 | +0.300 | up | 0.320 | 0.310 |
| browEyeGap | -0.447 | -0.376 | -0.458 | -0.367 | down | 0.721 | 0.815 |
| fwhr | -0.185 | -0.195 | -0.167 | -0.335 | peak | 1.695 | 1.729 |
| noseRatio | +0.055 | -0.043 | +0.111 | -0.338 | peak | 0.587 | 0.582 |
| mouthNose | -0.047 | -0.073 | +0.063 | -0.344 | down | 2.155 | 2.169 |
| lipRatio | +0.428 | +0.371 | +0.498 | +0.159 | up | 1.885 | 1.725 |
| chinPhiltrum | -0.014 | -0.044 | +0.094 | -0.364 | peak | 2.004 | 2.048 |
| jawAngle | +0.489 | +0.433 | +0.480 | +0.325 | up | 128.858 | 124.177 |
| jawRatio | -0.199 | -0.217 | -0.173 | -0.368 | down | 0.789 | 0.796 |
| chinRatio | -0.153 | -0.140 | -0.110 | -0.236 | down | 0.501 | 0.505 |
| lengthRatio | -0.042 | -0.055 | -0.020 | -0.147 | peak | 1.302 | 1.308 |
| cheekJaw | +0.202 | +0.172 | +0.157 | +0.231 | up | 1.483 | 1.472 |
| jawPerimArea | -0.203 | -0.161 | -0.225 | +0.010 | peak | 3.896 | 3.898 |
| skinTexture | +0.100 | +0.048 | +0.038 | +0.077 | up | 1.172 | 1.053 |
| skinBlotch | +0.250 | +0.103 | +0.162 | -0.047 | up | 10.064 | 8.174 |
| skinRednessVar | +0.091 | -0.023 | +0.043 | -0.208 | down | 2.843 | 2.646 |
| skinRedness | -0.230 | -0.156 | -0.128 | -0.250 | down | 11.544 | 13.889 |
| underEye | -0.301 | -0.257 | -0.345 | -0.120 | down | 0.924 | 0.961 |
| eyeContrast | +0.374 | +0.368 | +0.449 | +0.186 | up | 0.646 | 0.540 |
| browContrast | +0.170 | +0.164 | +0.206 | +0.025 | up | 0.180 | 0.153 |
| lipContrast | +0.114 | +0.084 | -0.026 | +0.349 | up | 12.437 | 11.465 |
| beardShadow | +0.009 | +0.036 | +0.021 | +0.061 | peak | 0.089 | 0.086 |
| beardTexture | +0.114 | +0.057 | +0.069 | +0.021 | up | 1.260 | 1.183 |
| brightness | +0.141 | +0.141 | +0.128 | +0.266 | up | 72.062 | 70.331 |
| lightBalance | +0.175 | +0.175 | +0.199 | +0.080 | up | 0.107 | 0.070 |
| sharpness | +0.129 | +0.129 | +0.094 | +0.260 | up | 5.099 | 4.777 |
| absYaw | +0.220 | +0.220 | +0.288 | +0.070 | up | 0.059 | 0.039 |
| absRoll | +0.076 | +0.076 | +0.030 | +0.078 | up | 1.717 | 1.562 |
| happy | -0.008 | -0.050 | +0.091 | -0.330 | down | 0.000 | 0.000 |
| negative | -0.064 | -0.086 | -0.069 | -0.129 | down | 0.000 | 0.000 |
| masculinity | +0.027 | -0.016 | -0.042 | +0.015 | down | -0.172 | -0.055 |
| shapeScore | +0.634 | +0.563 | +0.620 | +0.464 | up | 3.365 | 2.871 |

## Overall model

Additive, non-negative model: cross-validated r = 0.717 (R² = 0.51) on 2748 men.
(For comparison, an unconstrained ridge model with squared terms reaches r = 0.768, but its parts can pull against each other, so it is not used.)

- CV r within Asian men: 0.749
- CV r within Caucasian men: 0.633

Weights × effect (rating points each parameter can move the overall prediction):

- shapeScore: 0.95
- eyeContrast: 0.63
- brightness: 0.47
- negative: 0.42
- lipRatio: 0.37
- lightBalance: 0.34
- browEyeGap: 0.32
- underEye: 0.27
- absYaw: 0.27
- skinRedness: 0.24
- eyeOpenness: 0.20
- browContrast: 0.19
- lengthRatio: 0.18
- chinPhiltrum: 0.18
- jawRatio: 0.13
- fwhr: 0.09
- jawAngle: 0.09
- skinBlotch: 0.07
- skinRednessVar: 0.04
- sharpness: 0.04
- noseRatio: 0.03
- thirdsRatio: 0.00
- eyeSpacing: 0.00
- canthalTilt: 0.00
- mouthNose: 0.00
- chinRatio: 0.00
- cheekJaw: 0.00
- jawPerimArea: 0.00
- skinTexture: 0.00
- lipContrast: 0.00
- beardShadow: 0.00
- beardTexture: 0.00
- absRoll: 0.00
- happy: 0.00
- masculinity: 0.00

Face score (photo held at median) vs rating: r = 0.706 (in-sample)
