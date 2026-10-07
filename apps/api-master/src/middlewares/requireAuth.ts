import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// On étend l'interface Request d'Express pour pouvoir y stocker les infos du joueur
export interface AuthRequest extends Request {
    user?: string | jwt.JwtPayload;
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
    // 1. Récupération du token dans l'en-tête de la requête
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, message: "Accès non autorisé. Token manquant." });
        return;
    }

    // 2. Extraction du token (on isole la partie après "Bearer ")
    const token = authHeader.split(' ')[1];

    try {
        // 3. Vérification cryptographique du token avec ta clé secrète
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
        
        // 4. Si c'est bon, on attache les données du joueur à la requête et on laisse passer
        req.user = decoded;
        next();
    } catch (error) {
        res.status(403).json({ success: false, message: "Token invalide ou expiré." });
    }
};