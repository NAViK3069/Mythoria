// Heroes' lasting HP (like Honkai: Star Rail): the HP a hero ends a battle with is what it has until it's healed -
// in a battle, or outside with a potion. A hero that falls stays down until a revive potion, or it gets up by itself
// after a long wait. The numbers are Claude's FIRST DRAFT for the owner to set (docs/game-design/vitals.md).

export const VITALS = {
  /** A fallen hero gets up by itself after this long (minutes), with this much of its max HP (%). */
  reviveMinutes: 30,
  reviveHpPct: 30,
  /** What the items do outside battle. */
  items: {
    /** ยาฟื้นฟู: heals one hero by this % of its max HP (not a fallen one). */
    potion: { healPct: 40 },
    /** ยาชุบชีวิต: gets a fallen hero up with this % of its max HP. */
    revive: { hpPct: 50 },
  },
} as const;
