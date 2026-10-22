/* eslint-disable no-console -- a CLI script reports on stdout */
import { CATALOGUE, normaliseName } from '@buddyclub/shared-types';
import { sql } from 'kysely';
import { createDb } from '../src/db/index.js';
import { emitEvent } from '../src/platform/outbox.js';

/**
 * Seeds the activity catalogue into the database and closes the loop on suggestions.
 * Run after editing `packages/shared-types/src/catalogue.json`:
 *
 *   node --env-file=.env --import tsx scripts/seed-catalogue.ts
 *
 * Upserts categories (`community.interests`) and activities (`community.sports`) by id, never
 * deletes. A newly inserted activity whose name or alias matches an open suggestion promotes
 * it: the suggesters' profile rows move from `other` to the real activity, the suggestion is
 * marked promoted, and one outbox event per person records that they should be told.
 */
async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDb({ connectionString: url, maxConnections: 2 });
  try {
    const before = new Set(
      (await db.selectFrom('community.sports').select('id').execute()).map((r) => r.id),
    );

    await db.transaction().execute(async (trx) => {
      for (const c of CATALOGUE.categories) {
        await trx
          .insertInto('community.interests')
          .values({ id: c.id, name: c.name, sort_order: c.sortOrder })
          .onConflict((oc) =>
            oc.column('id').doUpdateSet({ name: c.name, sort_order: c.sortOrder }),
          )
          .execute();
      }
      for (const a of CATALOGUE.activities) {
        await trx
          .insertInto('community.sports')
          .values({
            id: a.id,
            name: a.name,
            default_players_per_side: a.playersPerSide ?? 1,
            category_id: a.category,
          })
          .onConflict((oc) =>
            oc.column('id').doUpdateSet({ name: a.name, category_id: a.category }),
          )
          .execute();
      }

      // Promotion: new activities that people had asked for.
      const fresh = CATALOGUE.activities.filter((a) => !before.has(a.id));
      for (const a of fresh) {
        const keys = [normaliseName(a.name), ...(a.aliases ?? []).map(normaliseName)];
        const asked = await trx
          .selectFrom('identity.activity_suggestions')
          .select(['id', 'profile_id', 'key'])
          .where('key', 'in', keys)
          .where('promoted_to', 'is', null)
          .execute();
        if (!asked.length) continue;
        for (const s of asked) {
          // Their "other" entry becomes the real thing, keeping level, days and note.
          await trx
            .deleteFrom('identity.profile_activities')
            .where('profile_id', '=', s.profile_id)
            .where('sport_id', '=', a.id)
            .execute();
          await trx
            .updateTable('identity.profile_activities')
            .set({ sport_id: a.id, interest_id: a.category, custom_name: null })
            .where('profile_id', '=', s.profile_id)
            .where('sport_id', '=', 'other')
            .where(sql`lower(custom_name)`, 'in', keys)
            .execute();
          await trx
            .updateTable('identity.activity_suggestions')
            .set({ promoted_to: a.id })
            .where('id', '=', s.id)
            .execute();
          await emitEvent(trx, {
            eventType: 'catalogue.activity_promoted',
            aggregateType: 'user_profile',
            aggregateId: s.profile_id,
            payload: { profileId: s.profile_id, activityId: a.id, name: a.name },
            dedupeKey: `activity_promoted:${s.profile_id}:${a.id}`,
          });
        }
        console.log(`promoted ${a.id}: ${asked.length} people asked`);
      }
    });

    const after = await db
      .selectFrom('community.sports')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .executeTakeFirstOrThrow();
    console.log(
      `catalogue seeded: ${CATALOGUE.categories.length} categories, ${CATALOGUE.activities.length} activities (${after.n} in the table)`,
    );
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
