---
name: gitlab-cli
description: 华泰 GitLab CLI 工具。用于查询华泰内部 GitLab 项目、仓库文件、Issue、Merge Request、Pipeline、分支和提交。触发关键词包括 GitLab、glab、仓库、项目、MR、Merge Request、Issue、Pipeline、CI。
version: 1.0.0
---

# GitLab CLI

## Usage

使用本技能时直接调用 `glab` 命令。认证信息由 WorkMate 连接器在运行时注入，不要要求用户在对话中提供 Token，也不要在输出中展示 `GITLAB_TOKEN`。

运行环境由连接器注入：

- `GITLAB_HOST=gitlab.htzq.htsc.com.cn`
- `GITLAB_TOKEN`：华泰 GitLab Personal Access Token
- `GLAB_NO_PROMPT=true`
- `NO_COLOR=1`

所有 GitLab 操作只面向华泰内部 GitLab，不要切换 host，不要访问外部 GitLab SaaS。

## Supported Commands

优先使用结构化输出：

```bash
glab api user
glab repo view <group/project> --output json
glab repo list <group> --output json
glab issue list --repo <group/project> --output json
glab issue view <id> --repo <group/project> --output json
glab mr list --repo <group/project> --output json
glab mr view <id> --repo <group/project> --output json
glab pipeline list --repo <group/project> --output json
glab pipeline view <id> --repo <group/project> --output json
glab branch list --repo <group/project> --output json
glab api projects/:id/repository/files/:file_path/raw?ref=:ref
```

当 `glab` 原生命令缺少所需字段时，使用 `glab api` 调用 GitLab REST API，并保持 host 为华泰 GitLab。

## Safety

- 不要输出 Token 或任何认证环境变量的值。
- 不要执行会修改仓库、Issue、MR、Pipeline 或项目配置的命令，除非用户明确要求且命令能力已经确认。
- 不要执行 `glab auth login`、`glab auth token`、`glab auth status` 等会读取或改写用户全局认证状态的命令。
- 不要切换 GitLab host 或写入用户全局 glab 配置。
- 对破坏性操作，如删除分支、关闭 Issue/MR、重跑或取消 Pipeline，必须先向用户确认。
