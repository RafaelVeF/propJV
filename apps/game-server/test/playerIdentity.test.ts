import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePlayerName } from '../src/utils/playerIdentity.js';

test('authenticated database username replaces the anonymous WebSocket fallback', () => {
    const name = resolvePlayerName({
        userId: 42,
        authenticatedName: 'CompteDB',
        playerId: 'ed4c1234-5678'
    });

    assert.equal(name, 'CompteDB');
});

test('authenticated database username takes precedence over a client supplied name', () => {
    const name = resolvePlayerName({
        userId: 42,
        authenticatedName: 'CompteDB',
        customName: 'PseudoClient',
        playerId: 'ed4c1234-5678'
    });

    assert.equal(name, 'CompteDB');
});

test('guests can use a custom lobby name and retain the generated fallback', () => {
    assert.equal(resolvePlayerName({
        userId: null,
        customName: 'Invité',
        playerId: 'ed4c1234-5678'
    }), 'Invité');
    assert.equal(resolvePlayerName({ userId: null, playerId: 'ed4c1234-5678' }), 'Player_ed4c');
});

test('logging out never reuses the previous authenticated username', () => {
    const nameAfterLogout = resolvePlayerName({
        userId: null,
        authenticatedName: 'CompteDB',
        playerId: 'ed4c1234-5678'
    });

    assert.equal(nameAfterLogout, 'Player_ed4c');
});
