import { rowsToCanvas } from './pixel';

// Floating hands (the characters have no arms - see ProjectZ). Skin matches the face.
const SKIN = { i: '#efc6ba', I: '#f9e2db', j: '#d9ada0' };

/** Hand sprites; each canvas is the rows plus a 1px black outline. */
export const HAND_ART = {
  // A relaxed, rounded hand.
  open: rowsToCanvas(['.iII.', 'iiiIi', 'jiiij', '.jjj.'], SKIN),
  // A fist (for holding a weapon later).
  grab: rowsToCanvas(['IiI', 'iij', 'iij', 'iij', 'jjj'], SKIN),
};

export type HandPose = keyof typeof HAND_ART;
