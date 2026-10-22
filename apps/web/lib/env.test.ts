import { afterEach, describe, expect, it } from 'vitest';
import { productForHost, rallyOrigin } from './env';

const original = { ...process.env };

afterEach(() => {
  delete process.env['WEB_PRODUCT'];
  delete process.env['RALLY_HOST_PREFIX'];
  Object.assign(process.env, original);
});

describe('product switch (Addendum 1.4)', () => {
  it('serves Rally on every host by default', () => {
    expect(productForHost('buddy-club.com')).toBe('rally');
    expect(productForHost('rally.buddy-club.com')).toBe('rally');
    expect(productForHost(null)).toBe('rally');
    expect(rallyOrigin('buddy-club.com')).toBe('https://buddy-club.com');
    expect(rallyOrigin('localhost:3000')).toBe('http://localhost:3000');
  });

  it('can be pinned to the wider Buddy Club', () => {
    process.env['WEB_PRODUCT'] = 'buddyclub';
    expect(productForHost('rally.buddy-club.com')).toBe('buddyclub');
  });

  it('keeps hostname routing behind WEB_PRODUCT=host', () => {
    process.env['WEB_PRODUCT'] = 'host';
    expect(productForHost('buddy-club.com')).toBe('buddyclub');
    expect(productForHost('rally.buddy-club.com')).toBe('rally');
    expect(rallyOrigin('buddy-club.com')).toBe('https://rally.buddy-club.com');
    expect(rallyOrigin('rally.localhost:3000')).toBe('http://rally.localhost:3000');
    process.env['RALLY_HOST_PREFIX'] = 'rally-';
    expect(productForHost('rally-buddyclub-web.vercel.app')).toBe('rally');
    expect(rallyOrigin('buddyclub-web.vercel.app')).toBe('https://rally-buddyclub-web.vercel.app');
  });
});
