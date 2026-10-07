-- Fichier consistant à insérer des données dans la BD pour les tests et le développement.

-- 1. Langues
INSERT INTO languages (language_code, name) VALUES 
('en', 'English'),
('fr', 'Français');

-- 2. Utilisateurs
INSERT INTO users (user_id, username, password_hash, email, currency_balance, admin_flag, settings, created_by) VALUES
(1, 'PropJVBot',  '$2a$13$EcOTpGrJQRspC12VejN06efRBYA99LVOhkvZaMFag6IDhy.iO.K4a', 'propjv.sae@gmail.com', 1000, TRUE,  '{"language": "fr", "volume": 100}', NULL),
(2, 'Hidertest',  '$2a$13$EcOTpGrJQRspC12VejN06efRBYA99LVOhkvZaMFag6IDhy.iO.K4a', 'hider@test.fr',         450, FALSE, '{"language": "fr", "volume": 75}',  1),
(3, 'Seekertest', '$2a$13$EcOTpGrJQRspC12VejN06efRBYA99LVOhkvZaMFag6IDhy.iO.K4a', 'seeker@test.fr',        250, FALSE, '{"language": "en", "volume": 90}',  1),
(4, 'Noobtest',   '$2a$13$EcOTpGrJQRspC12VejN06efRBYA99LVOhkvZaMFag6IDhy.iO.K4a', 'noob@test.fr',           0, FALSE, '{"language": "fr", "volume": 60}',  1);

-- 3. Statistiques des joueurs
INSERT INTO users_stats (user_stat_id, user_id, total_score, hider_wins, seeker_wins, matches_played, created_by) VALUES
(1, 1, 1500, 12,  6, 20, 1),
(2, 2, 3800, 24,  2, 30, 1),
(3, 3, 4200,  4, 26, 32, 1),
(4, 4,    0,  0,  0,  0, 1);

-- 4. Relations sociales
INSERT INTO users_relationships (user_relationship_id, user_id_1, user_id_2, status, created_by) VALUES
(1, 1, 2, 'ACCEPTED', 1),
(2, 2, 3, 'ACCEPTED', 2),
(3, 3, 4, 'PENDING',  3);

-- 5. Succès
INSERT INTO achievements (achievement_id, internal_name, reward, created_by) VALUES
(1, 'ach_first_win',   50, 1),
(2, 'ach_chameleon',  100, 1),
(3, 'ach_terminator', 150, 1);

INSERT INTO achievements_translations (achievement_translation_id, achievement_id, language_id, display_name, description, created_by) VALUES
(1, 1, 1, 'First Blood', 'Win your very first match.', 1),
(2, 1, 2, 'Première victoire', 'Remportez votre première partie.', 1),
(3, 2, 1, 'Chameleon', 'Survive an entire match without changing props.', 1),
(4, 2, 2, 'Caméléon', 'Survivez à une partie complète sans changer d’objet.', 1),
(5, 3, 1, 'Terminator', 'Eliminate 3 hiders in a single match.', 1),
(6, 3, 2, 'Nettoyeur', 'Éliminez 3 objets cachés dans la même partie.', 1);

INSERT INTO users_achievements (user_achievement_id, user_id, achievement_id, unlocked_at, created_by) VALUES
(1, 2, 1, '2026-10-06 14:10:00', 1),
(2, 2, 2, '2026-10-06 16:30:00', 1),
(3, 3, 1, '2026-10-06 15:00:00', 1),
(4, 3, 3, '2026-10-06 18:45:00', 1);

-- 6. Railleries (Taunts)
INSERT INTO taunts (taunt_id, internal_name, price, is_default, cooldown, asset_path, created_by) VALUES
(1, 'taunt_chicken',     0, TRUE,  4.0, '/assets/audio/taunts/chicken.ogg',    1),
(2, 'taunt_evil_laugh', 150, FALSE, 8.0, '/assets/audio/taunts/evil_laugh.ogg', 1),
(3, 'taunt_whistle',    100, FALSE, 5.0, '/assets/audio/taunts/whistle.ogg',    1);

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

INSERT INTO props (prop_id, internal_name, health, asset_path, created_by) VALUES
(1, 'prop_wall_painting',      50, '/assets/props/Tableau_Mur.png',      1),
(2, 'prop_wall_painting_test', 30, '/assets/props/Tableau_Mur_test.png', 1);

INSERT INTO props_translations (prop_translation_id, prop_id, language_id, display_name, created_by) VALUES
(1, 1, 1, 'Wall Painting', 1),
(2, 1, 2, 'Tableau mural', 1),
(3, 2, 1, 'Wall Painting (Test)', 1),
(4, 2, 2, 'Tableau mural de test', 1);

-- Association Props <-> Carte (Uniquement la map 1 avec les props 1 et 2)
INSERT INTO maps_props (map_prop_id, prop_id, map_id, created_by) VALUES
(1, 1, 1, 1),
(2, 2, 1, 1);

-- 9. Historique d'une partie et participants
INSERT INTO matches (match_id, start_time, end_time, winning_team, map_id, created_by) VALUES
(1, '2026-10-06 14:00:00', '2026-10-06 14:03:45', 'HIDER', 1, 1);

INSERT INTO matches_users (match_user_id, match_id, user_id, role, score_earned, currency_earned, is_survivor, props_destroyed, seeker_class_id, created_by) VALUES
(1, 1, 2, 'HIDER',  450, 60, TRUE,  0, NULL, 1),
(2, 1, 3, 'SEEKER', 150, 20, NULL,  2, 1,    1),
(3, 1, 4, 'HIDER',  100, 15, FALSE, 0, NULL, 1);

-- 10. Flux des transactions monétaires
INSERT INTO currency_transactions (currency_transaction_id, user_id, amount, transaction_reference, reference_id, created_by) VALUES
(1, 2,   60, 'MATCH_REWARD', 1, 1),
(2, 3,   20, 'MATCH_REWARD', 1, 1),
(3, 2, -150, 'TAUNT_BUY',    2, 2),
(4, 3, -500, 'CLASS_BUY',    2, 3);