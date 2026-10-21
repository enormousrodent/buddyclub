import type { AuthPrincipal } from '@buddyclub/auth';
import type { MembershipStatus, Role } from '@buddyclub/shared-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { IdentityRepository } from '../modules/identity/repository.js';
import { avatarUrlFromPrincipal, displayNameFromPrincipal } from '../modules/identity/service.js';

/** The signed-in person as the platform knows them: profile plus organisation roles. */
export interface Actor {
  profileId: string;
  authUserId: string;
  displayName: string;
  memberships: ReadonlyMap<string, { role: Role; status: MembershipStatus }>;
  /** Series this person hosts (Addendum 1.2): may set up and run any of their nights. */
  hostedSeries: ReadonlySet<string>;
}

export class ActorService {
  constructor(private readonly identity: IdentityRepository) {}

  async resolve(principal: AuthPrincipal): Promise<Actor> {
    const profile =
      (await this.identity.findProfileByAuthUserId(principal.authUserId)) ??
      (await this.identity.ensureProfile({
        authUserId: principal.authUserId,
        displayName: displayNameFromPrincipal(principal),
        avatarUrl: avatarUrlFromPrincipal(principal),
      }));
    const [membershipRows, hosted] = await Promise.all([
      this.identity.listMemberships(profile.id),
      this.identity.listHostedSeries(profile.id),
    ]);
    const memberships = new Map<string, { role: Role; status: MembershipStatus }>();
    for (const m of membershipRows) {
      memberships.set(m.organisationId, { role: m.role, status: m.status });
    }
    return {
      profileId: profile.id,
      authUserId: profile.authUserId,
      displayName: profile.displayName,
      memberships,
      hostedSeries: new Set(hosted),
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved by `requireActor`. Null on public and guest routes. */
    actor: Actor | null;
  }
  interface FastifyInstance {
    /** preHandler: requires a valid user token and resolves the actor (profile + roles). */
    requireActor: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler: resolves the actor when a bearer token is present; anonymous otherwise. */
    optionalActor: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface ActorPluginOptions {
  actorService: ActorService;
}

export const actorPlugin = fp<ActorPluginOptions>(
  async (app, options) => {
    app.decorateRequest('actor', null);
    app.decorate('requireActor', async (request: FastifyRequest, reply: FastifyReply) => {
      await app.requireAuth(request, reply);
      if (reply.sent) return;
      request.actor = await options.actorService.resolve(request.principal!);
    });
    app.decorate('optionalActor', async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.headers.authorization) return;
      await app.requireAuth(request, reply);
      if (reply.sent) return;
      request.actor = await options.actorService.resolve(request.principal!);
    });
  },
  { name: 'buddyclub-actor', dependencies: ['buddyclub-auth'], fastify: '5.x' },
);
