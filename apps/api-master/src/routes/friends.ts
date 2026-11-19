import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import type {
    FriendEntry,
    FriendRelationshipStatus,
    FriendRequestEntry,
    FriendsOverviewResponse
} from '@prop-hunt/shared';
import { pool } from '../db.js';
import { requireAuth, AuthRequest } from '../middlewares/requireAuth.js';
import {
    evaluateExistingRelationship,
    friendUsernameSchema,
    getBlockerUserId,
    normalizeUserPair,
    parsePositiveIntId,
    validateAcceptRequest,
    validateDeleteRelationship,
    validateRejectRequest,
    type ValidationOutcome
} from '../services/friendsLogic.js';

const router: Router = Router();

const friendsActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { success: false, message: "Trop d'actions sur les amis, réessayez dans quelques minutes." }
});

interface RelationshipJoinedRow extends RowDataPacket {
    user_relationship_id: number;
    user_id_1: number;
    user_id_2: number;
    status: FriendRelationshipStatus;
    created_by: number | null;
    modified_by: number | null;
    creation_date: Date;
    modification_date: Date | null;
    other_user_id: number;
    other_username: string;
    other_last_connection: Date | null;
}

interface RelationshipRow extends RowDataPacket {
    user_relationship_id: number;
    user_id_1: number;
    user_id_2: number;
    status: FriendRelationshipStatus;
    created_by: number | null;
    modified_by: number | null;
}

interface TargetUserRow extends RowDataPacket {
    user_id: number;
    username: string;
}

interface TargetContext {
    currentUserId: number;
    target: TargetUserRow;
    userId1: number;
    userId2: number;
    existing: RelationshipRow | null;
}

interface RelationshipContext {
    currentUserId: number;
    relationshipId: number;
    relationship: RelationshipRow;
}

function requireUserId(req: AuthRequest, res: Response): number | null {
    const payload = req.user as { userId?: unknown } | undefined;
    if (!payload || typeof payload.userId !== 'number' || !Number.isSafeInteger(payload.userId)) {
        res.status(401).json({ success: false, message: 'Session invalide.' });
        return null;
    }
    return payload.userId;
}

function handleFriendsError(res: Response, error: unknown, context: string): void {
    if (error instanceof z.ZodError) {
        const firstMessage = error.issues[0]?.message || 'Format de données invalide.';
        res.status(400).json({
            success: false,
            message: firstMessage,
            errors: error.issues
        });
        return;
    }

    console.error(`Erreur amis (${context}) :`, error);
    res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur.'
    });
}

async function resolveTargetContext(
    req: AuthRequest,
    res: Response,
    selfErrorMessage: string
): Promise<TargetContext | null> {
    const currentUserId = requireUserId(req, res);
    if (!currentUserId) return null;

    const { username } = friendUsernameSchema.parse(req.body);
    const [targetRows] = await pool.query<TargetUserRow[]>(
        'SELECT user_id, username FROM users WHERE username = ? LIMIT 1',
        [username]
    );

    if (targetRows.length === 0) {
        res.status(404).json({ success: false, message: 'Aucun joueur trouvé avec ce pseudo.' });
        return null;
    }

    const target = targetRows[0];
    if (target.user_id === currentUserId) {
        res.status(400).json({ success: false, message: selfErrorMessage });
        return null;
    }

    const [userId1, userId2] = normalizeUserPair(currentUserId, target.user_id);
    const [existingRows] = await pool.query<RelationshipRow[]>(
        `SELECT user_relationship_id, user_id_1, user_id_2, status, created_by, modified_by
         FROM users_relationships
         WHERE user_id_1 = ? AND user_id_2 = ?
         LIMIT 1`,
        [userId1, userId2]
    );

    return {
        currentUserId,
        target,
        userId1,
        userId2,
        existing: existingRows[0] ?? null
    };
}

async function resolveRelationshipContext(
    req: AuthRequest,
    res: Response,
    notFoundMessage: string,
    validator: (row: RelationshipRow, userId: number) => ValidationOutcome
): Promise<RelationshipContext | null> {
    const currentUserId = requireUserId(req, res);
    if (!currentUserId) return null;

    const rawId = req.params.relationshipId;
    const relationshipId = parsePositiveIntId(Array.isArray(rawId) ? rawId[0] : rawId);
    if (!relationshipId) {
        res.status(400).json({ success: false, message: 'Identifiant de relation invalide.' });
        return null;
    }

    const [rows] = await pool.query<RelationshipRow[]>(
        `SELECT user_relationship_id, user_id_1, user_id_2, status, created_by, modified_by
         FROM users_relationships
         WHERE user_relationship_id = ?
         LIMIT 1`,
        [relationshipId]
    );

    const relationship = rows[0];
    if (!relationship) {
        res.status(404).json({ success: false, message: notFoundMessage });
        return null;
    }

    const check = validator(relationship, currentUserId);
    if (!check.ok) {
        res.status(check.httpStatus ?? 403).json({ success: false, message: check.message });
        return null;
    }

    return { currentUserId, relationshipId, relationship };
}

// Toutes les routes /api/friends nécessitent un JWT valide
router.use(requireAuth);

// GET / : Liste des amis, demandes reçues, demandes envoyées et utilisateurs bloqués
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const currentUserId = requireUserId(req, res);
        if (!currentUserId) return;

        const [rows] = await pool.query<RelationshipJoinedRow[]>(
            `SELECT
                r.user_relationship_id,
                r.user_id_1,
                r.user_id_2,
                r.status,
                r.created_by,
                r.modified_by,
                r.creation_date,
                r.modification_date,
                u.user_id AS other_user_id,
                u.username AS other_username,
                u.last_connection AS other_last_connection
             FROM users_relationships r
             INNER JOIN users u
               ON u.user_id = CASE WHEN r.user_id_1 = ? THEN r.user_id_2 ELSE r.user_id_1 END
             WHERE r.user_id_1 = ? OR r.user_id_2 = ?
             ORDER BY u.username ASC`,
            [currentUserId, currentUserId, currentUserId]
        );

        const friends: FriendEntry[] = [];
        const incomingRequests: FriendRequestEntry[] = [];
        const outgoingRequests: FriendRequestEntry[] = [];
        const blockedUsers: FriendEntry[] = [];

        for (const row of rows) {
            if (row.status === 'ACCEPTED') {
                friends.push({
                    relationshipId: row.user_relationship_id,
                    userId: row.other_user_id,
                    username: row.other_username,
                    lastConnection: row.other_last_connection,
                    since: row.modification_date ?? row.creation_date
                });
            } else if (row.status === 'PENDING') {
                const isOutgoing = row.created_by === currentUserId;
                const entry: FriendRequestEntry = {
                    relationshipId: row.user_relationship_id,
                    userId: row.other_user_id,
                    username: row.other_username,
                    direction: isOutgoing ? 'OUTGOING' : 'INCOMING',
                    createdAt: row.creation_date
                };
                if (isOutgoing) {
                    outgoingRequests.push(entry);
                } else {
                    incomingRequests.push(entry);
                }
            } else if (row.status === 'BLOCKED' && getBlockerUserId(row) === currentUserId) {
                blockedUsers.push({
                    relationshipId: row.user_relationship_id,
                    userId: row.other_user_id,
                    username: row.other_username,
                    since: row.modification_date ?? row.creation_date
                });
            }
        }

        const payload: FriendsOverviewResponse = {
            success: true,
            friends,
            incomingRequests,
            outgoingRequests,
            blockedUsers
        };
        res.json(payload);
    } catch (error) {
        handleFriendsError(res, error, 'GET /');
    }
});

// POST /request : Envoyer une demande d'ami par pseudo
router.post('/request', friendsActionLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const ctx = await resolveTargetContext(
            req,
            res,
            'Vous ne pouvez pas vous ajouter vous-même en ami.'
        );
        if (!ctx) return;

        if (ctx.existing) {
            const conflict = evaluateExistingRelationship(ctx.existing, ctx.currentUserId);
            res.status(conflict.httpStatus).json({ success: false, message: conflict.message });
            return;
        }

        const [insertResult] = await pool.query<ResultSetHeader>(
            `INSERT INTO users_relationships (user_id_1, user_id_2, status, created_by)
             VALUES (?, ?, 'PENDING', ?)`,
            [ctx.userId1, ctx.userId2, ctx.currentUserId]
        );

        res.status(201).json({
            success: true,
            message: `Demande d'ami envoyée à ${ctx.target.username}.`,
            relationshipId: insertResult.insertId,
            status: 'PENDING'
        });
    } catch (error) {
        handleFriendsError(res, error, 'POST /request');
    }
});

// POST /:relationshipId/accept : Accepter une demande d'ami reçue
router.post('/:relationshipId/accept', friendsActionLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const ctx = await resolveRelationshipContext(
            req,
            res,
            "Demande d'ami introuvable.",
            validateAcceptRequest
        );
        if (!ctx) return;

        await pool.query(
            `UPDATE users_relationships
             SET status = 'ACCEPTED', modified_by = ?
             WHERE user_relationship_id = ?`,
            [ctx.currentUserId, ctx.relationshipId]
        );

        res.json({
            success: true,
            message: "Demande d'ami acceptée.",
            relationshipId: ctx.relationshipId,
            status: 'ACCEPTED'
        });
    } catch (error) {
        handleFriendsError(res, error, 'POST /:relationshipId/accept');
    }
});

// POST /:relationshipId/reject : Refuser une demande reçue ou annuler une demande envoyée
router.post('/:relationshipId/reject', friendsActionLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const ctx = await resolveRelationshipContext(
            req,
            res,
            "Demande d'ami introuvable.",
            validateRejectRequest
        );
        if (!ctx) return;

        await pool.query(
            'DELETE FROM users_relationships WHERE user_relationship_id = ?',
            [ctx.relationshipId]
        );

        const isOutgoing = ctx.relationship.created_by === ctx.currentUserId;
        res.json({
            success: true,
            message: isOutgoing ? "Demande d'ami annulée." : "Demande d'ami refusée.",
            relationshipId: ctx.relationshipId
        });
    } catch (error) {
        handleFriendsError(res, error, 'POST /:relationshipId/reject');
    }
});

// POST /block : Bloquer un joueur par pseudo
router.post('/block', friendsActionLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const ctx = await resolveTargetContext(
            req,
            res,
            'Vous ne pouvez pas vous bloquer vous-même.'
        );
        if (!ctx) return;

        if (ctx.existing) {
            if (ctx.existing.status === 'BLOCKED' && getBlockerUserId(ctx.existing) === ctx.currentUserId) {
                res.status(409).json({ success: false, message: 'Cet utilisateur est déjà bloqué.' });
                return;
            }
            if (ctx.existing.status === 'BLOCKED') {
                res.status(403).json({ success: false, message: 'Action impossible sur cet utilisateur.' });
                return;
            }

            await pool.query(
                `UPDATE users_relationships
                 SET status = 'BLOCKED', modified_by = ?
                 WHERE user_relationship_id = ?`,
                [ctx.currentUserId, ctx.existing.user_relationship_id]
            );

            res.json({
                success: true,
                message: `${ctx.target.username} a été bloqué.`,
                relationshipId: ctx.existing.user_relationship_id,
                status: 'BLOCKED'
            });
            return;
        }

        const [insertResult] = await pool.query<ResultSetHeader>(
            `INSERT INTO users_relationships (user_id_1, user_id_2, status, created_by, modified_by)
             VALUES (?, ?, 'BLOCKED', ?, ?)`,
            [ctx.userId1, ctx.userId2, ctx.currentUserId, ctx.currentUserId]
        );

        res.status(201).json({
            success: true,
            message: `${ctx.target.username} a été bloqué.`,
            relationshipId: insertResult.insertId,
            status: 'BLOCKED'
        });
    } catch (error) {
        handleFriendsError(res, error, 'POST /block');
    }
});

// DELETE /:relationshipId : Supprimer un ami ou lever un blocage
router.delete('/:relationshipId', friendsActionLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const ctx = await resolveRelationshipContext(
            req,
            res,
            'Relation introuvable.',
            validateDeleteRelationship
        );
        if (!ctx) return;

        await pool.query(
            'DELETE FROM users_relationships WHERE user_relationship_id = ?',
            [ctx.relationshipId]
        );

        const message = ctx.relationship.status === 'BLOCKED'
            ? 'Utilisateur débloqué.'
            : 'Ami supprimé de votre liste.';

        res.json({
            success: true,
            message,
            relationshipId: ctx.relationshipId
        });
    } catch (error) {
        handleFriendsError(res, error, 'DELETE /:relationshipId');
    }
});

export default router;
