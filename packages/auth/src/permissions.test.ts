import { describe, expect, it } from 'vitest';
import { anyRoleAllows, ORG_ACTIONS, roleAllows } from './permissions';

describe('role permission matrix (spec section 6)', () => {
  it('lets org admins and directors configure rules but not organisers or players', () => {
    expect(roleAllows('org_admin', 'rules.configure')).toBe(true);
    expect(roleAllows('competition_director', 'rules.configure')).toBe(true);
    expect(roleAllows('session_organiser', 'rules.configure')).toBe(false);
    expect(roleAllows('participant', 'rules.configure')).toBe(false);
  });

  it('lets session organisers add guests and generate rotations', () => {
    expect(roleAllows('session_organiser', 'session.guest.add')).toBe(true);
    expect(roleAllows('session_organiser', 'session.rotation.generate')).toBe(true);
    expect(roleAllows('team_captain', 'session.guest.add')).toBe(false);
  });

  it('lets captains submit lineups and nobody below', () => {
    expect(roleAllows('team_captain', 'team.lineup.submit')).toBe(true);
    expect(roleAllows('participant', 'team.lineup.submit')).toBe(false);
  });

  it('never lets spectators do anything but view', () => {
    for (const action of ORG_ACTIONS) {
      expect(roleAllows('spectator', action)).toBe(
        ['schedule.view', 'organisation.view', 'session.view', 'competition.view'].includes(action),
      );
    }
  });

  it('combines multiple roles', () => {
    expect(anyRoleAllows(['participant', 'session_organiser'], 'session.guest.add')).toBe(true);
    expect(anyRoleAllows(['participant', 'spectator'], 'progression.approve')).toBe(false);
  });
});
