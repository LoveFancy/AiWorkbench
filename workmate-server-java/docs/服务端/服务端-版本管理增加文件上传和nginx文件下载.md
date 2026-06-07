# 服务端：版本管理增加文件上传和 Nginx 文件下载方案

编辑时间：2026年6月6日

> **关联文档**：[管理台前端设计](./服务端-管理台前端设计.md) | [WorkMate 升级检测和灰度升级管理](./服务端-workmate升级检测和灰度升级管理.md) | [开发与部署](./服务端-开发与部署.md)
>
> 本方案补充“发布版本管理”中的安装包上传、保存、下载链接生成和 Nginx 静态下载能力。管理台上传走 Spring Boot，客户端下载安装包走 Nginx 静态目录。

---

## 一、设计结论

版本文件不通过 Java 服务做下载转发。

推荐链路：

```text
管理台新增发布版本
  ↓
上传安装包到 Spring Boot
  ↓
Spring Boot 校验文件并保存到 Nginx 静态下载目录
  ↓
生成 downloadUrl、sha256、fileSize、fileName、packageType
  ↓
保存发布版本记录
  ↓
客户端升级检测接口返回 downloadUrl
  ↓
客户端直接通过 Nginx 下载安装包
```

职责划分：

| 模块 | 职责 |
|------|------|
| 管理台前端 | 在新增发布版本时上传安装包文件，展示上传结果和下载链接。 |
| Spring Boot | 接收上传、鉴权、校验、落盘、计算 hash、保存发布版本元数据。 |
| Nginx | 暴露 `/workmate/releases/` 静态下载路径，支持大文件下载和 Range 断点续传。 |
| 客户端 | 从升级检测接口获取 `downloadUrl`，下载后校验 `fileSize` 和 `sha256`。 |

---

## 二、目录与 URL 规范

### 2.1 服务器目录

安装包统一保存到：

```text
/app/workmate/releases/
```

按版本号分目录：

```text
/app/workmate/releases/
└── 1.2.0/
    ├── WorkMate-1.2.0-win32-x64.exe
    ├── WorkMate-1.2.0-darwin-arm64.dmg
    └── WorkMate-1.2.0-linux-x64.AppImage
```

上传临时目录：

```text
/app/workmate/upload-tmp/
```

上传过程必须先写临时文件，校验通过后再移动到正式目录，避免半成品被客户端下载。

### 2.2 文件名规范

服务端统一生成文件名，不直接使用用户上传文件名。

```text
WorkMate-{version}-{platform}-{arch}.{ext}
```

示例：

```text
WorkMate-1.2.0-win32-x64.exe
WorkMate-1.2.0-darwin-arm64.dmg
WorkMate-1.2.0-linux-x64.AppImage
```

字段来源：

| 字段 | 来源 |
|------|------|
| `version` | 管理台创建发布版本表单。 |
| `platform` | 管理台选择：`win32` / `darwin` / `linux`。 |
| `arch` | 管理台选择：`x64` / `arm64`。 |
| `ext` | 根据 `packageType` 或上传文件扩展名校验后确定。 |

### 2.3 下载 URL 规范

对外下载地址：

```text
http://eiplite.htsc.com.cn/workmate/releases/{version}/{fileName}
```

示例：

```text
http://eiplite.htsc.com.cn/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe
```

Nginx 映射关系：

```text
URL:  /workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe
FILE: /app/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe
```

---

## 三、管理台发布版本上传流程

参考 [管理台前端设计](./服务端-管理台前端设计.md) 中“升级管理 / 发布版本管理”。新增发布版本弹窗需要从“填写下载链接”调整为“上传安装包后生成下载链接”。

### 3.1 表单字段

```text
版本号 version
发布类型 releaseType：UPGRADE / ROLLBACK
平台 platform：win32 / darwin / linux
架构 arch：x64 / arm64
安装包文件 file
发布说明 releaseNotes
最低版本 minVersion
是否激活 isActive
```

### 3.2 上传接口

复用发布版本创建接口，改为 `multipart/form-data`：

```http
POST /workmate/console/upgrade/releases
Content-Type: multipart/form-data
```

请求字段：

```text
version=1.2.0
releaseType=UPGRADE
platform=win32
arch=x64
minVersion=1.0.0
releaseNotes=修复若干已知问题
isActive=true
file=<WorkMate 安装包>
```

响应示例：

```json
{
  "code": 0,
  "message": "创建成功",
  "data": {
    "id": 1001,
    "version": "1.2.0",
    "releaseType": "UPGRADE",
    "platform": "win32",
    "arch": "x64",
    "packageType": "exe",
    "fileName": "WorkMate-1.2.0-win32-x64.exe",
    "fileSize": 123456789,
    "sha256": "...",
    "downloadUrl": "http://eiplite.htsc.com.cn/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe"
  }
}
```

### 3.3 服务端处理步骤

```text
1. 管理台接口鉴权：EIP 工号解密 + admin_whitelist 校验。
2. 校验 version / releaseType / platform / arch / file。
3. 校验文件扩展名与 packageType 是否匹配。
4. 创建上传临时目录 /app/workmate/upload-tmp/。
5. 将上传内容写入临时文件。
6. 计算 fileSize。
7. 计算 sha256。
8. 生成标准 fileName。
9. 创建正式目录 /app/workmate/releases/{version}/。
10. 将临时文件原子移动到正式目录。
11. 生成 downloadUrl。
12. 保存发布版本记录。
13. 返回发布版本信息。
```

失败处理：

| 失败点 | 处理 |
|--------|------|
| 参数校验失败 | 返回 400，不写文件。 |
| 文件类型不支持 | 返回 400，删除临时文件。 |
| 写入临时文件失败 | 返回 500，删除临时文件。 |
| hash / size 计算失败 | 返回 500，删除临时文件。 |
| 移动正式文件失败 | 返回 500，删除临时文件和可能存在的正式文件。 |
| 数据库保存失败 | 删除正式文件，返回 500。 |

---

## 四、数据库字段建议

发布版本表需要保存文件下载和校验字段。

```text
upgrade_release
├── id
├── version
├── release_type       -- UPGRADE / ROLLBACK
├── platform           -- win32 / darwin / linux
├── arch               -- x64 / arm64
├── package_type       -- exe / dmg / appimage / deb / rpm
├── file_name
├── file_size
├── sha256
├── download_url
├── release_notes
├── min_version
├── is_active
├── created_by
├── created_at
└── updated_at
```

唯一约束建议：

```text
unique(version, release_type, platform, arch, package_type)
```

避免同一版本、平台、架构重复上传多个安装包。

---

## 五、Nginx 下载配置

当前 [nginx.conf](../../src/main/resources/nginx.conf) 采用“主框架 + 独立 server”模式：

```text
nginx.conf
  → http { include nginx-server.conf; }
```

因此下载 location 应添加到 [nginx-server.conf](../../src/main/resources/nginx-server.conf) 的 `server` 块内。

### 5.1 新增静态下载 location

在 `location /workmate/ { proxy_pass ... }` 前新增：

```nginx
# ========== WorkMate 安装包下载 ==========
location /workmate/releases/ {
    alias /app/workmate/releases/;

    autoindex off;

    add_header Accept-Ranges bytes;
    add_header Cache-Control "public, max-age=3600";

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;

    access_log /app/workmate/nginxlog/releases-access.log main;
    error_log  /app/workmate/nginxlog/releases-error.log warn;
}
```

放置顺序：

```nginx
location /workmate/admin/ {
    ...
}

location /workmate/releases/ {
    ...
}

location /workmate/ {
    proxy_pass http://127.0.0.1:6173;
    ...
}
```

`/workmate/releases/` 比 `/workmate/` 更具体，Nginx 会优先命中静态下载目录，不会转发到 Spring Boot。

### 5.2 上传接口大小配置

当前 [nginx-server.conf](../../src/main/resources/nginx-server.conf) 和 [nginx.conf](../../src/main/resources/nginx.conf) 中默认：

```nginx
client_max_body_size 1m;
```

安装包上传会超过 1MB，不建议全局放大，建议只对发布版本上传接口放大。

在通用 `/workmate/` 代理前新增更具体 location：

```nginx
# ========== 发布版本上传接口 ==========
location /workmate/console/upgrade/releases {
    client_max_body_size 2g;

    proxy_pass http://127.0.0.1:6173;
    proxy_http_version 1.1;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_set_header Connection "";
    proxy_connect_timeout 30s;
    proxy_read_timeout    300s;
    proxy_send_timeout    300s;

    proxy_request_buffering on;
}
```

注意：该 location 会覆盖 `POST /workmate/console/upgrade/releases`，也会匹配同前缀的列表接口。若只希望上传接口使用大文件配置，可以将创建接口单独设计为：

```http
POST /workmate/console/upgrade/releases/upload
```

对应 Nginx：

```nginx
location /workmate/console/upgrade/releases/upload {
    client_max_body_size 2g;
    proxy_pass http://127.0.0.1:6173;
    ...
}
```

推荐使用独立上传接口 `/workmate/console/upgrade/releases/upload`，避免影响发布版本列表、详情、更新等普通 JSON 接口。

### 5.3 完整 server 块结构建议

```nginx
server {
    listen 18080;
    server_name _;

    access_log /app/workmate/nginxlog/server-access.log main;
    error_log  /app/workmate/nginxlog/server-error.log warn;

    client_max_body_size 1m;

    location /workmate/admin/ {
        alias /app/workmate/web/;
        index  index.html;
        try_files $uri $uri/ /workmate/admin/index.html;
    }

    location /workmate/releases/ {
        alias /app/workmate/releases/;
        autoindex off;

        add_header Accept-Ranges bytes;
        add_header Cache-Control "public, max-age=3600";

        sendfile on;
        tcp_nopush on;
        tcp_nodelay on;

        access_log /app/workmate/nginxlog/releases-access.log main;
        error_log  /app/workmate/nginxlog/releases-error.log warn;
    }

    location /workmate/console/upgrade/releases/upload {
        client_max_body_size 2g;

        proxy_pass http://127.0.0.1:6173;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";

        proxy_connect_timeout 30s;
        proxy_read_timeout    300s;
        proxy_send_timeout    300s;
        proxy_request_buffering on;
    }

    location /workmate/ {
        proxy_pass http://127.0.0.1:6173;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";

        proxy_connect_timeout 30s;
        proxy_read_timeout    60s;
        proxy_send_timeout    30s;

        proxy_buffering    on;
        proxy_buffer_size  4k;
        proxy_buffers      8 16k;
    }

    location = / {
        return 301 /workmate/admin/;
    }
}
```

---

## 六、Spring Boot 配置

上传安装包时，Spring Boot multipart 限制也需要放大。

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 2GB
      max-request-size: 2GB
```

建议增加应用配置：

```yaml
workmate:
  upgrade:
    release-root-dir: /app/workmate/releases
    upload-temp-dir: /app/workmate/upload-tmp
    public-download-base-url: http://eiplite.htsc.com.cn/workmate/releases
```

`downloadUrl` 生成规则：

```text
{public-download-base-url}/{version}/{fileName}
```

示例：

```text
http://eiplite.htsc.com.cn/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe
```

---

## 七、接口拆分建议

推荐把“上传文件”和“创建发布版本记录”拆成两个动作，便于前端展示上传进度和失败重试。

### 7.1 上传安装包

```http
POST /workmate/console/upgrade/releases/upload
Content-Type: multipart/form-data
```

请求：

```text
version=1.2.0
platform=win32
arch=x64
packageType=exe
file=<安装包>
```

响应：

```json
{
  "code": 0,
  "message": "上传成功",
  "data": {
    "version": "1.2.0",
    "platform": "win32",
    "arch": "x64",
    "packageType": "exe",
    "fileName": "WorkMate-1.2.0-win32-x64.exe",
    "fileSize": 123456789,
    "sha256": "...",
    "downloadUrl": "http://eiplite.htsc.com.cn/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe"
  }
}
```

### 7.2 创建发布版本

```http
POST /workmate/console/upgrade/releases
Content-Type: application/json
```

请求：

```json
{
  "version": "1.2.0",
  "releaseType": "UPGRADE",
  "platform": "win32",
  "arch": "x64",
  "packageType": "exe",
  "fileName": "WorkMate-1.2.0-win32-x64.exe",
  "fileSize": 123456789,
  "sha256": "...",
  "downloadUrl": "http://eiplite.htsc.com.cn/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe",
  "releaseNotes": "修复若干已知问题",
  "minVersion": "1.0.0",
  "isActive": true
}
```

这种拆分的优点：

1. Nginx 只需要对 `/upload` 接口放大上传限制。
2. 普通发布版本接口仍保持 JSON 小请求。
3. 前端可以先显示上传成功，再提交版本信息。
4. 上传失败不会产生半成品发布记录。

如果希望一次提交，也可以保留 `POST /workmate/console/upgrade/releases` multipart 方式，但 Nginx location 和后端 controller 会更复杂。

---

## 八、安全与校验要求

### 8.1 上传校验

服务端必须校验：

1. 当前用户是否有管理台权限。
2. 文件不能为空。
3. 文件大小不能超过配置上限。
4. 文件扩展名必须与 `packageType` 匹配。
5. `platform` 与 `packageType` 必须匹配：
   - `win32`：`exe`
   - `darwin`：`dmg`
   - `linux`：`appimage` / `deb` / `rpm`
6. `version` 必须是 SemVer。
7. 目标正式文件已存在时默认拒绝覆盖，除非显式执行“重新上传”。
8. 生成文件名时禁止使用用户原始文件名参与路径拼接。

### 8.2 下载安全

Nginx 下载目录配置要求：

1. 只暴露 `/app/workmate/releases/`。
2. 关闭目录浏览：`autoindex off`。
3. 不允许通过 URL 访问上传临时目录。
4. 下载 URL 只由服务端生成，不由前端手填。
5. 客户端下载后必须校验 `fileSize` 和 `sha256`。

### 8.3 权限和目录

部署时需要确保 Spring Boot 进程和 Nginx 进程对目录权限满足：

```text
/app/workmate/releases/      Spring Boot 可写，Nginx 可读
/app/workmate/upload-tmp/    Spring Boot 可写，Nginx 不暴露
/app/workmate/nginxlog/      Nginx 可写
```

---

## 九、与升级检测接口的关系

升级检测接口不关心文件上传细节，只读取发布版本元数据并返回下载字段。

响应中必须包含：

```json
{
  "downloadUrl": "http://eiplite.htsc.com.cn/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe",
  "sha256": "...",
  "fileSize": 123456789,
  "fileName": "WorkMate-1.2.0-win32-x64.exe",
  "packageType": "exe"
}
```

客户端根据 `downloadUrl` 直接访问 Nginx，不再通过 Spring Boot 代理下载。

---

## 十、推荐实施顺序

```text
阶段 1：目录和配置
  - 新增 release-root-dir / upload-temp-dir / public-download-base-url 配置
  - 部署目录 /app/workmate/releases 和 /app/workmate/upload-tmp

阶段 2：Nginx 下载
  - 在 nginx-server.conf 新增 /workmate/releases/ location
  - 验证静态文件可下载
  - 验证 Range 请求

阶段 3：上传接口
  - 新增 /workmate/console/upgrade/releases/upload
  - 保存临时文件
  - 计算 fileSize 和 sha256
  - 移动到正式目录
  - 返回 downloadUrl

阶段 4：发布版本创建
  - 创建发布版本时保存 fileName / fileSize / sha256 / downloadUrl / packageType
  - 管理台新增版本表单接入上传

阶段 5：升级检测联调
  - 检测接口返回下载字段
  - 客户端下载并校验
```

---

## 十一、结论

采用：

```text
上传：管理台 → Spring Boot → /app/workmate/releases/
下载：客户端 → Nginx /workmate/releases/
```

这是当前最小改动、职责清晰、性能和可靠性都较好的方案。Spring Boot 负责版本管理和文件元数据，Nginx 负责静态文件下载。