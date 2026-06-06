---
name: feishu-lark-setup
description: >
  在 WorkMate 当前 Agent 工作区中接入飞书/Lark CLI 与飞书 Skills。
  当用户提到"安装飞书 CLI"、"配置飞书 CLI"、"对接飞书"、"接入 Lark"、
  "安装 lark-cli"、"飞书 auth"、"飞书登录"、"下载飞书 skills"、
  或需要让 Agent 使用飞书文档、云盘、日历、IM、审批、多维表格等能力时使用本技能。
  本技能会检查 npm/npx 环境，执行 npx @larksuite/cli@latest install，
  引导用户按飞书 CLI 标准流程完成 config、auth login 和 auth status，
  并从华泰网盘下载飞书 Skills zip，解压后安装到当前 WorkMate workspace 的 skills 目录。
version: "1.0.0"
author: 信息技术部运营管理室AI研发效能管理团队 - 秦晓012950
---

# 飞书/Lark CLI 与 Skills 接入

你是帮助用户在 WorkMate 当前 Agent 工作区中接入飞书能力的助手。按下面步骤执行，涉及登录授权链接时必须让用户配合完成浏览器授权。

## 关键原则

- 前提是用户机器已安装 npm/npx；没有 npm 时先停止并提示用户安装 Node.js/npm。
- CLI 安装命令使用用户指定的方式：`npx @larksuite/cli@latest install`。
- CLI 配置、登录和验证使用飞书 CLI 标准流程：
  - `lark-cli config init --new`
  - `lark-cli auth login --recommend`
  - `lark-cli auth status`
- 飞书 Skills 不从官方 `npx -y skills add https://open.feishu.cn --skill -y` 下载。
- 飞书 Skills zip 来源固定为华泰网盘：`https://htpan.htsc.com.cn/l/nS5NaY`。
- 解压后的 `lark-*` Skill 目录必须安装到当前 WorkMate workspace 的 `skills/` 目录，不要放到会话临时目录。

## 第一步：确认当前 WorkMate workspace

先定位当前 workspace 的 slug 和 Skills 目录。

在 WorkMate 中，当前 workspace 的 Skills 目录通常是：

```text
<WorkMate 数据目录>/agent-workspaces/<workspace-slug>/skills/
```

如果已经在 Agent 会话里，可以优先从当前上下文、工作区信息或设置页中读取当前 workspace。不能确定时，读取 WorkMate 配置：

```bash
cat ~/.proma-dev/settings.json 2>/dev/null || cat ~/.proma/settings.json
cat ~/.proma-dev/agent-workspaces.json 2>/dev/null || cat ~/.proma/agent-workspaces.json
```

用 `settings.json` 中的 `agentWorkspaceId` 匹配 `agent-workspaces.json` 的 workspace `id`，得到 `slug`。开发版优先使用 `~/.proma-dev`，正式版使用 `~/.proma`。

## 第二步：检查 npm/npx

执行：

```bash
npm -v
npx -v
```

如果命令不可用，停止安装并告诉用户：

> 当前机器没有可用的 npm/npx。请先安装 Node.js/npm，安装完成后再继续飞书 CLI 接入。

不要在没有 npm/npx 的情况下继续。

## 第三步：安装飞书 CLI

执行：

```bash
npx @larksuite/cli@latest install
```

安装完成后验证：

```bash
lark-cli --version
lark-cli --help
```

如果 `lark-cli` 不在 PATH 中，检查安装命令输出，按提示补充 PATH 后重新验证。

## 第四步：初始化飞书 CLI 配置

执行：

```bash
lark-cli config init --new
```

如果命令要求填写应用或租户信息，按飞书 CLI 提示逐项引导用户完成。不要编造 App ID、Secret、租户或凭据。

## 第五步：登录授权

执行：

```bash
lark-cli auth login --recommend
```

命令输出授权链接时，把链接完整发给用户，并明确说明：

> 请在浏览器中打开这个授权链接，使用你的飞书账号完成授权。授权完成后告诉我"已完成授权"，我再继续验证。

必须等待用户确认授权完成后再继续。

## 第六步：验证授权状态

执行：

```bash
lark-cli auth status
```

如果显示已登录或 token 有效，继续安装飞书 Skills。否则根据错误信息指导用户重新执行 `lark-cli auth login --recommend`。

## 第七步：下载并解压华泰飞书 Skills 包

下载地址：

```text
https://htpan.htsc.com.cn/l/nS5NaY
```

优先用浏览器或企业网盘页面下载，文件名通常类似 `飞书skills.zip`。如果命令行可直连，也可以下载到临时目录：

```bash
mkdir -p /tmp/workmate-feishu-skills
curl -L 'https://htpan.htsc.com.cn/l/nS5NaY' -o /tmp/workmate-feishu-skills/feishu-skills.zip
```

如果该链接需要登录或跳转，改为让用户在浏览器中下载，并提供下载后的 zip 本地路径。

解压：

```bash
unzip -q /path/to/feishu-skills.zip -d /tmp/workmate-feishu-skills/extracted
```

解压后应看到多个 `lark-*` 目录，例如：

```text
lark-approval/
lark-apps/
lark-base/
lark-calendar/
lark-doc/
lark-drive/
lark-im/
lark-sheets/
...
```

每个有效目录都必须包含 `SKILL.md`。

## 第八步：安装解压后的 Skills 到当前 workspace

设：

```bash
SKILLS_DIR="<WorkMate 数据目录>/agent-workspaces/<workspace-slug>/skills"
EXTRACTED_DIR="/tmp/workmate-feishu-skills/extracted"
```

安装前检查重名。对每个 `lark-*` 目录：

- 如果 `$SKILLS_DIR/<skill-name>` 已存在，先询问用户是否覆盖。
- 如果用户不覆盖，则跳过该目录。
- 如果用户确认覆盖，先备份到同级目录，备份名加时间戳，例如 `<skill-name>.bak-YYYYMMDD-HHMMSS`，再复制新目录。
- 只复制包含 `SKILL.md` 的目录。

示例命令：

```bash
for skill_dir in "$EXTRACTED_DIR"/lark-*; do
  [ -d "$skill_dir" ] || continue
  [ -f "$skill_dir/SKILL.md" ] || continue
  name="$(basename "$skill_dir")"
  target="$SKILLS_DIR/$name"
  if [ -e "$target" ]; then
    echo "已存在同名 Skill: $name，需要用户确认是否覆盖"
    continue
  fi
  cp -R "$skill_dir" "$target"
done
```

如果需要覆盖，逐个确认后执行：

```bash
timestamp="$(date +%Y%m%d-%H%M%S)"
mv "$target" "$SKILLS_DIR/${name}.bak-${timestamp}"
cp -R "$skill_dir" "$target"
```

## 第九步：验证安装

检查当前 workspace 的 Skills 目录：

```bash
find "$SKILLS_DIR" -maxdepth 2 -name SKILL.md | grep '/lark-'
```

然后提醒用户回到 WorkMate：

> 飞书 CLI 和飞书 Skills 已安装完成。请在 WorkMate 的 Agent 设置页刷新 Skills，或重新打开 Agent 会话，让新安装的 `lark-*` Skills 生效。

如果用户要实际操作飞书文档、日历、云盘、消息、审批等能力，优先使用对应的 `lark-*` Skill，并在需要凭据或授权时调用 `lark-shared` 的认证流程。
