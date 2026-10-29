// Sound hooks. Placeholders until Phase 5 adds CC0 sounds
// (impact, ceramic clinks, soft rain, a rin bell).

export const audio = {
  // strength: 0..1
  impact(strength) {
    // A small tap on phones that support it, so the break is felt.
    navigator.vibrate?.(Math.round(18 + 30 * strength));
  },
  clink() {},
};
