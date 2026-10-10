/*
 * Turns an analysis result into personalised, actionable suggestions:
 * style changes that suit the detected face shape, plus targeted tips for
 * any measurement that sits outside the typical range.
 */
(function (global) {
  'use strict';

  const FACE_SHAPES = {
    oval: {
      name: 'Oval',
      summary: 'Balanced length and width with a gently rounded jaw — the most versatile shape. Most styles work; you can choose purely on taste.',
      hair: {
        masculine: ['Textured quiff or pompadour', 'Classic side part', 'Medium-length swept back', 'Buzz cut or crop — your proportions can carry it'],
        feminine: ['Long layers', 'Blunt bob or lob', 'Curtain bangs', 'Sleek high ponytail — shows off balanced proportions'],
      },
      beard: ['Short boxed beard', 'Light stubble (3–5 mm)', 'Clean shaven also works well — your jaw needs no correction'],
      glasses: ['Almost any frame: try wide rectangles or bold geometric shapes', 'Keep the frame about as wide as the widest part of your face'],
      avoid: ['Heavy fringes that hide your balanced proportions'],
    },
    round: {
      name: 'Round',
      summary: 'Width and length are similar with soft, curved lines. The goal is to add height and angles to create a longer, more defined look.',
      hair: {
        masculine: ['Volume on top: quiff, pompadour or faux hawk', 'Short, tight sides (fade or undercut)', 'Angular fringe swept to one side', 'Avoid round bowl cuts and heavy sides'],
        feminine: ['Long layers that fall below the chin', 'Side-swept or asymmetric bangs', 'High-volume crown, flat sides', 'Long bob with angled front'],
      },
      beard: ['Goatee or anchor beard — adds length to the chin', 'Short sides with a longer chin (corner-to-chin taper)', 'Keep cheeks clean-lined; avoid wide mutton chops'],
      glasses: ['Rectangular or square frames add angles', 'Frames slightly wider than your face', 'Avoid small round frames'],
      avoid: ['Chin-length cuts that end at the widest point', 'Center parts with full sides'],
    },
    square: {
      name: 'Square',
      summary: 'Strong, wide jaw with a straight jawline and similar width at forehead, cheeks and jaw. A naturally masculine/defined structure — style to balance or to accentuate.',
      hair: {
        masculine: ['Short, classic cuts: crew cut, Ivy League, side part', 'Textured crop with a slightly messy top', 'Undercut — emphasises the jaw', 'Slight length on top to soften the corners'],
        feminine: ['Soft waves and layers around the jaw', 'Side-swept bangs', 'Long hair with face-framing layers', 'Avoid blunt bobs ending at the jaw'],
      },
      beard: ['Light stubble to show off the jaw', 'Short, rounded beard to soften corners', 'Circle beard / goatee if you want to soften the jaw width'],
      glasses: ['Round or oval frames soften the angles', 'Thin metal or browline frames', 'Avoid heavy square frames'],
      avoid: ['Blunt cuts that end exactly at the jawline'],
    },
    rectangle: {
      name: 'Rectangle',
      summary: 'Longer than wide with a strong, straight jaw. The aim is to add width at the sides and avoid extra height.',
      hair: {
        masculine: ['Side part with some fullness at the sides', 'Fringe or textured crop forward', 'Avoid tall pompadours and very tight fades'],
        feminine: ['Bangs (straight or curtain) to shorten the face', 'Waves or curls for width', 'Shoulder-length layered cuts', 'Avoid very long straight hair'],
      },
      beard: ['Full beard kept wider on the sides and shorter on the chin', 'Mutton chops / side-weighted stubble', 'Avoid long goatees that add length'],
      glasses: ['Tall, oversized frames to break up length', 'Decorative or contrasting temples add width', 'Avoid small narrow frames'],
      avoid: ['Extra volume on top', 'Long chin beards'],
    },
    oblong: {
      name: 'Oblong',
      summary: 'Longer than wide with a narrower jaw. Add width at the sides and break up the vertical line.',
      hair: {
        masculine: ['Fringe or forward-styled crop', 'Medium length with volume at the sides', 'Side part without much height', 'Avoid very short sides with tall tops'],
        feminine: ['Bangs to shorten the face', 'Chin-length bob with volume', 'Voluminous waves', 'Avoid long, flat, straight hair'],
      },
      beard: ['Full beard with fuller cheeks and a trimmed chin', 'Chin-strap style to add width', 'Avoid long pointed beards'],
      glasses: ['Deep, tall frames', 'Round or square frames with strong temples', 'Avoid narrow, small lenses'],
      avoid: ['Height on top', 'Long vertical beards'],
    },
    heart: {
      name: 'Heart',
      summary: 'Wider cheekbones/forehead tapering to a narrower, pointed chin. Balance by adding width at the lower face.',
      hair: {
        masculine: ['Medium-length textured hair with a side sweep', 'Fringe to narrow the forehead', 'Avoid very short sides with a lot of top volume'],
        feminine: ['Chin-length bob or lob that adds width at the jaw', 'Side-swept bangs', 'Waves starting from the cheekbone down', 'Avoid volume at the crown'],
      },
      beard: ['Full beard — the best option to add width at the jaw', 'Boxed beard with fuller chin', 'Avoid pointed goatees'],
      glasses: ['Bottom-heavy frames or rimless', 'Light-coloured or thin frames', 'Aviators balance a wider forehead'],
      avoid: ['Top-heavy frames', 'Heavy volume at the temples'],
    },
  };

  const METRIC_TIPS = {
    symmetry: {
      low: {
        title: 'Balance minor asymmetry',
        tips: [
          'Try a side part toward your "fuller" side — asymmetric hairstyles disguise facial asymmetry well.',
          'In photos, find your better side and turn ~15° toward it.',
          'Check habits: chewing on one side or sleeping on one side can accentuate asymmetry over time.',
          'Groom eyebrows to match in height and shape — they are the most noticeable asymmetry fix.',
        ],
      },
    },
    thirds: {
      high: {
        title: 'Long lower third',
        tips: [
          'A fuller beard on the sides (and short on the chin) visually shortens the lower face.',
          'Fringe/bangs or volume at the sides help balance a longer lower face.',
          'Avoid long goatees or pointed chin beards that add length.',
        ],
      },
      low: {
        title: 'Short lower third',
        tips: [
          'A goatee or chin-focused beard adds length to the lower face.',
          'Add height on top of the hair (quiff, pompadour, high ponytail) to elongate overall.',
          'Good posture with the chin slightly forward in photos helps define the lower face.',
        ],
      },
    },
    eyeSpacing: {
      high: {
        title: 'Wide-set eyes',
        tips: [
          'Keep the inner part of the brows full — don\'t over-pluck the inner ends.',
          'Glasses with a dark or thick bridge visually bring the eyes closer.',
          'Makeup (if you wear it): darken the inner corners, keep outer corners lighter.',
        ],
      },
      low: {
        title: 'Close-set eyes',
        tips: [
          'Tidy the inner brows so the gap between them is clean and slightly wider.',
          'Frames with a clear or thin bridge create a sense of space.',
          'Makeup (if you wear it): brighten the inner corners, define the outer third.',
        ],
      },
    },
    canthalTilt: {
      low: {
        title: 'Neutral / downward eye tilt',
        tips: [
          'Groom the brow tails slightly upward — it lifts the whole eye area.',
          'Get enough sleep and reduce salt/alcohol to minimise puffiness that pulls corners down.',
          'Cat-eye or upswept frames visually lift the outer eye.',
          'Makeup (if you wear it): a subtle upward wing or lash focus on the outer corner.',
        ],
      },
    },
    fwhr: {
      low: {
        title: 'Narrow / long mid face',
        tips: [
          'Choose hairstyles with width at the sides rather than height on top.',
          'A beard kept fuller on the cheeks adds horizontal width.',
          'Wider glasses frames break up vertical length.',
        ],
      },
      high: {
        title: 'Broad mid face',
        tips: [
          'Add height on top of the hair; keep sides shorter or sleeker.',
          'Slightly narrower beard on the sides with some length at the chin.',
          'Lower body-fat (if appropriate for you) slims the face more than anything else.',
        ],
      },
    },
    nose: {
      high: {
        title: 'Wider nose',
        tips: [
          'Fuller, well-defined brows balance the mid face.',
          'Glasses with a higher, bolder bridge draw attention upward.',
          'Makeup (if you wear it): subtle contour along the sides of the nose.',
        ],
      },
    },
    mouth: {
      low: {
        title: 'Smaller mouth',
        tips: [
          'A moustache kept trimmed above the lip avoids hiding the mouth.',
          'Lip balm / hydration keeps lips looking fuller and defined.',
        ],
      },
    },
    lips: {
      low: {
        title: 'Thinner lower lip',
        tips: [
          'Keep lips hydrated and exfoliated — dry lips look thinner.',
          'A neat moustache/goatee frames the mouth and adds definition.',
          'Makeup (if you wear it): lip liner slightly on the lower border.',
        ],
      },
      high: {
        title: 'Thinner upper lip',
        tips: [
          'Hydrate and exfoliate regularly — definition matters more than volume.',
          'Makeup (if you wear it): define the cupid\'s bow with liner.',
        ],
      },
    },
    chin: {
      low: {
        title: 'Recessed / short chin',
        tips: [
          'A goatee or chin beard is the single best non-surgical way to add chin projection.',
          'In photos, push your face slightly forward and tilt the chin down a touch.',
          'Posture: forward-head posture makes the chin look weaker — strengthen your upper back.',
          'Reducing body fat sharpens the chin-to-neck angle.',
        ],
      },
    },
    jaw: {
      low: {
        title: 'Soft jawline',
        tips: [
          'A short boxed beard with a sharp neckline (trimmed ~2 fingers above the Adam\'s apple) "draws" a jawline.',
          'Lowering body fat is the most effective way to reveal jaw definition.',
          'Keep the sides of the haircut short to emphasise the angles.',
          'Note: "mewing" and jaw-exerciser gadgets have little scientific support — don\'t overdo them.',
        ],
      },
    },
  };

  const GENERAL_TIPS = [
    { title: 'Skin', text: 'Daily SPF 30+, a gentle cleanser and a moisturizer. Add a retinoid at night for texture and tone (start slowly).' },
    { title: 'Eyebrows', text: 'Well-groomed brows frame the whole face. Remove stray hairs, but keep the natural shape and thickness.' },
    { title: 'Sleep & hydration', text: '7–9 hours of sleep and enough water reduce puffiness and dark circles more than any product.' },
    { title: 'Body composition', text: 'Moderate body-fat levels reveal facial bone structure (jaw, cheekbones) noticeably.' },
    { title: 'Posture', text: 'Shoulders back, neck long. Forward-head posture weakens the jaw and chin in every photo.' },
    { title: 'Smile & teeth', text: 'A genuine smile is consistently rated more attractive than any proportion. Whitening and good dental care help.' },
  ];

  function build(result, prefs) {
    const shape = FACE_SHAPES[result.faceShape];
    const style = prefs.style; // 'masculine' | 'feminine' | 'all'

    const hair = style === 'all'
      ? [...shape.hair.masculine.map((h) => `${h} (short/men's)`), ...shape.hair.feminine.map((h) => `${h} (longer/women's)`)]
      : shape.hair[style];

    const showFacialHair = prefs.facialHair;
    const facialHairRe = /beard|goatee|moustache|stubble|mutton/i;

    const improvements = [];
    for (const m of result.metrics) {
      const byBand = METRIC_TIPS[m.id];
      const entry = byBand && byBand[m.band];
      if (!entry || m.score >= 8) continue;
      const tips = showFacialHair ? entry.tips : entry.tips.filter((t) => !facialHairRe.test(t));
      if (tips.length) improvements.push({ metric: m.label, score: m.score, title: entry.title, tips });
    }
    improvements.sort((a, b) => a.score - b.score);

    const strengths = result.metrics
      .filter((m) => m.score >= 8.5)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.label);

    return {
      shape,
      hair,
      beard: showFacialHair ? shape.beard : null,
      glasses: shape.glasses,
      avoid: shape.avoid,
      improvements,
      strengths,
      general: GENERAL_TIPS,
    };
  }

  global.FaceRecommendations = { build, FACE_SHAPES };
})(typeof window !== 'undefined' ? window : globalThis);
