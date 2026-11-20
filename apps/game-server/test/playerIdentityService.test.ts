import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAuthenticatedPlayerIdentity } from '../src/services/playerIdentityService.js';

test('player identity comes from the authenticated API profile', async () => {
    let requestedUrl = '';
    let authorization = '';
    const identity = await fetchAuthenticatedPlayerIdentity(
        'signed.jwt.token',
        'http://localhost:3000/',
        async (input, init) => {
            requestedUrl = String(input);
            authorization = new Headers(init?.headers).get('Authorization') ?? '';
            return new Response(JSON.stringify({
                success: true,
                user: { userId: 57, username: 'NomDepuisLaBase' }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
    );

    assert.equal(requestedUrl, 'http://localhost:3000/api/auth/me');
    assert.equal(authorization, 'Bearer signed.jwt.token');
    assert.deepEqual(identity, { userId: 57, username: 'NomDepuisLaBase' });
});

test('invalid API sessions do not produce an authenticated lobby identity', async () => {
    const identity = await fetchAuthenticatedPlayerIdentity(
        'invalid.jwt.token',
        'http://localhost:3000',
        async () => new Response(JSON.stringify({ success: false }), { status: 403 })
    );

    assert.equal(identity, null);
});
