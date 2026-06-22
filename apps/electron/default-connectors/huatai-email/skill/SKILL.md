---
name: huatai-email-setup
description: >
  安装和配置华泰证券企业邮箱的 MCP 工具 (mcp-email-server)。
  当用户提到"华泰邮箱"、"htsc邮箱"、"华泰邮件"、"htemail"、"配置企业邮箱MCP"、
  "邮件MCP配置"、"华泰证券邮箱"、"@htsc.com 邮箱"、"公司邮箱MCP"，
  或者需要在 WorkMate 中接入华泰邮箱的 IMAP/SMTP 能力时使用本技能。
  本技能会逐步引导用户完成 pip 安装、清华镜像源配置、只读IMAP配置、连接验证，
  并在用户确认后再配置 SMTP 发信能力。
version: "1.0.0"
author: 信息技术部运营管理室AI研发效能管理团队 - 秦晓012950
---

# 华泰证券企业邮箱 MCP 配置指南

你是一个帮助用户在 WorkMate 伴行中配置华泰证券企业邮箱的助手。请严格按照以下步骤执行，不要跳过任何环节。

## 开始前：功能介绍与确认（必须暂停等用户确认）

在开始任何操作前，先向用户展示以下内容并**等待用户明确确认后再继续**：

---

这个 MCP Server（`mcp-email-server`）提供以下完整能力：

| 功能 | 说明 | 本次安装 |
|------|------|---------|
| 查看已配置邮箱账号 | 列出所有配置的邮箱账户 | 启用 |
| 列出邮件元数据 | 按收件箱列出邮件的主题、发件人、日期等 | 启用 |
| 读取邮件正文 | 根据邮件 ID 读取完整邮件内容 | 启用 |
| 移动邮件 | 在 IMAP 文件夹间移动邮件 | 启用 |
| 标记已读 | 将邮件标记为已读 | 启用 |
| 管理文件夹 | 列出和管理邮箱文件夹 | 启用 |
| 发送邮件 | 通过 SMTP 发送邮件 | **暂不启用** |
| 回复邮件 | 回复邮件并保持会话线程 | **暂不启用** |
| 删除邮件 | 删除指定邮件 | **暂不启用** |
| 下载附件 | 下载邮件附件到本地 | **暂不启用** |

> **本次安装策略**：出于安全考虑，首次只配置 IMAP 只读能力（查看邮件、读取内容）。发送、回复、删除、附件下载等写入类操作**暂不配置**。等只读验证通过后，再按需逐步开启。

然后使用 AskUserQuestion 向用户确认：

- **问题**："本次将只安装邮件读取相关能力，发送/删除/附件等功能暂不启用。是否继续？"
- **选项**：
  - "继续安装（只读模式）" — 进入下一步
  - "我需要完整功能" — 告知用户完整功能风险更高，建议仍然先只读验证，通过后再按第七步的说明自行添加 SMTP 配置
  - "先不装了" — 结束

**用户确认"继续安装"后，才能进入下一步。**

---

## 第一步：检查基础环境

首先检查用户系统中的 Python 和 pip 是否可用。

```bash
python3 --version && pip3 --version
```

如果 `python3` 不可用，试试 `python`：

```bash
python --version && pip --version
```

**如果 Python 或 pip 不可用**，告知用户需要先安装 Python，并调用 `install-python` Skill 来完成安装。Python 环境就绪后再继续后续步骤。

确定可用的 Python 和 pip 命令后，后续步骤统一使用该命令。

---

## 第二步：配置清华大学 PyPI 镜像源

华泰内网环境访问官方 PyPI 可能较慢，自动为用户配置清华镜像源。

检查是否已配置清华源：

```bash
pip config list 2>/dev/null | grep -i tsinghua
```

如果已有清华源配置，跳过此步骤。否则自动配置：

```bash
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
pip config set global.trusted-host pypi.tuna.tsinghua.edu.cn
```

配置完成后验证：

```bash
pip config list
```

告知用户清华镜像源已配置完成。

---

## 第三步：收集用户信息（暂停等用户输入）

在安装和配置前，需要向用户收集以下信息。

### 先告知用户隐私声明

在收集信息前，先展示以下隐私声明：

> **隐私说明**
> - 以下信息只会保存在您本地的 MCP 配置文件中（`~/.proma-dev/agent-workspaces/default/mcp.json`）
> - 密码不会上传到任何服务器，也不会被记录到日志
> - 配置文件位于本地工作区目录下，不会提交到 Git 仓库

### 收集方式

直接一次性告诉用户需要提供什么信息，让用户用空格分隔三项内容回复即可。

**提问方式：**

> 请按以下格式一次性提供你的华泰邮箱信息（三项之间用空格分隔）：
>
> `邮箱地址 密码 显示名称`
>
> 示例：`yourname@htsc.com 123456 你的姓名`
>
> - 显示名称是收件人看到的"发件人"字段中的名字，一般用中文姓名，不填则默认显示邮箱前缀

用户回复后，按空格拆分为三部分，依次记录为 `<用户邮箱地址>`、`<用户密码>`、`<用户显示名称>`。

### 收集完成后，向用户确认

回显确认（密码只显示首尾字符，中间隐藏）：

> 确认以下信息无误？
> - 邮箱地址：yourname@htsc.com
> - 密码：a**b（已隐藏中间部分）
> - 显示名称：你的姓名
>
> 确认无误后回复"确认"，我开始安装。

---

## 第四步：安装 mcp-email-server

使用 pip 安装：

```bash
pip install mcp-email-server
```

安装完成后验证：

```bash
which mcp-email-server
```

```bash
mcp-email-server --help
```

如果安装失败，检查网络连接和镜像源配置，然后重试。

安装成功后，告知用户：

> mcp-email-server 安装成功。接下来会修改 MCP 配置文件，写入华泰邮箱的只读 IMAP 配置。继续？

用户回复"继续"后进入第五步。

---

## 第五步：配置只读模式 MCP（核心安全原则）

**首次配置一定不要加 SMTP 参数。** 先确保 IMAP 只读模式能正常工作。

### 5.1 读取当前 MCP 配置文件

MCP 配置文件路径：`~/.proma-dev/agent-workspaces/default/mcp.json`

使用 Read 工具读取该文件，了解当前已有的服务器配置。

### 5.2 写入只读配置

使用 Edit 工具修改 mcp.json，将 `email` 条目更新为以下只读模式（不包含 SMTP 相关环境变量）：

```json
"email": {
  "type": "stdio",
  "enabled": true,
  "command": "mcp-email-server",
  "args": ["stdio"],
  "env": {
    "MCP_EMAIL_SERVER_ACCOUNT_NAME": "htsc",
    "MCP_EMAIL_SERVER_EMAIL_ADDRESS": "<用户填写的邮箱地址>",
    "MCP_EMAIL_SERVER_PASSWORD": "<用户填写的密码>",
    "MCP_EMAIL_SERVER_FULL_NAME": "<用户填写的显示名称>",
    "MCP_EMAIL_SERVER_USER_NAME": "<用户填写的邮箱地址>",
    "MCP_EMAIL_SERVER_IMAP_HOST": "htemail.htsc.com.cn",
    "MCP_EMAIL_SERVER_IMAP_PORT": "993",
    "MCP_EMAIL_SERVER_IMAP_SSL": "true"
  }
}
```

**重要说明：**
- 使用 Edit 工具精确修改，只更新 `servers.email` 条目，不要覆盖 mcp.json 中其他已有的服务器配置
- `<...>` 占位符要替换为用户在第三步提供的实际值
- 没有配置 `MCP_EMAIL_SERVER_SMTP_HOST`，因此 `send_email` 等发信工具不会暴露
- `command` 使用 `mcp-email-server`（pip 安装后的命令），不是 `uvx`

---

## 第六步：验证连接

配置写入后，直接开始验证：

### 6.1 列出可用邮箱账号

调用 MCP 工具 `mcp__email__list_available_accounts`，预期返回类似：

```
htsc - yourname@htsc.com (IMAP: htemail.htsc.com.cn:993)
```

### 6.2 列出收件箱最近的邮件

调用 MCP 工具 `mcp__email__list_emails_metadata`，参数：`account_name="htsc"`, `page=1`, `page_size=5`。

预期返回最近 5 封邮件的主题、发件人、日期。

### 6.3 读取一封邮件正文

选取上一步结果中第一封邮件的 email_id，调用 `mcp__email__get_emails_content`：

参数：`account_name="htsc"`, `email_ids=["<第一封邮件的ID>"]`

---

如果以上三步全部通过：

> IMAP 只读模式配置成功，华泰邮箱已正常连接，可以正常读取邮件！

如果某一步失败，根据错误诊断：
- **认证失败**：检查密码是否正确
- **连接超时**：检查是否在华泰内网环境
- **SSL 错误**：确认 IMAP SSL 端口为 993
- **命令未找到**：确认 `mcp-email-server` 已正确安装且在 PATH 中

---

## 第七步：后续如何开启 SMTP 发信能力（信息告知，不主动引导）

只读模式验证通过后，一句话告知即可，**不要主动询问用户是否现在开启，不要贴配置代码**：

> 当前只读模式已正常运行。如需开启发信能力，随时对我说"给华泰邮箱增加发信能力"，我会帮你完成配置。

当用户后续主动要求增加发信能力时，更新 mcp.json，在 `email.env` 中追加以下 SMTP 配置项：

```json
"MCP_EMAIL_SERVER_SMTP_HOST": "htemail.htsc.com.cn",
"MCP_EMAIL_SERVER_SMTP_PORT": "25",
"MCP_EMAIL_SERVER_SMTP_SSL": "false",
"MCP_EMAIL_SERVER_SMTP_START_SSL": "true",
"MCP_EMAIL_SERVER_SAVE_TO_SENT": "true"
```

华泰 SMTP 使用端口 25 + STARTTLS。

---

## 第八步：完成

全部配置和验证通过后：

> 华泰邮箱 MCP 配置完成。你现在可以通过 Agent 操作邮箱了。
>
> **触发方式**：在对话中输入 `# email` 即可切换到邮箱 MCP 模式。
>
> **常用话术示例**：
> - "帮我检索近一个月收到的张三发的邮件"
> - "汇总下我今天收到的所有邮件"
> - "查看收件箱最新的 5 封邮件"
> - "搜索主题中包含'报销'的邮件"
> - "把收件箱中未读邮件标记为已读"
>
> 如需发信能力，随时说"给华泰邮箱增加发信能力"。

---

## 关键注意事项

- **不要跳过第六步的验证**。只读模式没通过，绝不配置 SMTP。
- **密码安全**：用户密码只存在于本地 mcp.json 中，绝不要打印或记录到日志。
- **华泰固定配置不可修改**：IMAP/SMTP 服务器地址、端口、SSL 设置是华泰的标准配置。
- **只更新 email 条目**：使用 Edit 工具修改 mcp.json 时，保留其他已有服务器配置。
- **保持命令一致性**：记住用户环境中可用的 Python/pip 命令形式（`python3` vs `python`, `pip3` vs `pip`），后续步骤保持一致。
- **MCP 工具名前缀**：WorkMate 中 MCP 工具名格式为 `mcp__<server名>__<工具名>`，本技能中 email server 的工具前缀为 `mcp__email__`。
- **不要提重启**：配置写入 mcp.json 后无需重启 WorkMate 即可生效。任何时候都不要说"重启客户端"之类的话。
