import type { AuthPrincipal } from '@buddyclub/auth';
import type { MeResponse, UpdateMeBody } from '@buddyclub/shared-types';
import type { IdentityRepository, UserProfileRecord } from './repository.js';

/** Apps every registered account can use. Shared identity is the product rule (spec section 1). */
export const SHARED_APPS: MeResponse['apps'] = ['buddyclub', 'rally'];

function stringClaim(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Derives a display name from token metadata, mirroring the auth.users insert trigger. */
export function displayNameFromPrincipal(principal: AuthPrincipal): string {
  const candidate =
    stringClaim(principal.userMetadata, 'full_name') ??
    stringClaim(principal.userMetadata, 'name') ??
    principal.email?.split('@')[0] ??
    'Player';
  return candidate.slice(0, 120);
}

export function avatarUrlFromPrincipal(principal: AuthPrincipal): string | null {
  const url = stringClaim(principal.userMetadata, 'avatar_url');
  return url && /^https?:\/\//.test(url) ? url : null;
}

async function ensureProfileFor(
  repo: IdentityRepository,
  principal: AuthPrincipal,
): Promise<UserProfileRecord> {
  return (
    (await repo.findProfileByAuthUserId(principal.authUserId)) ??
    (await repo.ensureProfile({
      authUserId: principal.authUserId,
      displayName: displayNameFromPrincipal(principal),
      avatarUrl: avatarUrlFromPrincipal(principal),
    }))
  );
}

async function toMe(repo: IdentityRepository, profile: UserProfileRecord): Promise<MeResponse> {
  const [memberships, participants] = await Promise.all([
    repo.listMemberships(profile.id),
    repo.listParticipants(profile.id),
  ]);
  return {
    profile: {
      id: profile.id,
      authUserId: profile.authUserId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      locale: profile.locale,
    },
    memberships,
    participants,
    apps: SHARED_APPS,
  };
}

export async function getMe(
  repo: IdentityRepository,
  principal: AuthPrincipal,
): Promise<MeResponse> {
  return toMe(repo, await ensureProfileFor(repo, principal));
}

export async function updateMe(
  repo: IdentityRepository,
  principal: AuthPrincipal,
  body: UpdateMeBody,
): Promise<MeResponse> {
  const profile = await ensureProfileFor(repo, principal);
  const patch: { displayName?: string; locale?: string } = {};
  if (body.displayName !== undefined) patch.displayName = body.displayName;
  if (body.locale !== undefined) patch.locale = body.locale;
  return toMe(repo, await repo.updateProfile(profile.id, patch));
}
