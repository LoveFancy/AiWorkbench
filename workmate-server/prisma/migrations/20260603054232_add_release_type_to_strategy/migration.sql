-- AlterTable
ALTER TABLE `upgrade_strategies` ADD COLUMN `release_type` ENUM('UPGRADE', 'ROLLBACK') NOT NULL DEFAULT 'UPGRADE';
