---
name: PPT 创建助手
description: 快速生成精美的 PPT 演示文稿
version: 1.5.0
tools:
  - name: create_pptx
    description: 根据描述生成 PPT 文件
    parameters:
      - name: topic
        type: string
        description: PPT 主题
        required: true
      - name: slides
        type: number
        description: 幻灯片页数
        required: false
      - name: template
        type: string
        description: 模板风格 (business|tech|creative)
        required: false
---

# PPT 创建助手

快速生成精美的 PPT 演示文稿，支持多种模板和自定义样式。

## 功能

- 四种模板风格：商务 / 科技 / 创意 / 简约
- 自定义配色和字体
- 图片和图表自动插入
- 导出为 .pptx 格式

## 使用方式

```
帮我做一个关于"AI 在金融行业的应用"的 PPT，10 页，科技风格
```
