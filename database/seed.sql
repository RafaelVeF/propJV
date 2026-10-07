-- Fichier consistant à insérer des données dans la BD pour les tests et le développement.

INSERT INTO languages (language_code, name) VALUES 
('en', 'English'),
('fr', 'Français');

INSERT INTO users (
    user_id,
    username,
    password_hash,
    email,
    currency_balance,
    admin_flag,
    settings,
    created_by
) VALUES (
    1,
    'PropJVBot',
    '$2a$13$EcOTpGrJQRspC12VejN06efRBYA99LVOhkvZaMFag6IDhy.iO.K4a', 
    'propjv.sae@gmail.com',
    500,
    TRUE,
    '{"language": "fr", "volume": 80}',
    NULL
);

INSERT INTO users_stats (
    user_stat_id,
    user_id,
    total_score,
    hider_wins,
    seeker_wins,
    matches_played,
    created_by
) VALUES (
    1,
    1,
    1500,
    12,
    6,
    20,
    1
);