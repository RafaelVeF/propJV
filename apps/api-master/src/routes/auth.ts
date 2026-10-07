import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { RowDataPacket } from 'mysql2';
import { pool } from '../db.js';

const router: Router = Router();

// Limiteur anti brute-force pour protéger la route de connexion
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: "Trop de tentatives, réessayez dans 15 minutes." }
});

// Définition des règles de validation pour éviter la saturation mémoire
const loginSchema = z.object({
    username: z.string().min(3).max(30),
    password: z.string().min(8).max(100)
});

// Structure attendue lors de la lecture en base de données
interface UserRow extends RowDataPacket {
    user_id: number;
    username: string;
    password_hash: string;
}

// Application du limiteur directement sur la route POST
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        // Vérification stricte du format des données reçues
        const { username, password } = loginSchema.parse(req.body);

        // Recherche de l'utilisateur en base de données
        const [rows] = await pool.query<UserRow[]>(
            'SELECT user_id, username, password_hash FROM users WHERE username = ?',
            [username]
        );

        // Si le pseudo n'existe pas
        if (rows.length === 0) {
            res.status(401).json({ success: false, message: "Identifiants invalides" });
            return;
        }

        const user = rows[0];
        
        // Comparaison mathématique sécurisée du mot de passe
        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            // Création du jeton de session (JWT) valide pour 24 heures
            const token = jwt.sign(
                { userId: user.user_id, username: user.username },
                process.env.JWT_SECRET as string,
                { expiresIn: '24h' }
            );
            res.json({ success: true, message: "Connecté avec succès", token, userId: user.user_id });
        } else {
            res.status(401).json({ success: false, message: "Identifiants invalides" });
        }
    } catch (error) {
        // Interception des erreurs de validation (ex: mot de passe trop court)
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, message: "Format invalide", errors: error.issues });
            return;
        }
        
        console.error("Erreur login :", error);
        res.status(500).json({ success: false, message: "Erreur interne" });
    }
});

export default router;