// The three pot profiles: radius against height, in world units (metres-ish,
// scaled so pots read well on screen). Each profile starts at the centre of
// the base, so the base is part of the same surface as the walls.
//
// Traditional Japanese forms, each from one of the old kilns (see KILNS in
// buildPot.js). Convex corners keep a radius well above the wall thickness,
// so the inner wall, offset along the normal, never folds over itself.

export const PROFILES = {
  // 徳利 Sake flask, Bizen. Low, full body (widest at about 30% of the
  // height), a shoulder that curves into a long narrow neck, a small flared mouth.
  tokkuri: {
    id: 'tokkuri',
    kanji: '徳利',
    kiln: 'bizen',
    points: [
      [0, 0],
      [0.12, 0],
      [0.165, 0.01],
      [0.215, 0.045],
      [0.3, 0.13],
      [0.35, 0.24],
      [0.36, 0.32],
      [0.34, 0.42],
      [0.28, 0.53],
      [0.19, 0.63],
      [0.12, 0.72],
      [0.088, 0.81],
      [0.078, 0.9],
      [0.08, 0.98],
      [0.09, 1.04],
      [0.108, 1.08],
    ],
    thickness: 0.024,
    lipThickness: 1.35, // thickness multiplier at the rim
    rimRound: 0.6,
    standMargin: 1.45,
  },

  // 壺 Storage jar, Shigaraki. A broad shoulder high up (about 70% of the
  // height), tapering almost straight to a small base, a short neck and a
  // rolled, everted lip.
  tsubo: {
    id: 'tsubo',
    kanji: '壺',
    kiln: 'shigaraki',
    points: [
      [0, 0],
      [0.14, 0],
      [0.19, 0.012],
      [0.215, 0.045],
      [0.26, 0.18],
      [0.33, 0.36],
      [0.4, 0.54],
      [0.44, 0.66],
      [0.45, 0.74],
      [0.42, 0.82],
      [0.34, 0.89],
      [0.24, 0.94],
      [0.19, 0.965],
      [0.173, 0.995],
      // The lip flares a little, then stands upright, so it rolls over the top.
      [0.178, 1.02],
      [0.186, 1.042],
      [0.191, 1.06],
      [0.193, 1.078],
    ],
    thickness: 0.032,
    lipThickness: 1.6, // a rolled bead of a lip (tamabuchi)
    rimRound: 0.95,
    standMargin: 1.45,
  },

  // 茶碗 Tea bowl, Tamba. A trimmed foot ring (kōdai), a soft waist, walls
  // that rise steeply, and a rim turned slightly inward.
  chawan: {
    id: 'chawan',
    kanji: '茶碗',
    kiln: 'tamba',
    points: [
      [0, 0],
      [0.045, 0],
      [0.09, 0],
      [0.12, 0],
      [0.135, 0],
      // The foot's outer edge: an even quarter arc, about twice the wall
      // thickness, leaving the floor almost flat (the profile is clamped at y = 0).
      [0.1407, 0.00025],
      [0.1518, 0.0022],
      [0.1675, 0.0087],
      [0.181, 0.019],
      [0.1913, 0.0325],
      [0.1978, 0.0482],
      [0.2, 0.065],
      // The waist above the foot: an arc the other way, from upright to the
      // slope of the body.
      [0.2014, 0.0754],
      [0.2054, 0.085],
      [0.2117, 0.0933],
      [0.22, 0.0996],
      [0.26, 0.119],
      [0.3, 0.137],
      [0.38, 0.195],
      [0.44, 0.265],
      [0.478, 0.345],
      [0.497, 0.425],
      [0.5, 0.475],
      [0.494, 0.51],
      [0.484, 0.535],
    ],
    thickness: 0.03,
    lipThickness: 1.05,
    rimRound: 0.75,
    standMargin: 1.3,
  },
};

export const PROFILE_ORDER = ['tokkuri', 'tsubo', 'chawan'];
