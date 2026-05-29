---
description: 从界面截图还原字段说明表
argument-hint: [图片路径或已上传截图] [可选补充说明]
---

执行 po-skill `image-analyse` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 按 po-skill 中对应步骤执行；不要把项目工作区中的 `common/` 或 `steps/` 当作内部目录
2. init.md 中的全局输出规范对本命令生效
3. 这是独立入口，不依赖工作空间，不创建 REQID，不生成 PRD，不默认写入文件
4. 用户未提供图片或图片路径时，提示用户上传截图或提供本地图片路径
