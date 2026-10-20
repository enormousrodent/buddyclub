import type { Db } from '../../db/index.js';
import type {
  EnsureProfileInput,
  IdentityRepository,
  MembershipRecord,
  MyParticipantRecord,
  UpdateProfileInput,
  UserProfileRecord,
} from './repository.js';

interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  display_name: string;
  avatar_url: string | null;
  locale: string;
}

const PROFILE_COLUMNS = ['id', 'auth_user_id', 'display_name', 'avatar_url', 'locale'] as const;

function toProfile(row: ProfileRow): UserProfileRecord | null {
  // A profile whose account has been deleted/anonymised has no auth user; it is not "me" for anyone.
  if (!row.auth_user_id) return null;
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    locale: row.locale,
  };
}

export class PgIdentityRepository implements IdentityRepository {
  constructor(private readonly db: Db) {}

  async findProfileByAuthUserId(authUserId: string): Promise<UserProfileRecord | null> {
    const row = await this.db
      .selectFrom('identity.user_profiles')
      .select(PROFILE_COLUMNS)
      .where('auth_user_id', '=', authUserId)
      .executeTakeFirst();
    return row ? toProfile(row) : null;
  }

  async ensureProfile(input: EnsureProfileInput): Promise<UserProfileRecord> {
    // Normally the auth.users trigger has already created the row; this is the race-safe fallback.
    const inserted = await this.db
      .insertInto('identity.user_profiles')
      .values({
        auth_user_id: input.authUserId,
        display_name: input.displayName,
        avatar_url: input.avatarUrl,
      })
      .onConflict((oc) => oc.column('auth_user_id').doNothing())
      .returning(PROFILE_COLUMNS)
      .executeTakeFirst();

    const profile = inserted
      ? toProfile(inserted)
      : await this.findProfileByAuthUserId(input.authUserId);
    if (!profile) throw new Error(`Profile for auth user ${input.authUserId} could not be ensured`);
    return profile;
  }

  async updateProfile(profileId: string, input: UpdateProfileInput): Promise<UserProfileRecord> {
    const patch: { display_name?: string; locale?: string } = {};
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.locale !== undefined) patch.locale = input.locale;
    const row = await this.db
      .updateTable('identity.user_profiles')
      .set(patch)
      .where('id', '=', profileId)
      .returning(PROFILE_COLUMNS)
      .executeTakeFirstOrThrow();
    const profile = toProfile(row);
    if (!profile) throw new Error('profile has no auth user');
    return profile;
  }

  async listMemberships(profileId: string): Promise<MembershipRecord[]> {
    return this.db
      .selectFrom('community.memberships as m')
      .innerJoin('community.organisations as o', 'o.id', 'm.organisation_id')
      .select([
        'm.organisation_id as organisationId',
        'o.name as organisationName',
        'o.slug as organisationSlug',
        'o.kind as organisationKind',
        'm.role as role',
        'm.status as status',
      ])
      .where('m.user_profile_id', '=', profileId)
      .orderBy('o.name')
      .execute();
  }

  async listParticipants(profileId: string): Promise<MyParticipantRecord[]> {
    return this.db
      .selectFrom('identity.participants')
      .select(['id', 'organisation_id as organisationId', 'display_name as displayName'])
      .where('user_profile_id', '=', profileId)
      .where('archived_at', 'is', null)
      .execute();
  }
}
