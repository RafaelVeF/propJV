-- Fichier consistant à insérer des données dans la BD pour les tests et le développement.

-- 1. Langues
INSERT INTO languages (language_code, name) VALUES 
('en', 'English'),
('fr', 'Français');

-- 2. Utilisateurs
INSERT INTO users (user_id, username, password_hash, email, currency_balance, admin_flag, settings, last_connection, created_by) VALUES
(1, 'PropJVBot',  '$2a$13$EcOTpGrJQRspC12VejN06efRBYA99LVOhkvZaMFag6IDhy.iO.K4a', 'propjv.sae@gmail.com', 1000, TRUE,  '{"language": "fr", "volume": 100}', '2026-11-16 09:00:00', NULL),
(2, 'Hidertest',  '$2a$13$EcOTpGrJQRspC12VejN06efRBYA99LVOhkvZaMFag6IDhy.iO.K4a', 'hider@test.fr',         450, FALSE, '{"language": "fr", "volume": 75}',  '2026-11-15 21:30:00', 1),
(3, 'Seekertest', '$2a$13$EcOTpGrJQRspC12VejN06efRBYA99LVOhkvZaMFag6IDhy.iO.K4a', 'seeker@test.fr',        250, FALSE, '{"language": "en", "volume": 90}',  '2026-11-16 10:15:00', 1),
(4, 'Noobtest',   '$2a$13$EcOTpGrJQRspC12VejN06efRBYA99LVOhkvZaMFag6IDhy.iO.K4a', 'noob@test.fr',           0, FALSE, '{"language": "fr", "volume": 60}',  NULL,                  1);

-- 3. Statistiques des joueurs
INSERT INTO users_stats (
    user_stat_id, user_id, total_score, hider_wins, seeker_wins, matches_played,
    total_playtime_seconds, total_eliminations, taunts_used_total, props_transformed_total,
    props_destroyed_total, damage_dealt_total, damage_taken_total, win_streak_current, win_streak_best, created_by
) VALUES
(1, 1, 1500, 12,  6, 20, 4800, 14, 18, 35, 22,  950,  800, 1, 4, 1),
(2, 2, 3800, 24,  2, 30, 7200,  5, 64, 82,  8,  320, 1450, 3, 6, 1),
(3, 3, 4200,  4, 26, 32, 7680, 68, 12, 14, 95, 5400,  620, 2, 7, 1),
(4, 4,    0,  0,  0,  0,    0,  0,  0,  0,  0,    0,    0, 0, 0, 1);

-- 4. Relations sociales
INSERT INTO users_relationships (user_relationship_id, user_id_1, user_id_2, status, created_by) VALUES
(1, 1, 2, 'ACCEPTED', 1),
(2, 2, 3, 'ACCEPTED', 2),
(3, 3, 4, 'PENDING',  3);

-- 5. Succès
INSERT INTO achievements (achievement_id, internal_name, reward, target_value, created_by) VALUES
(1, 'ach_first_win',   50, 1, 1),
(2, 'ach_chameleon',  100, 1, 1),
(3, 'ach_terminator', 150, 3, 1);

INSERT INTO users_achievements (user_achievement_id, user_id, achievement_id, progress, is_unlocked, unlocked_at, created_by) VALUES
(1, 2, 1, 1, TRUE,  '2026-10-06 14:10:00', 1),
(2, 2, 2, 1, TRUE,  '2026-10-06 16:30:00', 1),
(3, 3, 1, 1, TRUE,  '2026-10-06 15:00:00', 1),
(4, 3, 3, 3, TRUE,  '2026-10-06 18:45:00', 1),
(5, 2, 3, 1, FALSE, NULL,                  1);

-- 6. Taunts
INSERT INTO taunts (taunt_id, internal_name, price, is_default, cooldown, asset_path, created_by) VALUES
(1, 'taunt_chicken',     0, TRUE,  4.0, '/assets/audio/chicken.ogg',    1),
(2, 'taunt_evil_laugh', 150, FALSE, 8.0, '/assets/audio/evil_laugh.ogg', 1),
(3, 'taunt_whistle',    100, FALSE, 5.0, '/assets/audio/whistle.ogg',    1);

INSERT INTO taunts_translations (taunt_translation_id, taunt_id, language_id, display_name, created_by) VALUES
(1, 1, 1, 'Chicken Cluck', 1),
(2, 1, 2, 'Cot-cot', 1),
(3, 2, 1, 'Evil Laugh', 1),
(4, 2, 2, 'Rire machiavélique', 1),
(5, 3, 1, 'Whistle', 1),
(6, 3, 2, 'Sifflement', 1);

INSERT INTO users_taunts (user_taunt_id, user_id, taunt_id, wheel_slot, created_by) VALUES
(1, 2, 1, 1, 2),
(2, 2, 2, 2, 2),
(3, 2, 3, NULL, 2),
(4, 3, 1, 1, 3);

-- 7. Armes et Classes de Seekers
INSERT INTO weapons (weapon_id, internal_name, weapon_type, damage, miss_penalty_health, asset_path, created_by) VALUES
(1, 'weapon_crowbar', 'MELEE',  25, 2, '/assets/weapons/crowbar.png', 1),
(2, 'weapon_pistol',  'RANGED', 20, 5, '/assets/weapons/pistol.png',  1);

INSERT INTO weapons_translations (weapon_translation_id, weapon_id, language_id, display_name, description, created_by) VALUES
(1, 1, 1, 'Crowbar', 'Standard blunt melee tool.', 1),
(2, 1, 2, 'Pied-de-biche', 'Arme contondante standard.', 1),
(3, 2, 1, 'Service Pistol', 'Reliable semi-automatic pistol.', 1),
(4, 2, 2, 'Pistolet de service', 'Arme de poing équilibrée.', 1);

INSERT INTO seeker_classes (seeker_class_id, internal_name, price, is_default, health, asset_path, melee_weapon_id, ranged_weapon_id, created_by) VALUES
(1, 'seeker_recruit',     0, TRUE,  100, '/assets/characters/duck.png', 1, 2, 1),
(2, 'seeker_juggernaut', 500, FALSE, 160, '/assets/characters/duck.png', 1, 2, 1);

INSERT INTO seeker_classes_translations (seeker_class_translation_id, seeker_class_id, language_id, display_name, description, created_by) VALUES
(1, 1, 1, 'Recruit', 'Balanced starter seeker class.', 1),
(2, 1, 2, 'Recrue', 'Classe de base équilibrée.', 1),
(3, 2, 1, 'Juggernaut', 'Tough armored seeker with devastating weapons.', 1),
(4, 2, 2, 'Colosse', 'Chercheur résistant équipé d’armes lourdes.', 1);

INSERT INTO users_seeker_classes (user_seeker_class_id, user_id, seeker_class_id, created_by) VALUES
(1, 1, 1, 1),
(2, 2, 1, 1),
(3, 3, 1, 1),
(4, 3, 2, 3);

-- 8. Cartes et Props
INSERT INTO maps (map_id, internal_name, hiding_time, round_duration, asset_path, created_by) VALUES
(1, 'map_test', 30, 240, '/assets/maps/Overworld.json', 1);

INSERT INTO maps_translations (map_translation_id, map_id, language_id, display_name, created_by) VALUES
(1, 1, 1, 'The Test map', 1),
(2, 1, 2, 'La map de test', 1);

INSERT INTO props (prop_id, internal_name, health, asset_path, width, height, hitbox_radius, created_by) VALUES
(1, 'prop_wall_painting',    50, '/assets/props/board/Tableau_Mur.png',               32, 32, 15, 1),
(2, 'prop_chair',            40, '/assets/props/chair/Chair_F.png',                   32, 64, 15, 1),
(3, 'prop_desk',             80, '/assets/props/desk/Desk_F.png',                     64, 32, 15, 1),
(4, 'prop_bag',              45, '/assets/props/bag/Bag_F.png',                       32, 32, 14, 1),
(5, 'prop_can',              20, '/assets/props/can/Can_F.png',                       32, 32, 10, 1),
(6, 'prop_vending_machine', 150, '/assets/props/vending_machine/Vending_machine_F.png', 48, 64, 22, 1);

INSERT INTO props_translations (prop_translation_id, prop_id, language_id, display_name, created_by) VALUES
(1, 1, 1, 'Wall Painting', 1),
(2, 1, 2, 'Tableau mural', 1),
(3, 2, 1, 'Chair', 1),
(4, 2, 2, 'Chaise', 1),
(5, 3, 1, 'Desk', 1),
(6, 3, 2, 'Bureau', 1),
(7, 4, 1, 'Backpack', 1),
(8, 4, 2, 'Sac à dos', 1),
(9, 5, 1, 'Soda Can', 1),
(10, 5, 2, 'Canette', 1),
(11, 6, 1, 'Vending Machine', 1),
(12, 6, 2, 'Distributeur', 1);

-- Association Props <-> Carte (Map 1 avec tous les props 1 à 6)
INSERT INTO maps_props (map_prop_id, prop_id, map_id, created_by) VALUES
(1, 1, 1, 1),
(2, 2, 1, 1),
(3, 3, 1, 1),
(4, 4, 1, 1),
(5, 5, 1, 1),
(6, 6, 1, 1);

-- 9. Historique d'une partie et participants
INSERT INTO matches (match_id, server_id, start_time, end_time, duration_seconds, winning_team, map_id, created_by) VALUES
(1, 'srv-eu-01', '2026-10-06 14:00:00', '2026-10-06 14:03:45', 225, 'HIDER', 1, 1);

INSERT INTO matches_users (
    match_user_id, match_id, user_id, role, score_earned, currency_earned,
    is_survivor, survival_time_seconds, eliminations, transformations_count,
    taunts_used, props_destroyed, damage_dealt, damage_taken, shots_fired, shots_hit,
    final_prop_id, seeker_class_id, created_by
) VALUES
(1, 1, 2, 'HIDER',  450, 60, TRUE,  225, 0, 0, 4, 0,   0,  0,  0, 0, 5,    NULL, 1),
(2, 1, 3, 'SEEKER', 150, 20, NULL,  225, 1, 0, 0, 2, 100, 10, 12, 4, NULL, 1,    1),
(3, 1, 4, 'HIDER',  100, 15, FALSE, 110, 0, 3, 1, 0,   0, 100, 0, 0, 2,    NULL, 1);

-- 10. Flux des transactions monétaires
INSERT INTO currency_transactions (currency_transaction_id, user_id, amount, transaction_reference, reference_id, created_by) VALUES
(1, 2,   60, 'MATCH_REWARD', 1, 1),
(2, 3,   20, 'MATCH_REWARD', 1, 1),
(3, 2, -150, 'TAUNT_BUY',    2, 2),
(4, 3, -500, 'CLASS_BUY',    2, 3);