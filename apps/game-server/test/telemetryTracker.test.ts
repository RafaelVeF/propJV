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

test('MatchTelemetryTracker : partie courte de test (< 1s) génère un rapport complet avec récompenses', () => {
    const tracker = new MatchTelemetryTracker();
    tracker.startMatch('map_01_32p', [
        {
            playerId: 'p1',
            userId: 10,
            username: 'PlayerHider',
            role: 'HIDER',
            initialProp: 'prop_human',
        },
        {
            playerId: 'p2',
            userId: 11,
            username: 'PlayerSeeker',
            role: 'SEEKER',
            seekerClass: 'seeker_recruit',
        },
    ]);

    const report = tracker.finalizeMatch('HIDER', 'srv-test-short');
    assert.ok(report, 'Le rapport doit être généré même sur une manche < 1s');
    assert.ok(report.durationSec >= 1, 'durationSec doit valoir au moins 1s');

    const hider = report.players.find((p) => p.playerId === 'p1')!;
    const seeker = report.players.find((p) => p.playerId === 'p2')!;

    // Hider gagnant + survivant : 10 (participation) + 25 (victoire) + 10 (survie finale) = 45
    assert.equal(hider.currencyEarned, 45);
    // Seeker perdant : 10 (participation)
    assert.equal(seeker.currencyEarned, 10);
});

test('MatchTelemetryTracker : session Freeplay suit et finalise correctement les métamorphoses et sifflements', () => {
    const tracker = new MatchTelemetryTracker();
    // Démarrage de la session Freeplay
    tracker.startMatch('map_01_32p', [
        {
            playerId: 'freeplay_p1',
            userId: 50,
            username: 'FreeplayExplorer',
            role: 'HIDER',
            initialProp: 'prop_can'
        }
    ]);

    assert.equal(tracker.isActive(), true, 'Le tracker doit être actif en mode Freeplay');

    // Ajout d'un 2e joueur en cours de session (registerPlayer)
    tracker.registerPlayer({
        playerId: 'freeplay_p2',
        userId: 51,
        username: 'FreeplayFriend',
        role: 'HIDER',
        initialProp: 'prop_chair'
    });

    // Enregistrement des métamorphoses et railleries
    tracker.recordTransform('freeplay_p1', 'prop_chair', null);
    tracker.recordTransform('freeplay_p1', 'prop_desk', null);
    tracker.recordTaunt('freeplay_p1', 'taunt_chicken', null);

    // Finalisation de la session Freeplay (DRAW)
    const report = tracker.finalizeMatch('DRAW', 'srv-freeplay');
    assert.ok(report, 'Le rapport Freeplay doit être généré');
    assert.equal(report.winningTeam, 'DRAW');
    assert.equal(report.players.length, 2);

    const p1 = report.players.find((p) => p.playerId === 'freeplay_p1')!;
    assert.equal(p1.transformationsCount, 2);
    assert.equal(p1.tauntsUsed, 1);
    assert.equal(p1.finalProp, 'prop_desk');
});
