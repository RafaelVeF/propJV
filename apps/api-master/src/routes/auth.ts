import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { RowDataPacket } from 'mysql2';
import { pool } from '../db.js';

const router: Router = Router();

// Définit la structure exacte qu'on attend de la base de données
interface UserRow extends RowDataPacket {
    user_id: number;
    username: string;
    password_hash: string;
}

router.post('/login', async (req: Request, res: Response): Promise<void> => {
    // Récupération des données envoyées par le client (ex: depuis Phaser/Electron)
    const { username, password } = req.body;

    // Vérification que les champs ne sont pas vides
    if (!username || !password) {
        res.status(400).json({ success: false, message: "Pseudo et mot de passe requis" });
        return; // On utilise un return vide pour satisfaire TypeScript
    }

    try {
        // 3. Interrogation de TiDB pour trouver l'utilisateur par son pseudo
        const [rows] = await pool.query<UserRow[]>(
            'SELECT user_id, username, password_hash FROM users WHERE username = ?',
            [username]
        );

        // 4. Si l'utilisateur n'existe pas dans la base
        if (rows.length === 0) {
            res.status(401).json({ success: false, message: "Identifiants invalides" });
            return;
        }

        const user = rows[0];

        // 5. Cryptographie : Comparaison du mot de passe fourni avec le hash stocké
        const match = await bcrypt.compare(password, user.password_hash);

        // 6. Validation finale et envoi de la réponse au client
        if (match) {
            res.json({ success: true, message: "Connecté avec succès", userId: user.user_id });
        } else {
            res.status(401).json({ success: false, message: "Identifiants invalides" });
        }
    } catch (error) {
        console.error("Erreur SQL lors du login :", error);
        res.status(500).json({ success: false, message: "Erreur interne du serveur" });
    }
});

export default router;