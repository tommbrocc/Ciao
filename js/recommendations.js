/*
 * Turns an analysis result into personalised, actionable suggestions for men:
 * haircuts, beard styles and glasses that suit the detected face shape, plus
 * targeted tips for any measurement that sits outside the typical range.
 *
 * prefs.beard: 'full' | 'patchy' | 'none'   (what the user can / wants to grow)
 * prefs.hair:  'full' | 'thinning'
 */
(function (global) {
  'use strict';

  const FACE_SHAPES = {
    oval: {
      name: 'Oval',
      summary: 'Balanced length and width with a gently rounded jaw — the most versatile shape. Almost any cut works, so choose on taste and lifestyle.',
      hair: ['Textured quiff or pompadour', 'Classic side part with a taper', 'Medium-length swept back (slick back or flow)', 'Short textured crop'],
      hairThinning: ['Buzz cut (#2–#4) — clean and confident', 'Short textured crop with a fringe', 'Skin fade with a short top'],
      beard: {
        full: ['Short boxed beard', 'Medium full beard, rounded at the bottom', 'Light stubble (3–5 mm)'],
        patchy: ['Light stubble (3–5 mm) — hides patchiness', 'Goatee or Van Dyke if the chin fills in best', 'Clean shaven also suits you'],
      },
      glasses: ['Almost any frame: try wide rectangles, wayfarers or aviators', 'Keep the frame about as wide as the widest part of your face'],
      avoid: ['Long fringes that hide your balanced proportions'],
    },
    round: {
      name: 'Round',
      summary: 'Width and length are similar with soft, curved lines. Add height on top and angles at the jaw to look longer and more defined.',
      hair: ['Volume on top: quiff, pompadour or faux hawk', 'High or mid skin fade / undercut to slim the sides', 'Angular fringe swept to one side', 'Hard side part'],
      hairThinning: ['Short crop with a fade — keeps sides tight', 'Buzz cut with a sharp line-up', 'Short spiky texture for a bit of height'],
      beard: {
        full: ['Boxed beard kept short on the cheeks and longer at the chin', 'Anchor or Balbo beard — adds length and angles', 'Sharp, straight cheek line'],
        patchy: ['Goatee or extended goatee — lengthens the face', 'Chin strap / chin curtain to fake a sharper jaw', 'Stubble with a longer chin area'],
      },
      glasses: ['Rectangular or square frames add angles', 'Frames slightly wider than your face', 'Avoid small round frames'],
      avoid: ['Round bowl cuts and full sides', 'Wide, rounded beards that add width'],
    },
    square: {
      name: 'Square',
      summary: 'Strong, wide jaw with similar width at forehead, cheeks and jaw — the classic masculine structure. Show it off, or soften the corners slightly.',
      hair: ['Crew cut or Ivy League', 'Classic side part with a taper', 'Textured crop with a messy top', 'Undercut — emphasises the jaw', 'Buzz cut — your jaw can carry it'],
      hairThinning: ['Buzz cut — the strong jaw does the work', 'Crew cut', 'Short textured crop'],
      beard: {
        full: ['Light to medium stubble to show off the jaw', 'Short boxed beard with rounded corners', 'Circle beard if you want to soften the jaw'],
        patchy: ['Stubble (3–5 mm)', 'Clean shaven — shows the jaw best', 'Goatee to soften the jaw width'],
      },
      glasses: ['Round or oval frames soften the angles', 'Thin metal, browline or aviator frames', 'Avoid heavy, very square frames'],
      avoid: ['Boxy, flat-sided cuts that exaggerate width', 'Very wide, square beards'],
    },
    rectangle: {
      name: 'Rectangle',
      summary: 'Longer than wide with a strong, straight jaw. Add some width at the sides and avoid extra height.',
      hair: ['Side part with some fullness at the sides', 'Textured crop or fringe styled forward', 'Medium-length, slightly messy cut', 'Low fade or scissor cut rather than a high skin fade'],
      hairThinning: ['Short crop with a forward fringe', 'Buzz cut kept slightly longer on the sides', 'Avoid height on top'],
      beard: {
        full: ['Full beard kept wider on the cheeks and shorter at the chin', 'Short boxed beard', 'Mutton chops / side-weighted beard'],
        patchy: ['Even stubble across the cheeks', 'Avoid goatees — they add length', 'Clean shaven also works'],
      },
      glasses: ['Tall, oversized frames to break up length', 'Bold temples add width', 'Avoid small narrow frames'],
      avoid: ['Tall pompadours and high fades', 'Long chin beards'],
    },
    oblong: {
      name: 'Oblong',
      summary: 'Longer than wide with a narrower jaw. Add width at the sides and break up the vertical line.',
      hair: ['Fringe or forward-styled crop', 'Medium length with volume at the sides', 'Side part without much height', 'Caesar cut'],
      hairThinning: ['Caesar cut with a short fringe', 'Short crop styled forward', 'Avoid tight sides with height on top'],
      beard: {
        full: ['Full beard with fuller cheeks and a trimmed chin', 'Boxed beard — adds width at the jaw', 'Avoid long pointed beards'],
        patchy: ['Stubble with fuller cheek coverage', 'Chin strap to widen the jaw line', 'Avoid goatees'],
      },
      glasses: ['Deep, tall frames', 'Round or square frames with strong temples', 'Avoid narrow, small lenses'],
      avoid: ['Height on top', 'Long vertical beards'],
    },
    heart: {
      name: 'Heart / Triangle',
      summary: 'Wider cheekbones and forehead tapering to a narrower chin. Balance it by adding width at the lower face — a beard is your best tool.',
      hair: ['Medium-length textured hair with a side sweep', 'Fringe to narrow the forehead', 'Messy, tousled cut', 'Low taper rather than a high fade'],
      hairThinning: ['Short crop with a fringe', 'Buzz cut paired with a beard', 'Avoid slicked-back styles that expose the temples'],
      beard: {
        full: ['Full beard — the best way to add width at the jaw', 'Boxed beard with a fuller chin', 'Garibaldi (rounded full beard)'],
        patchy: ['Goatee with a moustache (circle beard) to fill out the chin', 'Heavier stubble at the jaw', 'Avoid pointed goatees'],
      },
      glasses: ['Bottom-heavy frames or rimless', 'Light-coloured or thin frames', 'Aviators balance a wider forehead'],
      avoid: ['Top-heavy frames', 'Lots of volume at the temples'],
    },
  };

  // Keyed by metric id → band ('low' | 'high' = which side of the ideal you are on).
  const METRIC_TIPS = {
    shapeScore: {
      low: {
        title: 'Overall face shape',
        tips: [
          'Bone structure is fixed, but the soft tissue around it isn\'t: getting leaner is the biggest lever on overall face shape.',
          'Use the haircut and beard suggestions above — they are chosen to balance your specific face shape.',
          'Work on the parameters marked "high impact" below that you can change (brows, eye area, skin, leanness).',
        ],
      },
    },
    jawAngle: {
      low: {
        title: 'Wide, heavy lower face',
        tips: [
          'Lowering body fat (roughly 12–15%) is the most effective way to slim and taper the lower face.',
          'Shape the beard to taper: shorter on the sides and jaw corners, slightly longer at the chin.',
          'Keep a sharp beard neckline (≈2 fingers above the Adam\'s apple) so the jaw has a clean edge.',
          'Cut down on salt and alcohol — water retention shows up first in the lower face.',
        ],
      },
    },
    jawRatio: {
      high: {
        title: 'Wide lower face',
        tips: [
          'Add a little height on top of the hair and keep the sides tight (fade or taper) to rebalance width.',
          'Keep beard sides short; let the chin carry a little more length.',
        ],
      },
    },
    cheekJaw: {
      low: {
        title: 'Fuller face',
        tips: [
          'Facial fat is the most changeable part of your face: a modest calorie deficit plus strength training shows quickly in the cheeks and jaw.',
          'Reduce salt, alcohol and late heavy meals to cut puffiness.',
          'Short stubble darkens the jaw edge and makes the face look leaner.',
        ],
      },
    },
    canthalTilt: {
      low: {
        title: 'Neutral / downward eye tilt',
        tips: [
          'Groom the brow tails so they don\'t droop — a clean, slightly lifted outer brow makes the eyes look sharper.',
          'Sleep and less salt/alcohol reduce puffiness that pulls the outer eye corners down.',
          'Frames with a strong upper rim (browline, wayfarer) lift the eye area.',
          'In photos, a slight "squinch" (lower lids gently raised) instead of wide-open eyes looks more confident.',
        ],
      },
    },
    browEyeGap: {
      high: {
        title: 'High-set brows',
        tips: [
          'Don\'t trim the lower edge of your brows — let them grow down toward the eyes; only remove strays above.',
          'A clear brow gel keeps the hairs brushed flat and slightly lower instead of fanning upward.',
          'Avoid raising your eyebrows in photos; relax the forehead.',
          'Glasses with a thick top rim visually lower the brow line.',
        ],
      },
    },
    eyeOpenness: {
      low: {
        title: 'Small or hooded-looking eyes',
        tips: [
          'Sleep 7–9 h and keep salt/alcohol low the night before photos — puffy lids make eyes look smaller.',
          'A cold compress or caffeine eye gel in the morning reduces swelling.',
          'Face the light in photos; squinting into the sun or a lamp narrows the eyes.',
        ],
      },
    },
    eyeSpacing: {
      high: {
        title: 'Wide-set or small eyes',
        tips: [
          'Keep the inner part of the brows full — don\'t over-trim the inner ends.',
          'Glasses with a dark or thick bridge visually bring the eyes closer.',
          'A hairstyle with volume at the centre (quiff) pulls focus inward.',
        ],
      },
    },
    lipRatio: {
      low: {
        title: 'Thinner lower lip',
        tips: [
          'Use a lip balm with SPF daily — dry, flat lips look thinner.',
          'A neat goatee or soul patch frames the lower lip.',
          'Stay hydrated; dehydration shows in the lips first.',
        ],
      },
    },
    fwhr: {
      low: {
        title: 'Long, narrow mid face',
        tips: [
          'Choose haircuts with width at the sides rather than height on top.',
          'A beard kept fuller on the cheeks adds horizontal width.',
          'Wider glasses frames break up vertical length.',
        ],
      },
      high: {
        title: 'Broad mid face',
        tips: [
          'Add height on top of the hair; keep the sides short (fade or taper).',
          'Keep the beard tighter on the cheeks with some length at the chin.',
          'Lower body fat slims the face more than anything else.',
        ],
      },
    },
    thirdsRatio: {
      high: {
        title: 'Long lower third',
        tips: [
          'Keep the beard fuller on the sides and short on the chin to shorten the lower face.',
          'A fringe or volume at the sides balances a longer lower face.',
          'Avoid long goatees or pointed chin beards.',
        ],
      },
    },
    noseRatio: {
      high: {
        title: 'Wider nose',
        tips: [
          'Fuller, well-groomed brows and some facial hair balance the features around the nose.',
          'Glasses with a higher, bolder bridge draw attention upward.',
          'In photos, avoid wide-angle phone lenses close to the face — they enlarge the nose. Step back and zoom in (2×).',
        ],
      },
    },
    chinPhiltrum: {
      low: {
        title: 'Short / recessed chin',
        tips: [
          'A goatee or chin beard is the best non-surgical way to add chin length and projection.',
          'In photos, push your face slightly forward and tilt the chin down a touch.',
          'Fix forward-head posture (strengthen the upper back) — it makes the chin look weaker.',
          'If it really bothers you, a dermatologist can discuss chin filler.',
        ],
      },
      high: {
        title: 'Long chin',
        tips: [
          'Keep chin beard length short; let the cheeks and moustache carry the beard instead.',
          'Volume at the sides of the haircut balances a longer lower face.',
        ],
      },
    },
    asym: {
      low: {
        title: 'Balance minor asymmetry',
        tips: [
          'Use a side part toward your "fuller" side — asymmetric cuts disguise facial asymmetry.',
          'Stubble or a short beard evens out small jaw and cheek differences.',
          'Make sure both eyebrows are groomed to the same height and shape.',
          'Check habits: chewing or sleeping on one side can accentuate asymmetry over time.',
        ],
      },
    },
    eyeContrast: {
      low: {
        title: 'Low eye-area definition',
        tips: [
          'Groom the brows so they frame the eyes clearly — this is the fastest way to add definition.',
          'Sleep, hydration and an eye cream with caffeine reduce puffiness that flattens the eye area.',
          'If your lashes and brows are very light, a professional brow/lash tint (lasts ~6 weeks) adds a lot of definition without looking like makeup.',
          'Overhead or slightly side light in photos creates natural depth around the eyes; flat flash removes it.',
        ],
      },
    },
    browContrast: {
      low: {
        title: 'Thin or light eyebrows',
        tips: [
          'Stop over-trimming: let your brows grow for 6–8 weeks, then only tidy strays.',
          'A tinted brow gel (in a shade close to your hair) makes sparse brows look fuller and natural.',
          'Brow tinting at a barber or salon is common for men with light brows.',
          'Topical minoxidil is sometimes used off-label for sparse brows — ask a dermatologist first.',
        ],
      },
    },
    skinRedness: {
      high: {
        title: 'Skin redness',
        tips: [
          'Use a gentle, fragrance-free cleanser and lukewarm (not hot) water.',
          'A moisturizer with niacinamide or azelaic acid calms redness and evens tone.',
          'Daily SPF 30+ — UV is a major cause of redness and blotchiness.',
          'Shave with the grain using a sharp blade and an alcohol-free aftershave balm to avoid razor irritation.',
          'Persistent flushing or bumps can be rosacea — a dermatologist can treat it effectively.',
        ],
      },
    },
    lipContrast: {
      low: {
        title: 'Pale lips',
        tips: [
          'Exfoliate lips gently once a week and use a lip balm daily — healthy lips have more natural colour.',
          'Stay hydrated and avoid smoking, which dulls lip colour.',
        ],
      },
    },
  };

  const PHOTO_TIPS = {
    brightness: {
      low: {
        title: 'Underexposed photo',
        tips: ['Take photos facing a window or outdoors in open shade.', 'Avoid backlight (a bright window behind you).'],
      },
    },
    lightBalance: {
      low: {
        title: 'Flat lighting',
        tips: [
          'Stand at about 45° to a window so the light falls from one side — it sculpts the cheekbones and jaw.',
          'Avoid on-camera flash and overhead fluorescent light, which flatten the face.',
        ],
      },
    },
    sharpness: {
      low: {
        title: 'Blurry or soft photo',
        tips: [
          'Clean the camera lens and hold still, or use a timer and something to lean the phone on.',
          'Use the rear camera when possible — it\'s much sharper than the selfie camera.',
          'Avoid beauty filters and heavy compression (screenshots of screenshots).',
        ],
      },
    },
  };

  const GENERAL_TIPS = [
    { title: 'Skin', text: 'Cleanser + moisturizer with SPF 30 every morning. Add a retinoid at night for texture and acne. Most men skip SPF — it\'s the biggest anti-ageing win.' },
    { title: 'Beard care', text: 'Trim every few days, shape the cheek and neck lines, and use beard oil to soften hair and stop itch and flakes. Wash it with a gentle cleanser.' },
    { title: 'Haircut routine', text: 'Get a cut every 3–5 weeks to keep the shape. Bring photos to your barber and use a matte product (clay or paste) for a natural look.' },
    { title: 'Eyebrows', text: 'Trim long hairs and remove the unibrow area — keep the natural thickness. Groomed brows make the whole face look sharper.' },
    { title: 'Body fat & training', text: 'Getting leaner reveals the jaw and cheekbones; training neck, traps and shoulders makes the face and head look more proportionate.' },
    { title: 'Sleep & hydration', text: '7–9 hours of sleep and enough water reduce puffiness and dark circles. Go easy on alcohol before photos.' },
    { title: 'Posture', text: 'Shoulders back, neck long, chin slightly forward and down. Forward-head posture weakens the jaw in every photo.' },
    { title: 'Teeth & smile', text: 'A genuine smile is rated more attractive than any proportion. Whitening and good dental care make a big difference.' },
  ];

  const THINNING_TIPS = {
    title: 'Thinning hair',
    tips: [
      'Go shorter — short cuts make thinning far less noticeable than longer hair.',
      'Matte products (clay, powder) add volume; avoid shiny gels that expose the scalp.',
      'A beard balances the face when there\'s less hair on top.',
      'See a dermatologist early: treatments like minoxidil or finasteride work best before much hair is lost.',
      'If it\'s advanced, a clean shave or very short buzz with a beard is a strong, confident look.',
    ],
  };

  const FACIAL_HAIR_RE = /beard|goatee|moustache|stubble|mutton|soul patch|balbo/i;

  function build(result, prefs) {
    const shape = FACE_SHAPES[result.faceShape];
    const showBeard = prefs.beard !== 'none';

    const tipsFor = (table, metrics) => {
      const out = [];
      for (const m of metrics) {
        const entry = table[m.id] && table[m.id][m.band];
        if (!entry) continue;
        const tips = showBeard ? entry.tips : entry.tips.filter((t) => !FACIAL_HAIR_RE.test(t));
        if (tips.length) out.push({ metric: m.label, score: m.score, impact: m.impact, title: entry.title, tips });
      }
      // Most impactful and weakest first.
      const rank = { high: 0, medium: 1, low: 2, 'not scored': 2 };
      return out.sort((a, b) => rank[a.impact] - rank[b.impact] || a.score - b.score);
    };
    const improvements = tipsFor(METRIC_TIPS, result.metrics.filter((m) => m.cat !== 'photo'));
    const photoTips = tipsFor(PHOTO_TIPS, result.metrics.filter((m) => m.cat === 'photo'));

    const extras = [];
    if (prefs.hair === 'thinning') {
      extras.push({
        title: THINNING_TIPS.title,
        tips: showBeard ? THINNING_TIPS.tips : THINNING_TIPS.tips.filter((t) => !FACIAL_HAIR_RE.test(t)),
      });
    }

    const strengths = result.metrics
      .filter((m) => m.score >= 8 && m.cat !== 'photo' && m.impact !== 'low' && m.impact !== 'not scored')
      .sort((a, b) => b.score - a.score)
      .map((m) => m.label);

    return {
      shape,
      hair: prefs.hair === 'thinning' ? shape.hairThinning : shape.hair,
      beard: showBeard ? shape.beard[prefs.beard] : null,
      glasses: shape.glasses,
      avoid: showBeard ? shape.avoid : shape.avoid.filter((t) => !FACIAL_HAIR_RE.test(t)),
      improvements,
      photoTips,
      extras,
      strengths,
      general: showBeard ? GENERAL_TIPS : GENERAL_TIPS.filter((g) => g.title !== 'Beard care'),
    };
  }

  global.FaceRecommendations = { build, FACE_SHAPES };
})(typeof window !== 'undefined' ? window : globalThis);
