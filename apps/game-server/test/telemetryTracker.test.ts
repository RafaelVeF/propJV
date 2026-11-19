import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchTelemetryTracker } from '../src/systems/telemetryTracker.js';

test('MatchTelemetryTracker : suivi des événements et barème exact des pièces (currencyEarned)', () => {
    const tracker = new MatchTelemetryTracker();
    tracker.startMatch('map_01_32p', [
        {
            playerId: 'p_hider',
            userId: 2,
            username: 'Hidertest',
            role: 'HIDER',
            initialProp: 'prop_can',
        },
        {
            playerId: 'p_seeker',
            userId: 3,
            username: 'Seekertest',
            role: 'SEEKER',
            seekerClass: 'seeker_recruit',
        },
        {
            playerId: 'p_afk',
            userId: 4,
            username: 'AfkGuest',
            role: 'SEEKER',
            seekerClass: 'seeker_recruit',
        },
    ]);

    // Simule un début de manche il y a 60 secondes pour tester les tranches de 15s
    (tracker as unknown as { startTimeMs: number }).startTimeMs = Date.now() - 60_000;

    tracker.recordTransform('p_hider', 'prop_chair', 120);
    // 4 taunts utilisés (plafonné à 3 pour les pièces = +15 max)
    tracker.recordTaunt('p_hider', 'taunt_chicken', 80);
    tracker.recordTaunt('p_hider', 'taunt_whistle', 75);
    tracker.recordTaunt('p_hider', 'taunt_evil_laugh', 70);
    tracker.recordTaunt('p_hider', 'taunt_chicken', 65);

    tracker.recordShot('p_seeker');
    tracker.recordShot('p_seeker');
    tracker.recordHit('p_seeker', 'p_hider', 20, true, 40);

    const report = tracker.finalizeMatch('HIDER', 'srv-test-01');
    assert.ok(report, 'Le rapport final doit être généré');
    assert.equal(report.winningTeam, 'HIDER');
    assert.equal(report.events.length, 6); // 1 transform + 4 taunts + 1 hit

    const hider = report.players.find((p) => p.playerId === 'p_hider')!;
    const seeker = report.players.find((p) => p.playerId === 'p_seeker')!;

    // HIDER (gagnant, 60s survie = 4 tranches, 4 taunts -> cap 3 = +15, survivant = +10) :
    // 10 (participation) + 25 (victoire) + 4 (survie) + 15 (taunts) + 10 (survie finale) = 64
    assert.equal(hider.survived, true);
    assert.equal(hider.transformationsCount, 1);
    assert.equal(hider.finalProp, 'prop_chair');
    assert.deepEqual(hider.propsUsed, ['prop_can', 'prop_chair']);
    assert.equal(hider.tauntsUsed, 4);
    assert.equal(hider.currencyEarned, 64);

    // SEEKER (perdant, 0 élimination, 1 prop détruit = +2) :
    // 10 (participation) + 0 (défaite) + 0 (elims) + 2 (prop détruit) = 12
    assert.equal(seeker.shotsFired, 2);
    assert.equal(seeker.shotsHit, 1);
    assert.equal(seeker.propsDestroyed, 1);
    assert.equal(seeker.currencyEarned, 12);
});
