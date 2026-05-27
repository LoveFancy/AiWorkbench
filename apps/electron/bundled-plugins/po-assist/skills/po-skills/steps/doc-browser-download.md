# doc-browser-download：通过浏览器下载 EIP/LinkApp 文档并转换（Legacy）

**状态：** Legacy。当前 `doc-convert` / `prd-write` 不再自动触发此步骤。识别到 EIP/LinkApp 云文档 URL 时，应返回 `CLOUD_DOC_MANUAL_DOWNLOAD_REQUIRED`，提示用户手工下载原始 `.doc/.docx/.pdf` 文件后再作为本地文件转换。

**触发场景：** 仅限人工调试或历史兼容。不要在主流程中自动加载。

**职责：** 使用 chrome-devtools MCP 在浏览器中打开文档页面，通过页面菜单触发下载，将下载文件拷贝到项目目录后执行 doc-to-md 转换。

**前置条件：**
- 插件中的 `chrome-devtools` MCP 使用独立 `--userDataDir` profile，每次打开独立 Chrome，不复用用户当前 Chrome。
- `npx chrome-devtools-mcp` 已安装（声明在 plugin.json 的 mcpServers 中）。
- 因为独立 profile 没有用户日常登录态，此步骤通常无法处理需要登录的 EIP/LinkApp 文档。主流程必须提示用户手工下载。

---

## 阶段 A：页面导航与文件名获取

**A0. Chrome DevTools MCP 会话检查与恢复**：

使用插件配置的独立 Chrome profile。不要尝试复用用户当前 Chrome，也不要要求用户配置 `--remote-debugging-port`。

如果调用 chrome-devtools MCP 时出现浏览器实例冲突，例如：

- "浏览器实例冲突"
- "现有的 Chrome DevTools MCP 浏览器会话正在运行"
- "无法建立新连接"
- "browser session is already running"
- "cannot create new connection"

处理规则：

1. 不要直接要求用户关闭浏览器。
2. 先尝试复用当前 MCP 会话：调用 `take_snapshot` 或读取当前页面状态；如果能拿到页面快照，直接在该会话中继续执行 A1。
3. 如果无法复用，尝试通过 chrome-devtools MCP 的页面列表/选择页面能力切换到已有页面，再继续执行 A1。
4. 如果独立 Chrome 无法启动或连接，停止自动下载，返回稳定错误码 `MCP_BROWSER_NOT_CONNECTED`。
5. 如果 MCP 已经返回不可恢复的连接错误，停止自动下载，返回稳定错误码 `MCP_BROWSER_CONFLICT`。
6. 只有自动恢复失败后，才提示用户手工下载文件后继续转换。

错误提示必须包含：

```text
MCP_BROWSER_CONFLICT：Chrome DevTools MCP 浏览器会话冲突，已尝试复用/切换现有会话但失败。
请手工下载文件后提供本地文件路径继续转换。
```

**A1. 导航到目标 URL**：

```
mcp__Chrome-devtools__navigate_page → url
类型：url
```

- LinkApp 短链（`linkapp.htsc.com.cn/S/`）→ navigate 后自动重定向，等待最终页面加载
- EIP 文档（`eip.htsc.com.cn/htscPortalDocs/docs-for-preview-v2`）→ 直接加载

**A2. 等待页面加载**：

```
mcp__Chrome-devtools__wait_for → selector: ".right-e1267a .more-e1267a"
```

至少等右上角“更多”按钮出现，再进入下载阶段。超时 15s，超时则提示用户检查是否已登录或页面是否仍在加载。

**A3. 读取文件名**：

```
mcp__Chrome-devtools__evaluate_script → 
  () => document.querySelector('#filename')?.textContent?.trim() || ''
```

如果 `#filename` 为空，可回退到 `document.title`。

记录文件名，后续用于：
- 匹配下载目录中的文件
- 作为 references 子目录中的文件名

---

## 阶段 B：触发下载

**B0. 定位并点击菜单按钮**（页面右上角工具栏）：

定位原则：**CSS 固定定位优先，snapshot 只作为诊断**。

当前 EIP/LinkApp 页面右上工具栏结构稳定，更多菜单按钮固定在：

```
.right-e1267a .more-e1267a
```

优先执行：

```
mcp__Chrome-devtools__evaluate_script →
() => {
  const root = document.querySelector('.right-e1267a');
  if (!root) return 'MENU_ROOT_NOT_FOUND';
  const button = root.querySelector('.more-e1267a');
  if (!button) return 'MENU_BUTTON_NOT_FOUND';
  button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
  button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }));
  button.click();
  return 'MENU_BUTTON_CLICKED';
}
```

如果返回 `MENU_ROOT_NOT_FOUND` 或 `MENU_BUTTON_NOT_FOUND`，先只在右上工具栏内部做一次语义扫描，再用 `take_snapshot` 兜底。

**B1. 等待下拉菜单容器出现**：

点击 more 后，先等待下拉菜单容器出现：

```
mcp__Chrome-devtools__wait_for → selector: ".docs-ant-popover-inner .dropdDown-e1267a"
```

如果 3s 内未出现，再退一步等待：

```
mcp__Chrome-devtools__wait_for → selector: ".docs-ant-popover-inner-content"
```

仍未出现则进入兜底。

**B2. 在下拉菜单容器内点击"下载"**：

只在下拉菜单容器内部找“下载”，不要全页扫描。

推荐脚本：

```
mcp__Chrome-devtools__evaluate_script →
() => {
  const container =
    document.querySelector('.docs-ant-popover-inner .dropdDown-e1267a') ||
    document.querySelector('.docs-ant-popover-inner-content');
  if (!container) return 'MENU_CONTAINER_NOT_FOUND';

  const items = [...container.querySelectorAll('*')];
  const target = items.find((el) => {
    const text = (el.textContent || '').trim();
    return text === '下载' && !/图片下载|附件下载|模板下载|批量下载/.test(text);
  });
  if (!target) return 'DOWNLOAD_ITEM_NOT_FOUND';

  const clickable = target.closest('div,button,span') || target;
  clickable.click();
  return 'DOWNLOAD_ITEM_CLICKED';
}
```

如果返回 `MENU_CONTAINER_NOT_FOUND` 或 `DOWNLOAD_ITEM_NOT_FOUND`，再用 `take_snapshot` 只做一次兜底。

---

## 阶段 C：下载文件定位与拷贝

**C1. 等待下载文件**：

点击"下载"后，直接调用 helper 按标题查找下载目录中的最新稳定文件：

```bash
python3 <技能根目录>/scripts/cloud_download_finder.py wait \
  --expected-title "<阶段A3获取到的文件名>" \
  --timeout 60
```

读取 stdout 中的 `DOWNLOAD_FILE=<路径>`。helper 内部会执行标题匹配、排除 `.crdownload` / `.download` / `.tmp` / `.part`、等待文件大小稳定、候选不唯一返回 `DOWNLOAD_AMBIGUOUS`。

> 禁止直接用 `ls -t ~/Downloads | head -1` 猜测文件。超时返回 `DOWNLOAD_TIMEOUT`，不要拿旧文件兜底。

**C2. 拷贝到项目目录**：

```bash
cp "<DOWNLOAD_FILE路径>" "{REFERENCES_DIR}/<文件名>"
```

---

## 阶段 D：文档转换

拷贝完成后，对下载的文件执行 doc-to-md：

```bash
python <技能根目录>/run.py doc-to-md \
    --file "{REFERENCES_DIR}/<文件名>" \
    --output-dir "{DESIGN_DIR}"
```

后续流程同 doc-to-md：stdout 输出 `OUTPUT_FILE=<路径>`，有图片则自动串联 enhance-content。

---

## 阶段 E：完成输出

```
✅ 文档下载并转换完成！
- 下载文件：<references/文件名>
- [PROD_ORI]：<路径>

下一步：/story-analyze <[PROD_ORI]路径>
```

---

## 阶段 F：关闭浏览器页面

下载和转换成功后，执行 best-effort 收尾：

1. 调用 `mcp__Chrome-devtools__list_pages`
2. 找到当前云文档页面对应的 `pageId`
3. 调用 `mcp__Chrome-devtools__close_page → pageId: <当前页面>`

注意：

- 只关闭当前页面，不强制关闭整个浏览器进程
- 如果当前只剩最后一个 page，`close_page` 可能不会成功；这种情况直接忽略，不影响主流程成功
- 关闭页面失败时，不要把整个下载流程判定为失败

---

## 错误处理

| 问题 | 处理 |
|------|------|
| Chrome DevTools MCP 无法连接独立 Chrome | 返回 `MCP_BROWSER_NOT_CONNECTED`，提示用户手工下载后提供本地文件路径继续转换 |
| Chrome DevTools MCP 浏览器实例冲突 | 返回 `MCP_BROWSER_CONFLICT`，提示用户手工下载后提供本地文件路径继续转换 |
| 页面加载超时 | 提示"页面加载超时，请手工下载文件后提供本地文件路径继续转换" |
| 文件名未找到 | 将文件名设为页面 title（`document.title`），提示用户确认 |
| 菜单按钮未找到 | 先限定右上工具栏区域按语义查找“更多/菜单”，失败后再回退 `.more-e1267a`；仍失败则提示用户手动点击 |
| 菜单未展开 | 等待 `.dropdDown-e1267a` 或 `.docs-ant-popover-inner-content`；仍未出现则提示用户手动点击 |
| 下载菜单项未找到 | 只在下拉菜单容器内查找“下载”，排除图片/附件/模板等非整篇文档下载项；失败则提示用户手动点击 |
| 下载候选不唯一 | 返回 `DOWNLOAD_AMBIGUOUS` 并列出候选文件，禁止猜测 |
| 下载超时（60s） | 返回 `DOWNLOAD_TIMEOUT`，提示"下载超时，请手动点击下载并将文件放入 {REFERENCES_DIR}/" |
| 下载文件格式不支持 | 检查扩展名，只支持 .doc/.docx/.pdf/.xlsx/.xls，不支持则提示 |
| 关闭页面失败 | 忽略关闭失败，不影响下载与转换成功结果 |
