import type { MembershipStatus, Role } from '@buddyclub/shared-types';

export interface UserProfileRecord {
  id: string;
  authUserId: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
}

export interface MembershipRecord {
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
  organisationKind: 'club' | 'personal';
  role: Role;
  status: MembershipStatus;
}

export interface MyParticipantRecord {
  id: string;
  organisationId: string;
  displayName: string;
}

export interface EnsureProfileInput {
  authUserId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface UpdateProfileInput {
  displayName?: string;
  locale?: string;
  avatarUrl?: string | null;
}

/** Persistence port for the identity module. Implemented by Postgres (prod) and memory (tests). */
export interface IdentityRepository {
  findProfileByAuthUserId(authUserId: string): Promise<UserProfileRecord | null>;
  /** Idempotent: returns the existing profile when one already exists for the auth user. */
  ensureProfile(input: EnsureProfileInput): Promise<UserProfileRecord>;
  updateProfile(profileId: string, input: UpdateProfileInput): Promise<UserProfileRecord>;
  listMemberships(profileId: string): Promise<MembershipRecord[]>;
  listParticipants(profileId: string): Promise<MyParticipantRecord[]>;
  /** Session series the profile hosts and whose host switch is on (Addendum 1.2). */
  listHostedSeries(profileId: string): Promise<string[]>;
}
