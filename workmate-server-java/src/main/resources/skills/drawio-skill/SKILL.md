---
name: Draw.io 图表工具
description: 创建流程图、架构图和 UML 图表
version: 0.9.0
tools:
  - name: create_diagram
    description: 根据描述生成图表
    parameters:
      - name: type
        type: string
        description: 图表类型 (flowchart|sequence|class|architecture)
        required: true
      - name: description
        type: string
        description: 图表描述
        required: true
---

# Draw.io 图表工具

使用 Draw.io 创建流程图、架构图和 UML 图表。

## 功能

- 流程图（Flowchart）
- 时序图（Sequence Diagram）
- 类图（Class Diagram）
- 架构图（Architecture Diagram）

## 使用方式

```
帮我画一个用户登录流程图，包含成功和失败分支
```
