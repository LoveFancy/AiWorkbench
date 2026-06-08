-- V4: observability_events 表新增 question 列，存储用户提问原文（仅用户问题，不含 Agent 上下文）
ALTER TABLE `observability_events`
    ADD COLUMN `question` TEXT NULL COMMENT '用户提问原文（仅用户问题，不含 Agent 上下文）' AFTER `event_type`;
