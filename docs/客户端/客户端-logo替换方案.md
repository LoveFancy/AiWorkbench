# WorkMate 客户端 Logo 替换方案

> 本文档描述 WorkMate（Proma）客户端中所有 Logo 图片资源的分布、用途、生成方法及替换步骤。
> 适用于：重新设计品牌 Logo 后需全量替换的场景。

---

## 一、整体结构概览

Logo 资源在项目中分为 **5 个类别**，共涉及 **约 36 个图片文件**：

| 类别 | 涉及文件数 | 典型用途 | 替换优先级 |
|------|-----------|---------|-----------|
| 应用主图标（App Icon） | 4（1 源 + 3 生成产物） | 安装后桌面图标、Dock、任务栏、窗口图标 | ★★★ 最高 |
| 系统托盘图标（Tray Icon） | 4（1 源 + 3 生成产物） | 菜单栏/系统托盘图标 | ★★★ 最高 |
| 品牌变体素材（Brand Variants） | 28（14 变体 × 2 目录） | Dock 图标切换、品牌素材下载 | ★★ 中 |
| 对话模型/渠道 Logo | 1 个 PNG + 1 行正则 | 对话消息头、模型选择器、渠道列表 | ★★ 中 |
| 内置插件图标 | 1 个 PNG | Superpowers 插件图标 | ★ 低 |

---

## 二、每类 Logo 的详细说明、生成与替换

---

### 2.1 应用主图标（App Icon）

这是用户最先看到的 Logo。影响安装后桌面图标、开始菜单、Dock、窗口标题栏等。

#### 2.1.1 涉及文件

| 文件路径 | 格式 | 尺寸 | 类型 |
|----------|------|------|------|
| `apps/electron/resources/icon.svg` | SVG | 1024×1024 | **源头文件**，需手动设计替换 |
| `apps/electron/resources/icon.png` | PNG | 1024×1024 | 由 SVG 生成 |
| `apps/electron/resources/icon.icns` | ICNS | 多尺寸 | 由 SVG 生成（仅 macOS） |
| `apps/electron/resources/icon.ico` | ICO | 多尺寸 | 由 SVG 生成 |

#### 2.1.2 使用场景

**A. 安装后桌面图标（Windows）**
- 由 `electron-builder.yml` 中的 `win.icon: resources/icon.ico` 决定
- 用户在桌面、开始菜单、任务栏上看到的图标即此文件

**B. macOS Dock / 启动台 / Finder**
- 由 `electron-builder.yml` 中的 `mac.icon: resources/icon.icns` 决定
- 打包后位于 `WorkMate.app/Contents/Resources/` 目录

**C. 窗口标题栏图标 / 任务栏缩略图**
- Electron 窗口通过 BrowserWindow 的 icon 选项读取
- Windows/Linux 使用 `icon.ico` / `icon.png`，macOS 使用 `icon.icns`

**D. 动态 Dock 图标切换（macOS 专属）**
- 用户在"设置 → 外观"中可选择 Dock 图标变体（见 2.3 节）
- 代码位置：`src/main/index.ts` 启动时读取 `settings.appIconVariant`，调用 `app.dock.setIcon()`
- 当 variant 为 `'default'` 时，使用 `resources/icon.png`

**E. 文件关联图标**
- `.proma-backup` / `.proma-share` 文件在 Windows 资源管理器中的图标
- 由 `electron-builder.yml` 中的 `win.fileAssociations[].icon` 指向 `icon.ico`

#### 2.1.3 打包配置引用

```yaml
# electron-builder.yml
mac:
  icon: resources/icon.icns        # ← macOS 应用图标
win:
  icon: resources/icon.ico         # ← Windows 应用图标
  fileAssociations:
    - ext: proma-backup
      icon: resources/icon.ico     # ← 备份文件关联图标
    - ext: proma-share
      icon: resources/icon.ico     # ← 分享文件关联图标

extraResources:
  - from: resources/icon.png       # ← 运行时 Dock 图标（default）
    to: icon.png
```

#### 2.1.4 从 SVG 生成平台图标

**设计要求**：
- SVG 画布 1024×1024 正方形
- 视觉元素居中，边距约 10%
- 背景建议为纯色（便于在各平台裁剪为不同圆角）

**macOS 下生成（推荐，一键）**：
```bash
cd apps/electron/resources
bash generate-icons.sh   # 从 icon.svg 自动生成 icon.png / .icns / .ico
```

所需工具：`rsvg-convert`（`brew install librsvg`）、`magick`（`brew install imagemagick`）、`iconutil`（macOS 自带）。

---

**Windows 下生成（PowerShell + ImageMagick）**：

先安装 [ImageMagick](https://imagemagick.org/script/download.php#windows)（exe 安装，勾选"Add to PATH"），然后在 PowerShell 中执行：

```powershell
cd apps\electron\resources

# 1. 从 icon.svg 生成 1024×1024 PNG
magick -background none icon.svg -resize 1024x1024 icon.png

# 2. 生成 Windows ICO（含 256/128/96/64/48/32/16 多尺寸）
magick icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

> **ICNS 无法在 Windows 直接生成**（macOS 专有格式）。如果你当前只构建 Windows 版本，可暂时跳过；后续在 macOS 构建机上重新生成即可。或者用在线工具（如 cloudconvert.com）上传 `icon.png` 转 icns。

---

**如果不用 ImageMagick 的替代方案**：

| 工具 | 生成方式 |
|------|---------|
| Inkscape（免费） | 打开 SVG → 导出 PNG → 在线工具转 ICO |
| GIMP（免费） | 打开 SVG → 缩放 → 导出 PNG → 导出 ICO |
| [icoconverter.com](https://www.icoconverter.com) | 上传 PNG → 转 ICO |

#### 2.1.5 替换步骤

1. 设计好新 Logo SVG，替换 `apps/electron/resources/icon.svg`
2. 按 2.1.4 重新生成 `icon.png`、`icon.ico`（和 `icon.icns`）
3. 删除 `apps/electron/out/` 目录（清理旧打包缓存）
4. 重新构建验证

---

### 2.2 系统托盘图标（Tray Icon）

应用启动后显示在 macOS 菜单栏或 Windows 系统托盘区的小图标。

#### 2.2.1 涉及文件

| 文件路径 | 格式 | 尺寸 | 类型 |
|----------|------|------|------|
| `apps/electron/resources/proma-logos/icon.svg` | SVG | — | **源头文件**，需手动设计替换 |
| `apps/electron/resources/proma-logos/iconTemplate.png` | PNG | 22×22 | @1x，由 SVG 生成 |
| `apps/electron/resources/proma-logos/iconTemplate@2x.png` | PNG | 44×44 | @2x Retina，由 SVG 生成 |
| `apps/electron/resources/proma-logos/iconTemplate@3x.png` | PNG | 66×66 | @3x 高分辨率，由 SVG 生成 |

#### 2.2.2 使用场景

**A. macOS 菜单栏图标**
- 用户启动应用后，在屏幕右上角菜单栏显示
- 点击可弹出菜单：打开 WorkMate、新建对话、退出等
- 代码位置：`src/main/tray.ts` 的 `createTray()` 函数
- 关键逻辑：macOS 下调用 `image.setTemplateImage(true)`，系统会根据菜单栏深浅色自动反色
- **因此图标必须是单色黑色形状 + 透明背景**，否则反色会出问题

**B. Windows 系统托盘图标**
- 任务栏右下角通知区（系统托盘）显示
- 使用相同的 `iconTemplate.png`（Windows 不识别 Template 标记，以普通 PNG 显示）

#### 2.2.3 代码引用

```typescript
// src/main/tray.ts
function getTrayIconPath(): string {
  const resourcesDir = app.isPackaged
    ? join(process.resourcesPath, 'proma-logos')
    : join(__dirname, 'resources/proma-logos');
  return join(resourcesDir, 'iconTemplate.png');  // ← 托盘图标路径
}

const image = nativeImage.createFromPath(iconPath);
if (process.platform === 'darwin') {
  image.setTemplateImage(true);  // ← macOS 自动适配深浅色
}
```

#### 2.2.4 从 SVG 生成托盘图标

**设计要求**：
- 必须为**纯黑色单色 SVG**（`#000`）+ 透明背景
- 形状简洁，在小尺寸（22×22px）下可辨识
- 不要包含渐变、阴影等复杂效果

**macOS 下生成**：
```bash
cd apps/electron/resources
bash generate-icons.sh   # 同时处理主图标和托盘图标
```

单独只生成托盘 PNG：
```bash
cd apps/electron/resources
rsvg-convert -w 22 -h 22 proma-logos/icon.svg -o proma-logos/iconTemplate.png
rsvg-convert -w 44 -h 44 proma-logos/icon.svg -o proma-logos/iconTemplate@2x.png
rsvg-convert -w 66 -h 66 proma-logos/icon.svg -o proma-logos/iconTemplate@3x.png
```

---

**Windows 下生成（PowerShell + ImageMagick）**：
```powershell
cd apps\electron\resources\proma-logos

magick -background none icon.svg -resize 22x22   iconTemplate.png
magick -background none icon.svg -resize 44x44   iconTemplate@2x.png
magick -background none icon.svg -resize 66x66   iconTemplate@3x.png
```

#### 2.2.5 替换步骤

1. 设计新的托盘 SVG（纯黑 + 透明背景），替换 `apps/electron/resources/proma-logos/icon.svg`
2. 按 2.2.4 重新生成 3 个 `iconTemplate*.png`
3. 删除 `apps/electron/out/` 目录
4. 启动应用检查：浅色菜单栏和深色菜单栏都要看一遍
5. 如果深色菜单栏下图标看不清 → 说明 SVG 不是纯黑单色或有背景，需修正

---

### 2.3 品牌变体素材（Brand Variants）

14 个不同配色/风格的 Logo 变体。用于：用户切换 Dock 图标、下载用作第三方平台（飞书/钉钉等）机器人头像。

#### 2.3.1 重要：两个镜像目录

品牌变体 PNG 同时存在两套目录，**替换时必须两边同步**：

| 目录 | 路径前缀 | 作用 |
|------|---------|------|
| **运行时目录** | `apps/electron/resources/proma-logos/` | 下载时读取的源文件 + Dock 切换源 |
| **渲染时目录** | `apps/electron/src/renderer/assets/bots/proma-logos/` | 设置页 UI 预览图（Vite import 打包） |

如果只换一边，会出现"预览图是新 Logo，下载出来却是旧图"之类的问题。

#### 2.3.2 文件列表

每个变体在两个目录下各存一份，文件名相同：

| 变体 ID | 文件名 | 用途说明 |
|---------|--------|---------|
| black | `proma-black.png` | 经典黑背景 |
| white | `proma-white.png` | 纯白背景 |
| blue | `proma-blue.png` | 品牌蓝 |
| purple | `proma-purple.png` | 紫色版 |
| gradient | `proma-gradient.png` | 蓝紫渐变 |
| transparent | `proma-transparent.png` | 透明底（可叠加任意背景色） |
| coral | `proma-coral.png` | Pantone 2019 珊瑚橘 |
| veri-peri | `proma-veri-peri.png` | Pantone 2022 长春花蓝 |
| viva-magenta | `proma-viva-magenta.png` | Pantone 2023 非凡洋红 |
| mocha-mousse | `proma-mocha-mousse.png` | Pantone 2025 摩卡慕斯 |
| emerald | `proma-emerald.png` | Pantone 2013 翡翠绿 |
| 8bit | `proma-8bit.png` | 像素风 |
| cyberpunk | `proma-cyberpunk.png` | 赛博朋克 |
| futuristic | `proma-futuristic.png` | 未来金属质感 |

共 **14 个变体 × 2 套目录 = 28 个文件**。

#### 2.3.3 使用场景 A：Dock 图标切换（macOS）

**功能入口**：设置 → 外观 → "应用图标"选择器

**流程**：
1. `AppearanceSettings.tsx` 中 `ICON_VARIANTS` 数组提供 15 个选项（含 default）
2. 用户选择某个变体 → `window.electronAPI.setAppIcon(variantId)` 通知主进程
3. 主进程 `src/main/ipc.ts` 中 `resolveAppIconPath()` 解析路径为 `proma-logos/proma-{variantId}.png`
4. `app.dock.setIcon()` 更换 Dock 图标，并持久化 `settings.appIconVariant`

```typescript
// src/main/ipc.ts
export function resolveAppIconPath(variantId: string): string | null {
  if (!variantId || variantId === 'default') {
    return join(resourcesDir, 'icon.png');        // ← 使用默认 icon.png
  }
  return join(resourcesDir, 'proma-logos', `proma-${variantId}.png`);  // ← 使用变体
}
```

#### 2.3.4 使用场景 B：品牌素材下载页面

**功能入口**：设置 → 机器人平台 → "品牌素材"标签页

- 14 个变体以网格卡片展示（带预览背景色）
- 每个卡片右下角有"下载"按钮
- 下载走运行时目录：`resources/proma-logos/proma-{id}.png`

```typescript
// src/renderer/components/settings/PromaLogoSettings.tsx
const LOGO_VARIANTS = [
  { id: 'black', resourcePath: 'proma-logos/proma-black.png', src: promaBlackLogo, ... },
  // ... 13 more
];
```

#### 2.3.5 如何生成品牌变体

品牌变体**不是由脚本自动生成的**，需要用设计工具手动制作：

1. 以 `icon.svg`（主图标）的视觉元素为基础
2. 在 Figma / Photoshop / Illustrator 中给每个变体叠加不同背景色和风格效果
3. 导出为 PNG（建议 1024×1024 或更大，正方形），文件名必须保持 `proma-{id}.png` 不变

为了方便批量换背景色，也可以用 ImageMagick 脚本辅助：
```powershell
# 示例：从透明底 Logo + 指定色背景合成（假设有一个纯图形透明的 base-logo.svg）
magick -size 1024x1024 xc:"#1e40af" base-logo.svg -composite proma-blue.png
magick -size 1024x1024 xc:"#6b21a8" base-logo.svg -composite proma-purple.png
# ... 依此类推
```

#### 2.3.6 替换步骤

1. 制作好 14 个新变体 PNG
2. 替换到 `apps/electron/resources/proma-logos/` 目录（运行时）
3. 替换到 `apps/electron/src/renderer/assets/bots/proma-logos/` 目录（UI 渲染）
4. **两个目录必须全部替换，文件名不变**
5. 进入设置 → 外观 → 应用图标选择器，确认预览图已更新
6. 进入设置 → 机器人平台 → 品牌素材，下载一张确认是新图

**如果不需要全部 14 个变体**：最少保留 black / white / blue / gradient 4 个基础变体，因为设置页代码固定引用了这 14 个 import，少文件会导致 Vite 打包报错。要缩减数量需要同步修改 `PromaLogoSettings.tsx` 和 `AppearanceSettings.tsx` 中的 import 和数组定义。

---

### 2.4 对话模型/渠道 Logo（AI Model Logo）

在 AI 对话界面中，当渠道被识别为 Proma 品牌时显示的 Logo。

#### 2.4.1 涉及文件

| 文件路径 | 格式 | 类型 |
|----------|------|------|
| `apps/electron/src/renderer/assets/models/proma.png` | PNG | **唯一文件**，直接替换 |
| `src/renderer/lib/model-logo.ts` 中 `/proma\.cool/i` | 正则 | 匹配规则，域名变化时需修改 |

#### 2.4.2 使用场景

以下所有位置，当渠道 Base URL 匹配 `proma.cool` 时，显示该 PNG：

| 展示位置 | 代码文件 |
|---------|---------|
| 对话消息气泡中的 AI 头像 | `ChatMessages.tsx`、`ChatMessageItem.tsx`、`ParallelChatMessages.tsx` |
| Agent 会话消息中的 AI 头像 | `AgentMessages.tsx`、`SDKMessageRenderer.tsx` |
| 模型选择器（对话头部下拉框） | `ModelSelector.tsx` |
| 渠道设置页的渠道列表图标 | `ChannelSettings.tsx` |
| 渠道表单的供应商图标 | `ChannelForm.tsx` |
| 会话预览小地图 | `SessionMiniMapPopover.tsx` |
| 滚动迷你图 | `scroll-minimap.tsx` |
| 标签页预览 | `TabPreviewPanel.tsx` |

另外在"设置 → 机器人平台"的左侧导航中，"品牌素材"标签页的图标也是此 PNG：
```typescript
// src/renderer/components/settings/BotHubSettings.tsx
import promaLogo from '@/assets/models/proma.png';
{ id: 'logos', name: '品牌素材', iconSrc: promaLogo }
```

#### 2.4.3 匹配规则

Logo 由 `src/renderer/lib/model-logo.ts` 按 **Base URL 域名正则** 匹配（第 3 层策略）：

```typescript
import PromaLogo from '@/assets/models/proma.png';

const URL_LOGO_MAP: Array<[RegExp, string]> = [
  [/proma\.cool/i, PromaLogo],   // ← 核心规则：URL 含 proma.cool
  // ... 其他 URL ...
];

export function getChannelLogo(channel) {
  // 泛化 provider 类型按 URL 域名识别真实品牌
  if (GENERIC_PROVIDERS.has(channel.provider) && channel.baseUrl) {
    for (const [regex, logo] of URL_LOGO_MAP) {
      if (regex.test(channel.baseUrl)) return logo;
    }
  }
  return getProviderLogo(channel.provider);
}
```

注意：Proma 在 `PROVIDER_LOGO_MAP` 和 `MODEL_LOGO_MAP` 中没有单独条目——它完全依赖 URL 域名匹配。

#### 2.4.4 替换步骤

1. 设计新的对话头像 PNG（建议 128×128 或 256×256 正方形，背景透明或圆角）
2. 直接覆盖 `apps/electron/src/renderer/assets/models/proma.png`
3. 如果 Proma 域名发生变化（比如从 `proma.cool` 改为 `proma.ai`），同步修改 `model-logo.ts` 中的正则：
   ```typescript
   [/proma\.(cool|ai)/i, PromaLogo],  // 示例：同时匹配旧域名
   ```
4. 进入对话页面，确认 Proma 渠道的消息头像已更新

---

### 2.5 内置插件图标

| 文件路径 | 说明 |
|----------|------|
| `apps/electron/bundled-plugins/superpowers/assets/app-icon.png` | Superpowers 内置插件的图标 |

- 通过 `electron-builder.yml` 的 `extraResources` 打包
- 插件加载时读取其自身资源目录中的 `app-icon.png`

#### 2.5.1 替换步骤

直接覆盖 `apps/electron/bundled-plugins/superpowers/assets/app-icon.png` 即可。

> 此项非必须，Superpowers 是一个次要内置插件，对整体品牌感知影响不大。

---

## 三、非图片的 "proma" 字符串

以下位置使用品牌名字符串或协议名，更换 Logo 时无需修改：

- `screenshot-service.ts` 中的 `proma-file:` 协议名
- `screenshot-service.ts` 中的截图文件名 `proma-${ts}.png`
- `.proma-backup` / `.proma-share` 文件扩展名
- `electron-builder.yml` 中的 `appId: com.proma.app`
- 这些是内部标识/协议名，属于代码层面的命名空间，与视觉 Logo 无关

---

## 四、替换后验证清单

替换完成后，逐项检查以下场景中 Logo 是否均为新图：

### 应用图标
- [ ] Windows 桌面快捷方式图标
- [ ] Windows 开始菜单图标
- [ ] Windows 任务栏图标
- [ ] Windows 文件关联图标（`.proma-backup` / `.proma-share` 文件）
- [ ] macOS Dock 图标
- [ ] macOS 启动台 / Finder 图标
- [ ] 窗口标题栏图标
- [ ] 设置 → 外观 → 应用图标选择器各变体预览正常
- [ ] 切换 Dock 图标变体后生效

### 托盘图标
- [ ] macOS 浅色菜单栏下清晰可见
- [ ] macOS 深色菜单栏下清晰可见（自动反色正常）
- [ ] Windows 系统托盘区正常显示

### 品牌素材
- [ ] 设置 → 机器人平台 → 品牌素材页 14 个预览图均为新图
- [ ] 点击下载，保存的 PNG 确为新图

### 对话模型
- [ ] 对话消息气泡中 Proma 模型的头像
- [ ] Agent 会话中 Proma 模型的头像
- [ ] 模型选择器下拉框中的图标
- [ ] 渠道设置页的渠道列表图标

### 构建产物
- [ ] 删除 `out/` 目录后重新打包
- [ ] 打包安装后的应用，所有图标均为新图（无旧缓存）

---

## 五、常见问题

**Q: 替换后老图标仍显示？**
- Windows：操作系统会缓存图标，尝试重建图标缓存或重启 `explorer`（任务管理器中重启 Windows 资源管理器进程）
- macOS：执行 `killall Dock` 刷新 Dock 图标；`killall SystemUIServer` 刷新菜单栏
- Electron 打包产物：务必删除 `out/` 目录后重新构建

**Q: 托盘图标在深色菜单栏看不清？**
- 检查 `resources/proma-logos/icon.svg` 是否为纯黑（`#000`）单色 + 透明背景
- 代码中 `setTemplateImage(true)` 必须在 macOS 下生效
- 如果图标包含颜色，深色模式下不会自动反色

**Q: 下载的品牌素材 PNG 是旧图？**
- 检查两套目录是否都替换了：`resources/proma-logos/`（运行时读取）和 `src/renderer/assets/bots/proma-logos/`（UI 预览）
- 两套必须一致

**Q: 品牌变体太多，不想全换怎么办？**
- 最少替换 4 个基础变体（black/white/blue/gradient），其余的用旧图顶着
- 彻底删除需要在代码中移除对应 import 和数组项，否则 Vite 找不到文件会报错

**Q: 不想保留 "Proma" 这个名字了？**
- 图片替换按本文档操作
- 文案替换需要全局搜索 "Proma" / "proma" / "WorkMate" 修改 UI 文本和配置（不在本文档范围内）
