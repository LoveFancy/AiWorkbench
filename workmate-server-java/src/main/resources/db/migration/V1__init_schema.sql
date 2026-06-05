-- CreateTable: upgrade_releases
CREATE TABLE `upgrade_releases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `version` VARCHAR(32) NOT NULL,
    `release_type` ENUM('UPGRADE', 'ROLLBACK') NOT NULL DEFAULT 'UPGRADE',
    `release_notes` TEXT NOT NULL,
    `download_url` VARCHAR(512) NOT NULL,
    `platform` VARCHAR(32) NOT NULL,
    `min_version` VARCHAR(32) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: upgrade_whitelist
CREATE TABLE `upgrade_whitelist` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_strategy_id` INTEGER NULL,
    `rule_type` VARCHAR(16) NOT NULL,
    `rule_value` VARCHAR(256) NOT NULL,
    `target_version` VARCHAR(32) NULL,
    `platform` VARCHAR(32) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `upgrade_whitelist_is_active_idx`(`is_active`),
    INDEX `upgrade_whitelist_source_strategy_id_idx`(`source_strategy_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: upgrade_strategies
CREATE TABLE `upgrade_strategies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(128) NOT NULL,
    `release_type` ENUM('UPGRADE', 'ROLLBACK') NOT NULL DEFAULT 'UPGRADE',
    `target_version` VARCHAR(32) NOT NULL,
    `download_url` VARCHAR(512) NOT NULL,
    `release_notes` TEXT NULL,
    `platform` VARCHAR(32) NOT NULL,
    `min_version` VARCHAR(32) NULL,
    `total_stages` INTEGER NOT NULL,
    `current_stage` INTEGER NOT NULL DEFAULT 0,
    `soak_time_minutes` INTEGER NULL,
    `auto_pause_error_rate` DECIMAL(5, 4) NULL,
    `auto_pause_enabled` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'FINISHED') NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: upgrade_strategy_stages
CREATE TABLE `upgrade_strategy_stages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `strategy_id` INTEGER NOT NULL,
    `stage_order` INTEGER NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `release_notes` TEXT NULL,
    `advanced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `upgrade_strategy_stages_strategy_id_stage_order_key`(`strategy_id`, `stage_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: upgrade_strategy_stage_rules
CREATE TABLE `upgrade_strategy_stage_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stage_id` INTEGER NOT NULL,
    `rule_type` VARCHAR(16) NOT NULL,
    `rule_value` VARCHAR(256) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: admin_whitelist
CREATE TABLE `admin_whitelist` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rule_type` VARCHAR(16) NOT NULL,
    `rule_value` VARCHAR(256) NOT NULL,
    `remark` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `admin_whitelist_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: observability_events
CREATE TABLE `observability_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_id` VARCHAR(36) NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `user_name` VARCHAR(128) NULL,
    `event_type` VARCHAR(32) NOT NULL,
    `question` TEXT NULL,
    `question_length` INTEGER NULL,
    `model_id` VARCHAR(128) NULL,
    `channel_id` VARCHAR(128) NULL,
    `session_id` VARCHAR(64) NULL,
    `workspace_id` VARCHAR(64) NULL,
    `result` VARCHAR(16) NULL,
    `response_duration_ms` INTEGER NULL,
    `error_type` VARCHAR(64) NULL,
    `error_message` TEXT NULL,
    `error_stack` TEXT NULL,
    `error_fingerprint` VARCHAR(64) NULL,
    `error_status_code` INTEGER NULL,
    `breadcrumbs` TEXT NULL,
    `tags` TEXT NULL,
    `client_version` VARCHAR(32) NOT NULL,
    `client_platform` VARCHAR(32) NOT NULL,
    `client_os_version` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `observability_events_event_id_key`(`event_id`),
    INDEX `observability_events_event_type_idx`(`event_type`),
    INDEX `observability_events_user_id_idx`(`user_id`),
    INDEX `observability_events_created_at_idx`(`created_at`),
    INDEX `observability_events_client_version_idx`(`client_version`),
    INDEX `observability_events_error_fingerprint_idx`(`error_fingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `upgrade_whitelist` ADD CONSTRAINT `upgrade_whitelist_source_strategy_id_fkey`
    FOREIGN KEY (`source_strategy_id`) REFERENCES `upgrade_strategies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `upgrade_strategy_stages` ADD CONSTRAINT `upgrade_strategy_stages_strategy_id_fkey`
    FOREIGN KEY (`strategy_id`) REFERENCES `upgrade_strategies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `upgrade_strategy_stage_rules` ADD CONSTRAINT `upgrade_strategy_stage_rules_stage_id_fkey`
    FOREIGN KEY (`stage_id`) REFERENCES `upgrade_strategy_stages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
