import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Spec section 4: rules engine packages must have no HTTP or database dependencies.
 * ESLint blocks the imports; this test blocks the package manifests so the rule survives
 * a lint config change.
 */
const ENGINE_PACKAGES = [
  'rules-schema',
  'rotation-engine',
  'competition-engine',
  'scoring-engine',
  'court-scheduler',
];

const FORBIDDEN = /^(fastify|@fastify\/|kysely$|pg$|@supabase\/|express$|next$|react-native$)/;

describe('architecture: engine packages stay pure', () => {
  for (const name of ENGINE_PACKAGES) {
    it(`${name} declares no HTTP/database dependencies`, () => {
      const manifestPath = resolve(__dirname, '../../packages', name, 'package.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const deps = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
      const offenders = deps.filter((dep) => FORBIDDEN.test(dep));
      expect(offenders).toEqual([]);
    });
  }
});
