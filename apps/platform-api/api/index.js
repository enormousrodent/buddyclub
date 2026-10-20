// Vercel Function wrapper (ADR-012). `pnpm build` (tsup) bundles src/vercel.ts with every
// dependency into dist/vercel.cjs, so the function is self-contained and needs no node_modules.
import bundle from '../dist/vercel.cjs';

export default bundle.default ?? bundle;
