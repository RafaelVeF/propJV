import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { AuthUser, AuthResponsePayload } from '@prop-hunt/shared';
import { pool } from '../db.js';
import { requireAuth, AuthRequest } from '../middlewares/requireAuth.js';

const router: Router = Router();

// Limiteur anti brute-force pour protéger la route de connexion
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: "Trop de tentatives, réessayez dans 15 minutes." }
});

// Limiteur pour prévenir le spam de créations de compte
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: { success: false, message: "Trop de comptes créés récemment, réessayez plus tard." }
});

// Règles de validation pour la connexion
const loginSchema = z.object({
    username: z.string().trim().min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères").max(30),
    password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères").max(100)
});

// Règles de validation pour l'inscription
const registerSchema = z.object({
    username: z.string()
        .trim()
        .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
        .max(30, "Le nom d'utilisateur ne peut pas dépasser 30 caractères")
        .regex(/^[a-zA-Z0-9_-]+$/, "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores"),
    email: z.string()
        .trim()
        .email("Format d'adresse email invalide")
        .max(255, "L'adresse email est trop longue"),
    password: z.string()
        .min(8, "Le mot de passe doit contenir au moins 8 caractères")
        .max(100, "Le mot de passe ne doit pas dépasser 100 caractères")
});

// Structure attendue en base de données pour un utilisateur
interface UserRow extends RowDataPacket {
    user_id: number;
    username: string;
    email: string;
    password_hash: string;
    currency_balance?: number;
    admin_flag?: boolean;
    settings?: unknown;
    creation_date?: Date;
}

// Route POST /register : Inscription d'un nouveau joueur
router.post('/register', registerLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, email, password } = registerSchema.parse(req.body);

        // 1. Vérification si le pseudo ou l'email est déjà utilisé
        const [existingUsers] = await pool.query<UserRow[]>(
            'SELECT user_id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1',
            [username, email]
        );

        if (existingUsers.length > 0) {
            const existing = existingUsers[0];
            if (existing.username.toLowerCase() === username.toLowerCase()) {
                res.status(409).json({ success: false, message: "Ce nom d'utilisateur est déjà utilisé." });
                return;
            }
            if (existing.email.toLowerCase() === email.toLowerCase()) {
                res.status(409).json({ success: false, message: "Cette adresse email est déjà associée à un compte." });
                return;
            }
        }

        // 2. Hachage sécurisé du mot de passe avec bcrypt
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 3. Insertion de l'utilisateur dans la table relationnelle users
        const defaultSettings = JSON.stringify({ language: 'fr', volume: 80 });
        const [insertResult] = await pool.query<ResultSetHeader>(
            'INSERT INTO users (username, email, password_hash, settings) VALUES (?, ?, ?, ?)',
            [username, email, passwordHash, defaultSettings]
        );

        const newUserId = insertResult.insertId;

        // 4. Initialisation des statistiques du joueur dans users_stats
        try {
            await pool.query(
                'INSERT INTO users_stats (user_id, total_score, hider_wins, seeker_wins, matches_played) VALUES (?, 0, 0, 0, 0)',
                [newUserId]
            );
        } catch (statsError) {
            console.warn("Initialisation users_stats (déjà existant ou géré) :", statsError);
        }

        // 5. Génération du JWT de session valide 24 heures
        const token = jwt.sign(
            { userId: newUserId, username },
            process.env.JWT_SECRET as string,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            message: "Compte créé avec succès",
            token,
            userId: newUserId,
            user: {
                userId: newUserId,
                username,
                email,
                currencyBalance: 0
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.issues.map(issue => issue.message);
            res.status(400).json({
                success: false,
                message: errorMessages[0] || "Format de données invalide",
                errors: error.issues
            });
            return;
        }

        console.error("Erreur inscription :", error);
        res.status(500).json({ success: false, message: "Erreur interne du serveur lors de l'inscription." });
    }
});

// Route POST /login : Connexion d'un joueur
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, password } = loginSchema.parse(req.body);

        // Recherche de l'utilisateur en base de données
        const [rows] = await pool.query<UserRow[]>(
            'SELECT user_id, username, email, password_hash, currency_balance FROM users WHERE username = ?',
            [username]
        );

        if (rows.length === 0) {
            res.status(401).json({ success: false, message: "Identifiants invalides." });
            return;
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            const token = jwt.sign(
                { userId: user.user_id, username: user.username },
                process.env.JWT_SECRET as string,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                message: "Connecté avec succès",
                token,
                userId: user.user_id,
                user: {
                    userId: user.user_id,
                    username: user.username,
                    email: user.email,
                    currencyBalance: user.currency_balance ?? 0
                }
            });
        } else {
            res.status(401).json({ success: false, message: "Identifiants invalides." });
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, message: "Format invalide", errors: error.issues });
            return;
        }
        
        console.error("Erreur login :", error);
        res.status(500).json({ success: false, message: "Erreur interne du serveur lors de la connexion." });
    }
});

// Route GET /me : Récupérer le profil et les données du joueur connecté (protégée par JWT)
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const payload = req.user as { userId?: number; username?: string } | undefined;
        if (!payload || !payload.userId) {
            res.status(401).json({ success: false, message: "Session invalide." });
            return;
        }

        const [rows] = await pool.query<(UserRow & { total_score: number; hider_wins: number; seeker_wins: number; matches_played: number })[]>(
            `SELECT u.user_id, u.username, u.email, u.currency_balance, u.admin_flag, u.settings, u.creation_date,
                    COALESCE(s.total_score, 0) AS total_score, COALESCE(s.hider_wins, 0) AS hider_wins,
                    COALESCE(s.seeker_wins, 0) AS seeker_wins, COALESCE(s.matches_played, 0) AS matches_played
             FROM users u LEFT JOIN users_stats s ON s.user_id = u.user_id WHERE u.user_id = ?`,
            [payload.userId]
        );

        if (rows.length === 0) {
            res.status(404).json({ success: false, message: "Utilisateur introuvable." });
            return;
        }

        const user = rows[0];
        res.json({
            success: true,
            user: {
                userId: user.user_id,
                username: user.username,
                email: user.email,
                currencyBalance: user.currency_balance ?? 0,
                adminFlag: Boolean(user.admin_flag),
                settings: user.settings,
                creationDate: user.creation_date,
                stats: {
                    totalScore: user.total_score,
                    hiderWins: user.hider_wins,
                    seekerWins: user.seeker_wins,
                    matchesPlayed: user.matches_played
                }
            }
        });
    } catch (error) {
        console.error("Erreur récupération /me :", error);
        res.status(500).json({ success: false, message: "Erreur interne du serveur." });
    }
});

export default router;
