# [STORY_FORMAT][<story_key>]：[Story 标题]

<!--
文件命名规范：
  [PROD_ORI]<需求名>.md          → Wiki 原始文档
  [PROD_FORMAT]<需求名>.md       → 结构化 PRD（含所有 Story）
  [REQ_ANALYSIS_LIST]<需求名>.md → 需求分析清单
  [STORY_PLAN]<需求名>.csv       → Story 规划表（含 story_key，可选：story-create 后新增 story_id 列）
  [STORY_FORMAT][<story_key>]<Story标题>.md → 本文件，单个 Story 独立文档

所有文件统一放在 <需求ID>/1.产品设计/ 目录下。
-->

## 基本信息

| 项 | 内容 |
|----|------|
| story_key | <story_key> |
| Story 描述 | [一句话描述该 Story 的核心价值] |
| 关联 PRD | `[PROD_FORMAT]<文件名>` 第 X 章 X.X 节 |
| 变更类型 | 新增 / 修改 / 删除 |
| 端侧 | PC / APP / 全端 |

## 菜单路径

<!-- 从 PRD 对应章节的 2.x.1 提取 -->

## 核心逻辑

<!-- 从 PRD 对应章节的 2.x.2 变更清单 + 各 MUC 子章节提取，保留图片 -->

## 流程

<!-- 按需填写。仅当该 Story 涉及多步骤流转、审批/工作流、跨页面跳转、状态变化或异常分支时，从 PRD 对应章节提取；简单 Story 删除此章节。不要为了套模板强制补流程图。 -->

## 交互设计

<!-- 按需填写。从 PRD 对应章节提取有实际信息的交互说明、表格和图片；没有原型/截图或特殊交互时删除此章节。 -->
