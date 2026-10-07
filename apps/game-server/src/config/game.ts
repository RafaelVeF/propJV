export const GAME_CONFIG = {

    // Taux de raffraîchissement du serveur en ticks par seconde
    TICK_RATE: 20,
    // Intervalle de temps entre chaque tick en millisecondes (en millisecondes)
    TICK_INTERVAL: 1000 / 20,

    //Paramètres physiques du joueur
    PLAYER_SPEED: 200, // Vitesse de déplacement maximale du joueur en pixels par tick
    PLAYER_RADIUS: 16, // Taille de la hitbox du joueur en pixels
    VISION_RADIUS: 50, // Rayon de vision du joueur en pixels a adapter selon les tests

    // Paramètres physiques des projectiles
    PROJECTILE_SPEED: 400, // Vitesse de déplacement maximale du projectile en pixels par tick
    PROJECTILE_RADIUS: 4, // Taille de la hitbox du projectile en pixels

    // Dimensions de la carte de jeu
    MAP_WIDTH: 800, // Largeur de la carte en pixels
    MAP_HEIGHT: 800, // Hauteur de la carte en pixels

};
