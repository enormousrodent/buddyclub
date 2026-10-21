/**
 * Deterministic social rotation engine (spec section 8). Pure TypeScript: no HTTP, no database.
 */
export * from './types';
export {
  ALGORITHM_VERSION,
  generateRotation,
  participantsFromHistory,
  type PlayedRound,
} from './engine';
export { createRng, hashSeed } from './prng';
export { kingOfTheCourt, type KingOfTheCourtInput, type PlayedMatch } from './king-of-the-court';

export const ROTATION_ENGINE_VERSION = 'rotation-engine@0.1.0';
