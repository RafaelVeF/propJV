-- 1. Table des utilisateurs
CREATE TABLE users (
    user_id INT AUTO_INCREMENT NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    currency_balance INT NOT NULL DEFAULT 0,
    admin_flag BOOLEAN NOT NULL DEFAULT FALSE,
    settings JSON NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_users PRIMARY KEY (user_id),
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_currency CHECK (currency_balance >= 0),
    CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_users_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table des langues
CREATE TABLE languages (
    language_id INT AUTO_INCREMENT NOT NULL,
    language_code VARCHAR(5) NOT NULL,
    name VARCHAR(50) NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_languages PRIMARY KEY (language_id),
    CONSTRAINT uq_languages_code UNIQUE (language_code),
    CONSTRAINT fk_languages_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_languages_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Statistiques des joueurs
CREATE TABLE users_stats (
    user_stat_id INT AUTO_INCREMENT NOT NULL,
    user_id INT NOT NULL,
    total_score INT NOT NULL DEFAULT 0,
    hider_wins INT NOT NULL DEFAULT 0,
    seeker_wins INT NOT NULL DEFAULT 0,
    matches_played INT NOT NULL DEFAULT 0,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_users_stats PRIMARY KEY (user_stat_id),
    CONSTRAINT uq_users_stats_user UNIQUE (user_id),
    CONSTRAINT fk_users_stats_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_users_stats_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_users_stats_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Relations et amis
CREATE TABLE users_relationships (
    user_relationship_id INT AUTO_INCREMENT NOT NULL,
    user_id_1 INT NOT NULL,
    user_id_2 INT NOT NULL,
    status ENUM('PENDING', 'ACCEPTED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_users_relationships PRIMARY KEY (user_relationship_id),
    CONSTRAINT uq_users_relationships_pair UNIQUE (user_id_1, user_id_2),
    CONSTRAINT chk_users_rel_distinct CHECK (user_id_1 <> user_id_2),
    CONSTRAINT chk_users_rel_order CHECK (user_id_1 < user_id_2),
    CONSTRAINT fk_users_rel_user_1 FOREIGN KEY (user_id_1) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_users_rel_user_2 FOREIGN KEY (user_id_2) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_users_rel_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_users_rel_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Transactions de monnaie
CREATE TABLE currency_transactions (
    currency_transaction_id INT AUTO_INCREMENT NOT NULL,
    user_id INT NOT NULL,
    amount INT NOT NULL,
    transaction_reference VARCHAR(50) NOT NULL,
    reference_id INT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_currency_transactions PRIMARY KEY (currency_transaction_id),
    CONSTRAINT fk_currency_tx_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_currency_tx_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_currency_tx_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Catalogue des succès
CREATE TABLE achievements (
    achievement_id INT AUTO_INCREMENT NOT NULL,
    internal_name VARCHAR(100) NOT NULL,
    reward INT NOT NULL DEFAULT 0,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_achievements PRIMARY KEY (achievement_id),
    CONSTRAINT uq_achievements_name UNIQUE (internal_name),
    CONSTRAINT fk_achievements_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_achievements_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Traductions des succès
CREATE TABLE achievements_translations (
    achievement_translation_id INT AUTO_INCREMENT NOT NULL,
    achievement_id INT NOT NULL,
    language_id INT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_achievements_translations PRIMARY KEY (achievement_translation_id),
    CONSTRAINT uq_achievements_trans_entry UNIQUE (achievement_id, language_id),
    CONSTRAINT fk_ach_trans_ach FOREIGN KEY (achievement_id) REFERENCES achievements (achievement_id) ON DELETE CASCADE,
    CONSTRAINT fk_ach_trans_lang FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE CASCADE,
    CONSTRAINT fk_ach_trans_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_ach_trans_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Succès débloqués par les joueurs
CREATE TABLE users_achievements (
    user_achievement_id INT AUTO_INCREMENT NOT NULL,
    user_id INT NOT NULL,
    achievement_id INT NOT NULL,
    unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_users_achievements PRIMARY KEY (user_achievement_id),
    CONSTRAINT uq_users_achievements_entry UNIQUE (user_id, achievement_id),
    CONSTRAINT fk_users_ach_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_users_ach_ach FOREIGN KEY (achievement_id) REFERENCES achievements (achievement_id) ON DELETE CASCADE,
    CONSTRAINT fk_users_ach_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_users_ach_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Catalogue des taunts
CREATE TABLE taunts (
    taunt_id INT AUTO_INCREMENT NOT NULL,
    internal_name VARCHAR(100) NOT NULL,
    price INT NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    cooldown FLOAT NOT NULL DEFAULT 5.0,
    asset_path VARCHAR(255) NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_taunts PRIMARY KEY (taunt_id),
    CONSTRAINT uq_taunts_name UNIQUE (internal_name),
    CONSTRAINT fk_taunts_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_taunts_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Traductions des taunts
CREATE TABLE taunts_translations (
    taunt_translation_id INT AUTO_INCREMENT NOT NULL,
    taunt_id INT NOT NULL,
    language_id INT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_taunts_translations PRIMARY KEY (taunt_translation_id),
    CONSTRAINT uq_taunts_trans_entry UNIQUE (taunt_id, language_id),
    CONSTRAINT fk_taunts_trans_taunt FOREIGN KEY (taunt_id) REFERENCES taunts (taunt_id) ON DELETE CASCADE,
    CONSTRAINT fk_taunts_trans_lang FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE CASCADE,
    CONSTRAINT fk_taunts_trans_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_taunts_trans_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Inventaire des taunts
CREATE TABLE users_taunts (
    user_taunt_id INT AUTO_INCREMENT NOT NULL,
    user_id INT NOT NULL,
    taunt_id INT NOT NULL,
    wheel_slot TINYINT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_users_taunts PRIMARY KEY (user_taunt_id),
    CONSTRAINT uq_users_taunts_entry UNIQUE (user_id, taunt_id),
    CONSTRAINT uq_users_taunts_wheel UNIQUE (user_id, wheel_slot),
    CONSTRAINT chk_wheel_slot CHECK (wheel_slot IS NULL OR (wheel_slot >= 1 AND wheel_slot <= 5)),
    CONSTRAINT fk_users_taunts_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_users_taunts_taunt FOREIGN KEY (taunt_id) REFERENCES taunts (taunt_id) ON DELETE CASCADE,
    CONSTRAINT fk_users_taunts_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_users_taunts_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Catalogue des armes
CREATE TABLE weapons (
    weapon_id INT AUTO_INCREMENT NOT NULL,
    internal_name VARCHAR(100) NOT NULL,
    weapon_type ENUM('MELEE', 'RANGED') NOT NULL,
    damage INT NOT NULL DEFAULT 20,
    miss_penalty_health INT NOT NULL DEFAULT 5,
    asset_path VARCHAR(255) NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_weapons PRIMARY KEY (weapon_id),
    CONSTRAINT uq_weapons_name UNIQUE (internal_name),
    CONSTRAINT fk_weapons_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_weapons_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Traductions des armes
CREATE TABLE weapons_translations (
    weapon_translation_id INT AUTO_INCREMENT NOT NULL,
    weapon_id INT NOT NULL,
    language_id INT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_weapons_translations PRIMARY KEY (weapon_translation_id),
    CONSTRAINT uq_weapons_trans_entry UNIQUE (weapon_id, language_id),
    CONSTRAINT fk_weapons_trans_weapon FOREIGN KEY (weapon_id) REFERENCES weapons (weapon_id) ON DELETE CASCADE,
    CONSTRAINT fk_weapons_trans_lang FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE CASCADE,
    CONSTRAINT fk_weapons_trans_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_weapons_trans_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Classes de Seekers
CREATE TABLE seeker_classes (
    seeker_class_id INT AUTO_INCREMENT NOT NULL,
    internal_name VARCHAR(100) NOT NULL,
    price INT NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    health INT NOT NULL DEFAULT 100,
    asset_path VARCHAR(255) NOT NULL,
    melee_weapon_id INT NOT NULL,
    ranged_weapon_id INT NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_seeker_classes PRIMARY KEY (seeker_class_id),
    CONSTRAINT uq_seeker_classes_name UNIQUE (internal_name),
    CONSTRAINT fk_seeker_melee FOREIGN KEY (melee_weapon_id) REFERENCES weapons (weapon_id) ON DELETE RESTRICT,
    CONSTRAINT fk_seeker_ranged FOREIGN KEY (ranged_weapon_id) REFERENCES weapons (weapon_id) ON DELETE RESTRICT,
    CONSTRAINT fk_seeker_classes_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_seeker_classes_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Traductions des classes de Seekers
CREATE TABLE seeker_classes_translations (
    seeker_class_translation_id INT AUTO_INCREMENT NOT NULL,
    seeker_class_id INT NOT NULL,
    language_id INT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_seeker_classes_translations PRIMARY KEY (seeker_class_translation_id),
    CONSTRAINT uq_seeker_classes_trans_entry UNIQUE (seeker_class_id, language_id),
    CONSTRAINT fk_scl_trans_class FOREIGN KEY (seeker_class_id) REFERENCES seeker_classes (seeker_class_id) ON DELETE CASCADE,
    CONSTRAINT fk_scl_trans_lang FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE CASCADE,
    CONSTRAINT fk_scl_trans_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_scl_trans_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Classes débloquées par les joueurs
CREATE TABLE users_seeker_classes (
    user_seeker_class_id INT AUTO_INCREMENT NOT NULL,
    user_id INT NOT NULL,
    seeker_class_id INT NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_users_seeker_classes PRIMARY KEY (user_seeker_class_id),
    CONSTRAINT uq_users_seeker_classes_entry UNIQUE (user_id, seeker_class_id),
    CONSTRAINT fk_users_scl_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_users_scl_class FOREIGN KEY (seeker_class_id) REFERENCES seeker_classes (seeker_class_id) ON DELETE CASCADE,
    CONSTRAINT fk_users_scl_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_users_scl_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Catalogue des cartes
CREATE TABLE maps (
    map_id INT AUTO_INCREMENT NOT NULL,
    internal_name VARCHAR(100) NOT NULL,
    hiding_time INT NOT NULL DEFAULT 30,
    round_duration INT NOT NULL DEFAULT 300,
    asset_path VARCHAR(255) NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_maps PRIMARY KEY (map_id),
    CONSTRAINT uq_maps_name UNIQUE (internal_name),
    CONSTRAINT fk_maps_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_maps_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Traductions des cartes
CREATE TABLE maps_translations (
    map_translation_id INT AUTO_INCREMENT NOT NULL,
    map_id INT NOT NULL,
    language_id INT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_maps_translations PRIMARY KEY (map_translation_id),
    CONSTRAINT uq_maps_trans_entry UNIQUE (map_id, language_id),
    CONSTRAINT fk_maps_trans_map FOREIGN KEY (map_id) REFERENCES maps (map_id) ON DELETE CASCADE,
    CONSTRAINT fk_maps_trans_lang FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE CASCADE,
    CONSTRAINT fk_maps_trans_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_maps_trans_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. Catalogue des props
CREATE TABLE props (
    prop_id INT AUTO_INCREMENT NOT NULL,
    internal_name VARCHAR(100) NOT NULL,
    health INT NOT NULL DEFAULT 100,
    asset_path VARCHAR(255) NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_props PRIMARY KEY (prop_id),
    CONSTRAINT uq_props_name UNIQUE (internal_name),
    CONSTRAINT fk_props_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_props_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. Traductions des props
CREATE TABLE props_translations (
    prop_translation_id INT AUTO_INCREMENT NOT NULL,
    prop_id INT NOT NULL,
    language_id INT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_props_translations PRIMARY KEY (prop_translation_id),
    CONSTRAINT uq_props_trans_entry UNIQUE (prop_id, language_id),
    CONSTRAINT fk_props_trans_prop FOREIGN KEY (prop_id) REFERENCES props (prop_id) ON DELETE CASCADE,
    CONSTRAINT fk_props_trans_lang FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE CASCADE,
    CONSTRAINT fk_props_trans_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_props_trans_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. Liaison maps / props
CREATE TABLE maps_props (
    map_prop_id INT AUTO_INCREMENT NOT NULL,
    prop_id INT NOT NULL,
    map_id INT NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_maps_props PRIMARY KEY (map_prop_id),
    CONSTRAINT uq_maps_props_entry UNIQUE (prop_id, map_id),
    CONSTRAINT fk_maps_props_prop FOREIGN KEY (prop_id) REFERENCES props (prop_id) ON DELETE CASCADE,
    CONSTRAINT fk_maps_props_map FOREIGN KEY (map_id) REFERENCES maps (map_id) ON DELETE CASCADE,
    CONSTRAINT fk_maps_props_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_maps_props_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. Historique des sessions de parties
CREATE TABLE matches (
    match_id INT AUTO_INCREMENT NOT NULL,
    start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME NULL,
    winning_team ENUM('HIDER', 'SEEKER', 'DRAW') NULL,
    map_id INT NOT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_matches PRIMARY KEY (match_id),
    CONSTRAINT fk_matches_map FOREIGN KEY (map_id) REFERENCES maps (map_id) ON DELETE RESTRICT,
    CONSTRAINT fk_matches_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_matches_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. Performances individuelles par match
CREATE TABLE matches_users (
    match_user_id INT AUTO_INCREMENT NOT NULL,
    match_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('HIDER', 'SEEKER') NOT NULL,
    score_earned INT NOT NULL DEFAULT 0,
    currency_earned INT NOT NULL DEFAULT 0,
    is_survivor BOOLEAN NULL,
    props_destroyed INT NOT NULL DEFAULT 0,
    seeker_class_id INT NULL,
    created_by INT NULL,
    creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INT NULL,
    modification_date DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_matches_users PRIMARY KEY (match_user_id),
    CONSTRAINT uq_matches_users_entry UNIQUE (match_id, user_id),
    CONSTRAINT fk_matches_users_match FOREIGN KEY (match_id) REFERENCES matches (match_id) ON DELETE CASCADE,
    CONSTRAINT fk_matches_users_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_matches_users_seeker_class FOREIGN KEY (seeker_class_id) REFERENCES seeker_classes (seeker_class_id) ON DELETE SET NULL,
    CONSTRAINT fk_matches_users_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_matches_users_modified_by FOREIGN KEY (modified_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

