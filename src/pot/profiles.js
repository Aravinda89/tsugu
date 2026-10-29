// The three pot profiles: radius against height, in world units (metres-ish,
// scaled so pots read well on screen). Each profile starts at the centre of
// the base, so the base is part of the same surface as the walls.

export const PROFILES = {
  // Sri Lankan clay chatti. Wide round belly, short neck, flared rolled lip.
  // Proportions follow the mockup: height ≈ 0.9 × belly width, widest at
  // ≈ 45% of the height, base ≈ 0.45 × belly, neck ≈ 0.7 × belly.
  chatti: {
    id: 'chatti',
    points: [
      [0, 0],
      [0.13, 0],
      [0.225, 0.008],
      [0.32, 0.055],
      [0.43, 0.17],
      [0.493, 0.31],
      [0.5, 0.405],
      [0.48, 0.52],
      [0.43, 0.63],
      [0.372, 0.715],
      [0.342, 0.78],
      [0.337, 0.825],
      [0.354, 0.868],
      [0.384, 0.9],
    ],
    thickness: 0.032,
    lipThickness: 1.6, // thickness multiplier at the rim: a rolled lip
    rimRound: 0.55,
    standMargin: 1.6,
  },

  // Tall water pot. Low belly, long shoulder, narrow neck, small flared mouth.
  water: {
    id: 'water',
    points: [
      [0, 0],
      [0.11, 0],
      [0.19, 0.012],
      [0.3, 0.09],
      [0.39, 0.25],
      [0.42, 0.4],
      [0.4, 0.55],
      [0.33, 0.73],
      [0.23, 0.89],
      [0.15, 1.0],
      [0.122, 1.08],
      [0.128, 1.16],
      [0.152, 1.22],
      [0.172, 1.25],
    ],
    thickness: 0.026,
    lipThickness: 1.35,
    rimRound: 0.6,
    standMargin: 1.4,
  },

  // Japanese-style tea bowl (chawan). Low, wide, gently curved walls.
  chawan: {
    id: 'chawan',
    points: [
      [0, 0],
      [0.15, 0],
      [0.19, 0.008],
      [0.215, 0.035],
      [0.29, 0.09],
      [0.4, 0.18],
      [0.48, 0.28],
      [0.53, 0.38],
      [0.548, 0.44],
      [0.55, 0.47],
    ],
    thickness: 0.03,
    lipThickness: 1.1,
    rimRound: 0.7,
    standMargin: 1.3,
  },
};

export const PROFILE_ORDER = ['water', 'chatti', 'chawan'];
