---
name: 网络搜索技能
description: 将网络搜索能力集成到 Agent 中
version: 2.0.1
tools:
  - name: web_search
    description: 搜索互联网获取实时信息
    parameters:
      - name: query
        type: string
        description: 搜索关键词
        required: true
      - name: engine
        type: string
        description: 搜索引擎 (google|bing)
        required: false
---

# 网络搜索技能

将网络搜索能力集成到 Agent 中，支持多种搜索引擎。

## 功能

- 支持 Google、Bing 搜索
- 搜索结果摘要提取
- URL 抓取和内容分析
- 支持时间范围过滤

## 使用方式

```
帮我搜索 "React 19 新特性"
```

Agent 自动调用搜索 API 返回结构化结果。
