import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { GamePhase, PlayerRole } from '@prop-hunt/shared';
import { RoundManager } from '../src/RoundManager.js';

describe('RoundManager - Gestion du Salon et Cycle de Manche Autoritaire', () => {

  it('1. Gestion des joueurs et attribution du rôle d\'hôte', () => {
    const rm = new RoundManager({}, { autoStartTimer: false, minPlayers: 2 });

    rm.addPlayer('p1', 'Alice');
    rm.addPlayer('p2', 'Bob');

    assert.strictEqual(rm.players.size, 2);
    assert.strictEqual(rm.players.get('p1')?.isHost, true, 'Le premier joueur doit être l\'hôte');
    assert.strictEqual(rm.players.get('p2')?.isHost, false, 'Le second joueur ne doit pas être l\'hôte');
    assert.strictEqual(rm.players.get('p1')?.isReady, false, 'Le joueur commence non-prêt');

    // Départ de l'hôte -> promotion du second
    rm.removePlayer('p1');
    assert.strictEqual(rm.players.size, 1);
    assert.strictEqual(rm.players.get('p2')?.isHost, true, 'Le joueur restant devient hôte');
  });

  it('2. Bascule du statut Prêt et déclenchement du compte à rebours', () => {
    let countdownStartedWith: number | null = null;
    let countdownCancelled = false;

    const rm = new RoundManager({
      onCountdownStarted: (sec) => { countdownStartedWith = sec; },
      onCountdownCancelled: () => { countdownCancelled = true; }
    }, { autoStartTimer: false, minPlayers: 2, countdownDuration: 5 });

    rm.addPlayer('p1', 'Alice');
    rm.addPlayer('p2', 'Bob');

    assert.strictEqual(rm.canStartGame(), false);

    // Alice est prête
    rm.toggleReady('p1');
    assert.strictEqual(rm.canStartGame(), false);
    assert.strictEqual(rm.getPhase(), GamePhase.LOBBY);

    // Bob est prêt -> tout le monde est prêt !
    rm.toggleReady('p2');
    assert.strictEqual(rm.canStartGame(), true);
    assert.strictEqual(rm.getPhase(), GamePhase.COUNTDOWN);
    assert.strictEqual(countdownStartedWith, 5);

    // Alice annule son état prêt pendant le décompte -> annulation
    rm.toggleReady('p1');
    assert.strictEqual(rm.getPhase(), GamePhase.LOBBY);
    assert.strictEqual(countdownCancelled, true);
  });

  it('3. Répartition équitable 50% Hunters / 50% Props', () => {
    const rm = new RoundManager({}, { autoStartTimer: false });

    // Test avec 2 joueurs (1 Hunter, 1 Prop)
    rm.addPlayer('p1', 'Alice');
    rm.addPlayer('p2', 'Bob');
    let assignments = rm.assignRoles();

    const roles2 = Array.from(assignments.values());
    const hunters2 = roles2.filter(r => r === PlayerRole.HUNTER).length;
    const props2 = roles2.filter(r => r === PlayerRole.PROP).length;
    assert.strictEqual(hunters2, 1);
    assert.strictEqual(props2, 1);

    // Test avec 4 joueurs (2 Hunters, 2 Props)
    rm.addPlayer('p3', 'Charlie');
    rm.addPlayer('p4', 'David');
    assignments = rm.assignRoles();

    const roles4 = Array.from(assignments.values());
    const hunters4 = roles4.filter(r => r === PlayerRole.HUNTER).length;
    const props4 = roles4.filter(r => r === PlayerRole.PROP).length;
    assert.strictEqual(hunters4, 2, '50% de Hunters sur 4 joueurs');
    assert.strictEqual(props4, 2, '50% de Props sur 4 joueurs');
  });

  it('4. Règles autoritaires pendant la phase HIDING (Cachette 30s)', () => {
    const rm = new RoundManager({}, {
      autoStartTimer: false,
      countdownDuration: 2,
      hidingDuration: 30,
      huntingDuration: 210
    });

    rm.addPlayer('p1', 'Hunter1');
    rm.addPlayer('p2', 'Prop1');

    // Force manuelle des rôles pour le test
    rm.players.get('p1')!.role = PlayerRole.HUNTER;
    rm.players.get('p2')!.role = PlayerRole.PROP;

    // Prêts et passage en countdown
    rm.toggleReady('p1');
    rm.toggleReady('p2');
    assert.strictEqual(rm.getPhase(), GamePhase.COUNTDOWN);

    // Écoulement du countdown (2 secondes)
    rm.tick();
    rm.tick();
    assert.strictEqual(rm.getPhase(), GamePhase.HIDING, 'Doit basculer en HIDING');
    assert.strictEqual(rm.getTimeRemaining(), 30, 'Le timer doit être à 30 secondes');

    // RÈGLES STRICTES DE CACHETTE :
    // Hunter 1 ne peut ni bouger ni tirer
    const hunterId = Array.from(rm.players.values()).find(p => p.role === PlayerRole.HUNTER)!.id;
    const propId = Array.from(rm.players.values()).find(p => p.role === PlayerRole.PROP)!.id;

    assert.strictEqual(rm.canPlayerMove(hunterId), false, 'Le Hunter doit être strictement immobilisé');
    assert.strictEqual(rm.canPlayerShoot(hunterId), false, 'Le Hunter ne doit pas pouvoir tirer en phase de cachette');

    // Le Prop peut bouger pour se cacher
    assert.strictEqual(rm.canPlayerMove(propId), true, 'Le Prop peut se déplacer librement');

    // Écoulement des 30 secondes de cachette
    for (let i = 0; i < 30; i++) {
      rm.tick();
    }

    assert.strictEqual(rm.getPhase(), GamePhase.HUNTING, 'Doit basculer en HUNTING après 30s');
    assert.strictEqual(rm.getTimeRemaining(), 210, '3min30s de traque (total 4min)');

    // En phase HUNTING, le Hunter est libéré et peut tirer
    assert.strictEqual(rm.canPlayerMove(hunterId), true, 'Le Hunter est libéré');
    assert.strictEqual(rm.canPlayerShoot(hunterId), true, 'Le Hunter a désormais le droit de tirer');
  });

  it('5. Condition de victoire : Élimination de tous les Props (Victoire Hunters)', () => {
    let roundResult: any = null;
    const rm = new RoundManager({
      onRoundEnded: (res) => { roundResult = res; }
    }, {
      autoStartTimer: false,
      hidingDuration: 1,
      huntingDuration: 100
    });

    rm.addPlayer('hunter1', 'Hunter');
    rm.addPlayer('prop1', 'Prop');

    rm.startRound();
    // Forcer le rôle
    rm.players.get('hunter1')!.role = PlayerRole.HUNTER;
    rm.players.get('prop1')!.role = PlayerRole.PROP;

    // Fin de la cachette (1s)
    rm.tick();
    assert.strictEqual(rm.getPhase(), GamePhase.HUNTING);

    // Le Hunter élimine le dernier Prop
    rm.handlePlayerDeath('prop1', 'hunter1');

    assert.strictEqual(rm.getPhase(), GamePhase.ROUND_END);
    assert.strictEqual(roundResult.winner, PlayerRole.HUNTER);
    assert.strictEqual(roundResult.reason, 'ALL_PROPS_ELIMINATED');
    assert.strictEqual(rm.players.get('hunter1')!.score >= 250, true, 'Le vainqueur reçoit les points de victoire');
  });

  it('6. Condition de victoire : Temps écoulé (Victoire Props)', () => {
    let roundResult: any = null;
    const rm = new RoundManager({
      onRoundEnded: (res) => { roundResult = res; }
    }, {
      autoStartTimer: false,
      hidingDuration: 1,
      huntingDuration: 3 // 3 secondes de chasse pour le test
    });

    rm.addPlayer('hunter1', 'Hunter');
    rm.addPlayer('prop1', 'Prop');

    rm.startRound();
    rm.players.get('hunter1')!.role = PlayerRole.HUNTER;
    rm.players.get('prop1')!.role = PlayerRole.PROP;

    // Cachette
    rm.tick();
    assert.strictEqual(rm.getPhase(), GamePhase.HUNTING);

    // Chasse : écoulement des 3 secondes sans qu'aucun prop ne meure
    rm.tick();
    rm.tick();
    rm.tick();

    assert.strictEqual(rm.getPhase(), GamePhase.ROUND_END);
    assert.strictEqual(roundResult.winner, PlayerRole.PROP);
    assert.strictEqual(roundResult.reason, 'TIME_EXPIRED');
  });

  it('7. Fin de round et retour au salon', () => {
    const rm = new RoundManager({}, {
      autoStartTimer: false,
      roundEndDuration: 2
    });

    rm.addPlayer('p1', 'Alice');
    rm.addPlayer('p2', 'Bob');

    // On termine un round manuellement
    rm.endRound(PlayerRole.PROP, 'TIME_EXPIRED');
    assert.strictEqual(rm.getPhase(), GamePhase.ROUND_END);

    // Écoulement des 2 secondes d'affichage des scores
    rm.tick();
    rm.tick();

    assert.strictEqual(rm.getPhase(), GamePhase.LOBBY, 'Doit être revenu au LOBBY');
    assert.strictEqual(rm.players.get('p1')?.isReady, false, 'Les statuts Prêt sont réinitialisés');
    assert.strictEqual(rm.players.get('p2')?.isReady, false);
  });

});

