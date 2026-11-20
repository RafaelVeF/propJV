import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const requireInternalSecret = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const expectedSecret = process.env.INTERNAL_API_SECRET?.trim() || 'prop-hunt-internal-secret-local-dev';
    if (!expectedSecret) {
        console.error('[InternalAuth] INTERNAL_API_SECRET non configuré dans .env');
        res.status(500).json({
            success: false,
            message: 'Configuration interne du serveur incomplète.',
        });
        return;
    }

    const headerValue = req.headers['x-internal-secret'];
    const providedSecret = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!providedSecret) {
        res.status(401).json({
            success: false,
            message: 'Accès interne refusé : en-tête x-internal-secret manquant.',
        });
        return;
    }

    const expectedBuf = Buffer.from(expectedSecret, 'utf8');
    const providedBuf = Buffer.from(providedSecret, 'utf8');

    if (
        expectedBuf.length !== providedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
        res.status(403).json({
            success: false,
            message: 'Accès interne refusé : secret invalide.',
        });
        return;
    }

    next();
};
