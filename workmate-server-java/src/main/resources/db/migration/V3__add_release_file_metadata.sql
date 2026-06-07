ALTER TABLE `upgrade_releases`
    ADD COLUMN `arch` VARCHAR(32) NULL AFTER `platform`,
    ADD COLUMN `package_type` VARCHAR(32) NULL AFTER `arch`,
    ADD COLUMN `file_name` VARCHAR(255) NULL AFTER `package_type`,
    ADD COLUMN `file_size` BIGINT NULL AFTER `file_name`,
    ADD COLUMN `sha256` VARCHAR(64) NULL AFTER `file_size`;
