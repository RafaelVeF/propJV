import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    evaluateExistingRelationship,
    friendUsernameSchema,
    getBlockerUserId,
    isRelationshipParticipant,
    normalizeUserPair,
    parsePositiveIntId,
    validateAcceptRequest,
    validateDeleteRelationship,
    validateRejectRequest
} from '../src/services/friendsLogic.js';

describe('Système d\'amis - Logique métier et validation', () => {
    it('1. normalizeUserPair garantit toujours user_id_1 < user_id_2', () => {
        assert.deepStrictEqual(normalizeUserPair(10, 2), [2, 10]);
        assert.deepStrictEqual(normalizeUserPair(2, 10), [2, 10]);
        assert.throws(() => normalizeUserPair(5, 5), /soi-même/);
    });

    it('2. parsePositiveIntId accepte uniquement des entiers positifs stricts', () => {
        assert.strictEqual(parsePositiveIntId('42'), 42);
        assert.strictEqual(parsePositiveIntId('0'), null);
        assert.strictEqual(parsePositiveIntId('-3'), null);
        assert.strictEqual(parsePositiveIntId('12abc'), null);
        assert.strictEqual(parsePositiveIntId(''), null);
        assert.strictEqual(parsePositiveIntId(undefined), null);
    });

    it('3. friendUsernameSchema valide et rejette les pseudos correctement', () => {
        const ok = friendUsernameSchema.safeParse({ username: '  Florent_01  ' });
        assert.strictEqual(ok.success, true);
        if (ok.success) {
            assert.strictEqual(ok.data.username, 'Florent_01');
        }

        assert.strictEqual(friendUsernameSchema.safeParse({ username: 'ab' }).success, false);
        assert.strictEqual(friendUsernameSchema.safeParse({ username: 'bad user!' }).success, false);
        assert.strictEqual(friendUsernameSchema.safeParse({ username: '<script>' }).success, false);
    });

    it('4. isRelationshipParticipant vérifie l\'appartenance à la paire', () => {
        const pair = { user_id_1: 2, user_id_2: 7 };
        assert.strictEqual(isRelationshipParticipant(pair, 2), true);
        assert.strictEqual(isRelationshipParticipant(pair, 7), true);
        assert.strictEqual(isRelationshipParticipant(pair, 9), false);
    });

    it('5. evaluateExistingRelationship distingue ACCEPTED, BLOCKED et PENDING entrant/sortant', () => {
        assert.strictEqual(
            evaluateExistingRelationship({ status: 'ACCEPTED', created_by: 1 }, 2).httpStatus,
            409
        );
        assert.strictEqual(
            evaluateExistingRelationship({ status: 'BLOCKED', created_by: 1 }, 2).httpStatus,
            403
        );

        const outgoing = evaluateExistingRelationship({ status: 'PENDING', created_by: 2 }, 2);
        assert.strictEqual(outgoing.httpStatus, 409);
        assert.match(outgoing.message, /déjà en attente/i);

        const incoming = evaluateExistingRelationship({ status: 'PENDING', created_by: 5 }, 2);
        assert.strictEqual(incoming.httpStatus, 409);
        assert.match(incoming.message, /demandes reçues/i);
    });

    it('6. validateAcceptRequest autorise uniquement le destinataire d\'une demande PENDING', () => {
        const pendingFrom2To5 = { user_id_1: 2, user_id_2: 5, status: 'PENDING' as const, created_by: 2 };

        assert.strictEqual(validateAcceptRequest(pendingFrom2To5, 5).ok, true);

        const selfAccept = validateAcceptRequest(pendingFrom2To5, 2);
        assert.strictEqual(selfAccept.ok, false);
        assert.strictEqual(selfAccept.httpStatus, 403);

        const outsider = validateAcceptRequest(pendingFrom2To5, 99);
        assert.strictEqual(outsider.ok, false);
        assert.strictEqual(outsider.httpStatus, 403);

        const alreadyAccepted = validateAcceptRequest(
            { ...pendingFrom2To5, status: 'ACCEPTED' },
            5
        );
        assert.strictEqual(alreadyAccepted.ok, false);
        assert.strictEqual(alreadyAccepted.httpStatus, 409);
    });

    it('7. validateRejectRequest permet au destinataire de refuser et à l\'expéditeur d\'annuler', () => {
        const pending = { user_id_1: 2, user_id_2: 5, status: 'PENDING' as const };
        assert.strictEqual(validateRejectRequest(pending, 2).ok, true);
        assert.strictEqual(validateRejectRequest(pending, 5).ok, true);
        assert.strictEqual(validateRejectRequest(pending, 8).ok, false);
        assert.strictEqual(validateRejectRequest({ ...pending, status: 'ACCEPTED' }, 5).ok, false);
    });

    it('8. validateDeleteRelationship protège le déblocage contre l\'utilisateur bloqué', () => {
        const accepted = {
            user_id_1: 2,
            user_id_2: 5,
            status: 'ACCEPTED' as const,
            created_by: 2,
            modified_by: 5
        };
        assert.strictEqual(validateDeleteRelationship(accepted, 2).ok, true);
        assert.strictEqual(validateDeleteRelationship(accepted, 5).ok, true);
        assert.strictEqual(validateDeleteRelationship(accepted, 9).ok, false);

        const blockedBy2 = {
            user_id_1: 2,
            user_id_2: 5,
            status: 'BLOCKED' as const,
            created_by: 5,
            modified_by: 2
        };
        assert.strictEqual(getBlockerUserId(blockedBy2), 2);
        assert.strictEqual(validateDeleteRelationship(blockedBy2, 2).ok, true);
        assert.strictEqual(validateDeleteRelationship(blockedBy2, 5).ok, false);
    });
});
