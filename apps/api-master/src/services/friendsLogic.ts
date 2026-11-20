import { z } from 'zod';
import type { FriendRelationshipStatus } from '@prop-hunt/shared';

export interface RelationshipRecord {
    user_relationship_id: number;
    user_id_1: number;
    user_id_2: number;
    status: FriendRelationshipStatus;
    created_by: number | null;
    modified_by: number | null;
}

export interface ValidationOutcome {
    ok: boolean;
    httpStatus?: number;
    message?: string;
}

/** Règles de validation pour une action ciblant un joueur par pseudo. */
export const friendUsernameSchema = z.object({
    username: z.string()
        .trim()
        .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères.")
        .max(30, "Le nom d'utilisateur ne peut pas dépasser 30 caractères.")
        .regex(/^[a-zA-Z0-9_-]+$/, "Format de nom d'utilisateur invalide.")
});

/**
 * Ordonne strictement deux identifiants utilisateurs pour respecter la contrainte SQL
 * CHECK (user_id_1 < user_id_2) de la table users_relationships.
 */
export function normalizeUserPair(userA: number, userB: number): [number, number] {
    if (userA === userB) {
        throw new Error('Impossible de former une relation avec soi-même.');
    }
    return userA < userB ? [userA, userB] : [userB, userA];
}

/** Parse un identifiant numérique positif issu d'un paramètre d'URL. */
export function parsePositiveIntId(raw: string | undefined): number | null {
    if (!raw || !/^\d+$/.test(raw)) {
        return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Vérifie si un utilisateur fait partie de la relation. */
export function isRelationshipParticipant(
    row: Pick<RelationshipRecord, 'user_id_1' | 'user_id_2'>,
    userId: number
): boolean {
    return row.user_id_1 === userId || row.user_id_2 === userId;
}

/** Retourne l'identifiant du bloqueur effectif (modified_by prioritaire, sinon created_by). */
export function getBlockerUserId(
    row: Pick<RelationshipRecord, 'created_by' | 'modified_by'>
): number | null {
    return row.modified_by ?? row.created_by;
}

/** Évalue le code HTTP et le message lorsqu'une relation existe déjà entre deux joueurs. */
export function evaluateExistingRelationship(
    existing: Pick<RelationshipRecord, 'status' | 'created_by'>,
    requesterId: number
): { httpStatus: number; message: string } {
    if (existing.status === 'ACCEPTED') {
        return { httpStatus: 409, message: "Vous êtes déjà ami avec ce joueur." };
    }
    if (existing.status === 'BLOCKED') {
        return { httpStatus: 403, message: "Impossible d'envoyer une demande à cet utilisateur." };
    }
    if (existing.created_by === requesterId) {
        return { httpStatus: 409, message: "Une demande d'ami est déjà en attente pour ce joueur." };
    }
    return {
        httpStatus: 409,
        message: "Ce joueur vous a déjà envoyé une demande d'ami. Acceptez-la dans vos demandes reçues."
    };
}

/** Vérifie qu'un utilisateur a le droit d'accepter une demande d'ami. */
export function validateAcceptRequest(
    row: Pick<RelationshipRecord, 'user_id_1' | 'user_id_2' | 'status' | 'created_by'>,
    currentUserId: number
): ValidationOutcome {
    if (!isRelationshipParticipant(row, currentUserId)) {
        return { ok: false, httpStatus: 403, message: "Vous n'êtes pas autorisé à modifier cette demande." };
    }
    if (row.status !== 'PENDING') {
        return { ok: false, httpStatus: 409, message: "Cette demande n'est plus en attente." };
    }
    if (row.created_by === currentUserId) {
        return { ok: false, httpStatus: 403, message: "Vous ne pouvez pas accepter votre propre demande d'ami." };
    }
    return { ok: true };
}

/** Vérifie qu'un utilisateur peut refuser une demande reçue ou annuler une demande envoyée. */
export function validateRejectRequest(
    row: Pick<RelationshipRecord, 'user_id_1' | 'user_id_2' | 'status'>,
    currentUserId: number
): ValidationOutcome {
    if (!isRelationshipParticipant(row, currentUserId)) {
        return { ok: false, httpStatus: 403, message: "Vous n'êtes pas autorisé à modifier cette demande." };
    }
    if (row.status !== 'PENDING') {
        return { ok: false, httpStatus: 409, message: "Cette demande n'est plus en attente." };
    }
    return { ok: true };
}

/** Vérifie qu'un utilisateur peut supprimer une relation (ami ou déblocage). */
export function validateDeleteRelationship(
    row: Pick<RelationshipRecord, 'user_id_1' | 'user_id_2' | 'status' | 'created_by' | 'modified_by'>,
    currentUserId: number
): ValidationOutcome {
    if (!isRelationshipParticipant(row, currentUserId)) {
        return { ok: false, httpStatus: 403, message: "Vous n'êtes pas autorisé à supprimer cette relation." };
    }
    if (row.status === 'BLOCKED' && getBlockerUserId(row) !== currentUserId) {
        return { ok: false, httpStatus: 403, message: "Vous ne pouvez pas lever un blocage imposé par un autre joueur." };
    }
    return { ok: true };
}
