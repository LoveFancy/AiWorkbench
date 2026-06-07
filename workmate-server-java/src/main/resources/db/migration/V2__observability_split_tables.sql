-- V2: 观测数据拆表 —— 业务事件表（按年分区）+ 异常事件表（按月分区），均使用 COMPRESSED 行格式
-- 注意：分区表要求分区键必须包含在所有 UNIQUE 与 PRIMARY KEY 中

-- ============================================
-- 1. 删除旧表
-- ============================================
DROP TABLE IF EXISTS `observability_events`;

-- ============================================
-- 2. 业务事件表（按年 RANGE 分区，永久保留）
-- ============================================
CREATE TABLE `observability_events` (
    `id`                    BIGINT NOT NULL AUTO_INCREMENT,
    `event_id`              VARCHAR(36) NOT NULL,
    `user_id`               VARCHAR(64) NOT NULL,
    `event_type`            VARCHAR(32) NOT NULL,
    `question_length`       INT NULL,
    `model_id`              VARCHAR(128) NULL,
    `channel_id`            VARCHAR(128) NULL,
    `session_id`            VARCHAR(64) NULL,
    `workspace_id`          VARCHAR(64) NULL,
    `result`                VARCHAR(16) NULL,
    `response_duration_ms`  INT NULL,
    `client_version`        VARCHAR(32) NOT NULL,
    `client_platform`       VARCHAR(32) NOT NULL,
    `client_os_version`     VARCHAR(64) NULL,
    `created_at`            DATETIME NOT NULL,
    PRIMARY KEY (`id`, `created_at`),
    UNIQUE KEY `uk_event_id` (`event_id`, `created_at`),
    KEY `idx_event_type_created` (`event_type`, `created_at`),
    KEY `idx_user_id_created` (`user_id`, `created_at`),
    KEY `idx_created_at` (`created_at`),
    KEY `idx_client_version` (`client_version`)
)
ENGINE=InnoDB
ROW_FORMAT=COMPRESSED
KEY_BLOCK_SIZE=8
DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(`created_at`)) (
    PARTITION p_2026 VALUES LESS THAN (2027),
    PARTITION p_2027 VALUES LESS THAN (2028),
    PARTITION p_2028 VALUES LESS THAN (2029),
    PARTITION p_2029 VALUES LESS THAN (2030),
    PARTITION p_2030 VALUES LESS THAN (2031),
    PARTITION p_max  VALUES LESS THAN MAXVALUE
);

-- ============================================
-- 3. 异常事件表（按月 RANGE 分区，保留 6 个月）
-- ============================================
CREATE TABLE `observability_errors` (
    `id`                    BIGINT NOT NULL AUTO_INCREMENT,
    `event_id`              VARCHAR(36) NOT NULL,
    `user_id`               VARCHAR(64) NOT NULL,
    `session_id`            VARCHAR(64) NULL,
    `workspace_id`          VARCHAR(64) NULL,
    `error_type`            VARCHAR(64) NULL,
    `error_message`         TEXT NULL,
    `error_stack`           VARCHAR(1000) NULL,
    `error_fingerprint`     VARCHAR(64) NULL,
    `error_status_code`     INT NULL,
    `breadcrumbs`           TEXT NULL,
    `tags`                  TEXT NULL,
    `client_version`        VARCHAR(32) NOT NULL,
    `client_platform`       VARCHAR(32) NOT NULL,
    `client_os_version`     VARCHAR(64) NULL,
    `created_at`            DATETIME NOT NULL,
    PRIMARY KEY (`id`, `created_at`),
    UNIQUE KEY `uk_event_id` (`event_id`, `created_at`),
    KEY `idx_fingerprint_created` (`error_fingerprint`, `created_at`),
    KEY `idx_user_id_created` (`user_id`, `created_at`),
    KEY `idx_created_at` (`created_at`),
    KEY `idx_client_version` (`client_version`)
)
ENGINE=InnoDB
ROW_FORMAT=COMPRESSED
KEY_BLOCK_SIZE=8
DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
    PARTITION p_202601 VALUES LESS THAN (TO_DAYS('2026-02-01')),
    PARTITION p_202602 VALUES LESS THAN (TO_DAYS('2026-03-01')),
    PARTITION p_202603 VALUES LESS THAN (TO_DAYS('2026-04-01')),
    PARTITION p_202604 VALUES LESS THAN (TO_DAYS('2026-05-01')),
    PARTITION p_202605 VALUES LESS THAN (TO_DAYS('2026-06-01')),
    PARTITION p_202606 VALUES LESS THAN (TO_DAYS('2026-07-01')),
    PARTITION p_202607 VALUES LESS THAN (TO_DAYS('2026-08-01')),
    PARTITION p_max    VALUES LESS THAN MAXVALUE
);
