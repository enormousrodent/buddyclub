import {
  RulesetDefinitionSchema,
  SocialSessionRulesetSchema,
  type SocialSessionRuleset,
} from '@buddyclub/rules-schema';
import type { CreateRulesetBody, Ruleset } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';

interface RulesetRow {
  id: string;
  organisation_id: string;
  kind: 'social_session' | 'league';
  name: string;
  schema_version: number;
  definition_json: Record<string, unknown>;
  version: number;
  used_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
}

const COLUMNS = [
  'id',
  'organisation_id',
  'kind',
  'name',
  'schema_version',
  'definition_json',
  'version',
  'used_at',
  'archived_at',
  'created_at',
] as const;

function toRuleset(row: RulesetRow): Ruleset {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    kind: row.kind,
    name: row.name,
    schemaVersion: row.schema_version,
    definition: row.definition_json,
    version: row.version,
    usedAt: toIsoOrNull(row.used_at),
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIso(row.created_at),
  };
}

/** Validates an opaque rules object as a social-session ruleset, filling defaults. */
export function parseSocialRules(definition: unknown): SocialSessionRuleset {
  const parsed = SocialSessionRulesetSchema.safeParse(
    definition && typeof definition === 'object'
      ? { schemaVersion: 1, kind: 'social_session', ...(definition as object) }
      : definition,
  );
  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'Invalid session rules',
      undefined,
      parsed.error.issues.map((i) => ({
        path: `body/rules/${i.path.join('/')}`,
        message: i.message,
      })),
    );
  }
  return parsed.data;
}

export const DEFAULT_SOCIAL_RULES: SocialSessionRuleset = parseSocialRules({});

export async function createRuleset(
  db: Db,
  actor: Actor,
  organisationId: string,
  body: CreateRulesetBody,
  ctx: CommandContext,
): Promise<Ruleset> {
  assertOrgAction(actor, organisationId, 'rules.configure');
  const parsed = RulesetDefinitionSchema.safeParse({
    schemaVersion: 1,
    kind: body.kind,
    ...body.definition,
  });
  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'Invalid ruleset definition',
      undefined,
      parsed.error.issues.map((i) => ({
        path: `body/definition/${i.path.join('/')}`,
        message: i.message,
      })),
    );
  }
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto('platform.rulesets')
      .values({
        organisation_id: organisationId,
        kind: body.kind,
        name: body.name,
        schema_version: parsed.data.schemaVersion,
        definition_json: JSON.stringify(parsed.data),
        created_by_profile_id: actor.profileId,
      })
      .returning(COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'ruleset',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { organisationId, kind: body.kind, name: body.name },
    });
    return toRuleset(row);
  });
}

export async function listRulesets(
  db: Db,
  actor: Actor,
  organisationId: string,
): Promise<Ruleset[]> {
  assertOrgMember(actor, organisationId);
  const rows = await db
    .selectFrom('platform.rulesets')
    .select(COLUMNS)
    .where('organisation_id', '=', organisationId)
    .where('archived_at', 'is', null)
    .orderBy('name')
    .execute();
  return rows.map(toRuleset);
}
