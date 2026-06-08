---
name: Excel 数据处理助手
description: 数据处理、公式计算和批量导出
version: 2.0.0
tools:
  - name: process_xlsx
    description: 处理 Excel 文件
    parameters:
      - name: file
        type: string
        description: Excel 文件路径
        required: true
      - name: action
        type: string
        description: 操作类型 (read|write|formula|pivot)
        required: true
---

# Excel 数据处理助手

Excel 数据处理助手，支持公式计算、数据清洗和批量导出。

## 功能

- 读取/写入 Excel 文件
- 公式自动计算
- 数据清洗与去重
- 数据透视表生成
- CSV/JSON 格式互转

## 使用方式

```
帮我把这份 sales.xlsx 按月份汇总销售额
```
