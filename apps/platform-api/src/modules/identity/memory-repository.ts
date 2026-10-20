import { randomUUID } from 'node:crypto';
import type {
  EnsureProfileInput,
  IdentityRepository,
  MembershipRecord,
  MyParticipantRecord,
  UpdateProfileInput,
  UserProfileRecord,
} from './repository.js';

/**
 * In-memory implementation for contract tests and for local development without a database.
 * Never used in production (config refuses to start without DATABASE_URL there).
 */
export class MemoryIdentityRepository implements IdentityRepository {
  private readonly profiles = new Map<string, UserProfileRecord>();
  private readonly memberships = new Map<string, MembershipRecord[]>();
  private readonly participants = new Map<string, MyParticipantRecord[]>();

  seedProfile(input: Partial<UserProfileRecord> & { authUserId: string }): UserProfileRecord {
    const profile: UserProfileRecord = {
      id: input.id ?? randomUUID(),
      authUserId: input.authUserId,
      displayName: input.displayName ?? 'Seeded Player',
      avatarUrl: input.avatarUrl ?? null,
      locale: input.locale ?? 'en-GB',
    };
    this.profiles.set(profile.id, profile);
    return profile;
  }

  seedMembership(profileId: string, membership: MembershipRecord): void {
    const list = this.memberships.get(profileId) ?? [];
    list.push(membership);
    this.memberships.set(profileId, list);
  }

  seedParticipant(profileId: string, participant: MyParticipantRecord): void {
    const list = this.participants.get(profileId) ?? [];
    list.push(participant);
    this.participants.set(profileId, list);
  }

  async findProfileByAuthUserId(authUserId: string): Promise<UserProfileRecord | null> {
    for (const profile of this.profiles.values()) {
      if (profile.authUserId === authUserId) return { ...profile };
    }
    return null;
  }

  async ensureProfile(input: EnsureProfileInput): Promise<UserProfileRecord> {
    const existing = await this.findProfileByAuthUserId(input.authUserId);
    if (existing) return existing;
    return this.seedProfile({
      authUserId: input.authUserId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
    });
  }

  async updateProfile(profileId: string, input: UpdateProfileInput): Promise<UserProfileRecord> {
    const profile = this.profiles.get(profileId);
    if (!profile) throw new Error('profile not found');
    if (input.displayName !== undefined) profile.displayName = input.displayName;
    if (input.locale !== undefined) profile.locale = input.locale;
    return { ...profile };
  }

  async listMemberships(profileId: string): Promise<MembershipRecord[]> {
    return [...(this.memberships.get(profileId) ?? [])].sort((a, b) =>
      a.organisationName.localeCompare(b.organisationName),
    );
  }

  async listParticipants(profileId: string): Promise<MyParticipantRecord[]> {
    return [...(this.participants.get(profileId) ?? [])];
  }
}
