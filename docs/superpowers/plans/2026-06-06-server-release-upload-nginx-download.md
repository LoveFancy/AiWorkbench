# Server Release Upload And Nginx Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side release package upload endpoint that stores files in the Nginx download directory, returns metadata including `downloadUrl`, and configures Nginx to serve release files.

**Architecture:** Spring Boot receives admin uploads at `/workmate/console/upgrade/releases/upload`, validates metadata and package type, writes to a temporary file, computes `sha256` and `fileSize`, then atomically moves the file to `/app/workmate/releases/{version}/`. The existing release creation endpoint continues saving `downloadUrl` into `upgrade_releases`, with optional file metadata added to the entity and mapper. Nginx serves `/workmate/releases/` from the static release directory and keeps upload size expansion scoped to the upload endpoint.

**Tech Stack:** Java 17, Spring Boot, MyBatis XML mappers, Flyway SQL migrations, Nginx.

---

### Task 1: Configuration And Response Types

**Files:**
- Modify: `d:/AiWorkbench/workmate-server-java/src/main/java/com/workmate/server/config/AppProperties.java`
- Create: `d:/AiWorkbench/workmate-server-java/src/main/java/com/workmate/server/dto/response/ReleaseUploadResponse.java`
- Modify: `d:/AiWorkbench/workmate-server-java/src/main/resources/application.yml`

- [ ] **Step 1: Add upgrade file storage properties**

Add this nested class and field to `AppProperties`:

```java
private Upgrade upgrade = new Upgrade();

@Data
public static class Upgrade {
    private String releaseRootDir = "/app/workmate/releases";
    private String uploadTempDir = "/app/workmate/upload-tmp";
    private String publicDownloadBaseUrl = "http://eiplite.htsc.com.cn/workmate/releases";
}
```

- [ ] **Step 2: Create upload response DTO**

Create `ReleaseUploadResponse.java`:

```java
package com.workmate.server.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReleaseUploadResponse {
    private String version;
    private String platform;
    private String arch;
    private String packageType;
    private String fileName;
    private Long fileSize;
    private String sha256;
    private String downloadUrl;
}
```

- [ ] **Step 3: Add application configuration**

Add under `workmate:` in `application.yml`:

```yaml
  upgrade:
    release-root-dir: ${WORKMATE_RELEASE_ROOT_DIR:/app/workmate/releases}
    upload-temp-dir: ${WORKMATE_UPLOAD_TEMP_DIR:/app/workmate/upload-tmp}
    public-download-base-url: ${WORKMATE_PUBLIC_DOWNLOAD_BASE_URL:http://eiplite.htsc.com.cn/workmate/releases}
```

Update multipart limits in `application.yml`:

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 2GB
      max-request-size: 2GB
```

### Task 2: Upload Service

**Files:**
- Create: `d:/AiWorkbench/workmate-server-java/src/main/java/com/workmate/server/service/ReleaseFileService.java`

- [ ] **Step 1: Implement validation, temp write, hash, and move**

Create `ReleaseFileService.java`:

```java
package com.workmate.server.service;

import com.workmate.server.config.AppProperties;
import com.workmate.server.dto.response.ReleaseUploadResponse;
import com.workmate.server.exception.AppException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ReleaseFileService {

    private static final Map<String, String> PACKAGE_EXTENSIONS = Map.of(
            "exe", "exe",
            "dmg", "dmg",
            "appimage", "AppImage",
            "deb", "deb",
            "rpm", "rpm"
    );

    private final AppProperties appProperties;

    public ReleaseUploadResponse upload(String version, String platform, String arch, String packageType, MultipartFile file) {
        validate(version, platform, arch, packageType, file);

        String normalizedPackageType = packageType.toLowerCase(Locale.ROOT);
        String extension = PACKAGE_EXTENSIONS.get(normalizedPackageType);
        String fileName = "WorkMate-" + version + "-" + platform + "-" + arch + "." + extension;

        Path tempDir = Path.of(appProperties.getUpgrade().getUploadTempDir());
        Path releaseDir = Path.of(appProperties.getUpgrade().getReleaseRootDir(), version);
        Path tempFile = tempDir.resolve(UUID.randomUUID() + ".tmp");
        Path targetFile = releaseDir.resolve(fileName);

        try {
            Files.createDirectories(tempDir);
            Files.createDirectories(releaseDir);
            if (Files.exists(targetFile)) {
                throw new AppException(400, "安装包已存在，请先删除旧文件或更换版本/平台/架构");
            }
            file.transferTo(tempFile);
            long fileSize = Files.size(tempFile);
            String sha256 = sha256(tempFile);
            Files.move(tempFile, targetFile, StandardCopyOption.ATOMIC_MOVE);
            String downloadUrl = buildDownloadUrl(version, fileName);

            return ReleaseUploadResponse.builder()
                    .version(version)
                    .platform(platform)
                    .arch(arch)
                    .packageType(normalizedPackageType)
                    .fileName(fileName)
                    .fileSize(fileSize)
                    .sha256(sha256)
                    .downloadUrl(downloadUrl)
                    .build();
        } catch (AppException e) {
            deleteQuietly(tempFile);
            throw e;
        } catch (IOException e) {
            deleteQuietly(tempFile);
            throw new AppException(500, "安装包上传失败");
        }
    }

    private void validate(String version, String platform, String arch, String packageType, MultipartFile file) {
        if (version == null || version.isBlank()) {
            throw new AppException(400, "version 不能为空");
        }
        if (!version.matches("\\d+\\.\\d+\\.\\d+([-.][0-9A-Za-z.-]+)?")) {
            throw new AppException(400, "version 必须是 SemVer 格式");
        }
        if (!"win32".equals(platform) && !"darwin".equals(platform) && !"linux".equals(platform)) {
            throw new AppException(400, "platform 必须是 win32、darwin 或 linux");
        }
        if (!"x64".equals(arch) && !"arm64".equals(arch)) {
            throw new AppException(400, "arch 必须是 x64 或 arm64");
        }
        if (packageType == null || !PACKAGE_EXTENSIONS.containsKey(packageType.toLowerCase(Locale.ROOT))) {
            throw new AppException(400, "packageType 不支持");
        }
        if (file == null || file.isEmpty()) {
            throw new AppException(400, "file 不能为空");
        }
        String normalizedPackageType = packageType.toLowerCase(Locale.ROOT);
        if ("win32".equals(platform) && !"exe".equals(normalizedPackageType)) {
            throw new AppException(400, "win32 平台只支持 exe 安装包");
        }
        if ("darwin".equals(platform) && !"dmg".equals(normalizedPackageType)) {
            throw new AppException(400, "darwin 平台只支持 dmg 安装包");
        }
        if ("linux".equals(platform) && !("appimage".equals(normalizedPackageType) || "deb".equals(normalizedPackageType) || "rpm".equals(normalizedPackageType))) {
            throw new AppException(400, "linux 平台只支持 appimage、deb 或 rpm 安装包");
        }
    }

    private String buildDownloadUrl(String version, String fileName) {
        String baseUrl = appProperties.getUpgrade().getPublicDownloadBaseUrl();
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        return baseUrl + "/" + version + "/" + fileName;
    }

    private String sha256(Path file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = Files.newInputStream(file); DigestInputStream digestInput = new DigestInputStream(input, digest)) {
                byte[] buffer = new byte[8192];
                while (digestInput.read(buffer) != -1) {
                    // read stream to update digest
                }
            }
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm is unavailable", e);
        }
    }

    private void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }
}
```

### Task 3: Controller Endpoint And Release Metadata

**Files:**
- Modify: `d:/AiWorkbench/workmate-server-java/src/main/java/com/workmate/server/controller/AdminController.java`
- Modify: `d:/AiWorkbench/workmate-server-java/src/main/java/com/workmate/server/dto/request/UpgradeReleaseRequest.java`
- Modify: `d:/AiWorkbench/workmate-server-java/src/main/java/com/workmate/server/entity/UpgradeRelease.java`
- Modify: `d:/AiWorkbench/workmate-server-java/src/main/java/com/workmate/server/service/UpgradeService.java`

- [ ] **Step 1: Add file metadata to request and entity**

Add optional fields to `UpgradeReleaseRequest`:

```java
@Size(max = 32)
private String arch;

@Size(max = 32)
private String packageType;

@Size(max = 255)
private String fileName;

private Long fileSize;

@Size(max = 64)
private String sha256;
```

Add same fields to `UpgradeRelease`:

```java
private String arch;
private String packageType;
private String fileName;
private Long fileSize;
private String sha256;
```

- [ ] **Step 2: Wire upload service into controller**

In `AdminController`, add imports:

```java
import com.workmate.server.dto.response.ReleaseUploadResponse;
import com.workmate.server.service.ReleaseFileService;
import org.springframework.web.multipart.MultipartFile;
```

Add field:

```java
private final ReleaseFileService releaseFileService;
```

Add endpoint before `createRelease`:

```java
@PostMapping("/upgrade/releases/upload")
public ApiResponse<ReleaseUploadResponse> uploadReleaseFile(
        @RequestParam String version,
        @RequestParam String platform,
        @RequestParam String arch,
        @RequestParam String packageType,
        @RequestParam MultipartFile file) {
    ReleaseUploadResponse result = releaseFileService.upload(version, platform, arch, packageType, file);
    return ApiResponse.ok(result, "上传成功");
}
```

- [ ] **Step 3: Save metadata in createRelease**

In `UpgradeService.createRelease`, set fields:

```java
.arch(request.getArch())
.packageType(request.getPackageType())
.fileName(request.getFileName())
.fileSize(request.getFileSize())
.sha256(request.getSha256())
```

### Task 4: Database Mapper And Migration

**Files:**
- Modify: `d:/AiWorkbench/workmate-server-java/src/main/resources/mapper/UpgradeReleaseMapper.xml`
- Create: `d:/AiWorkbench/workmate-server-java/src/main/resources/db/migration/V2__add_release_file_metadata.sql`

- [ ] **Step 1: Add migration**

Create SQL migration:

```sql
ALTER TABLE `upgrade_releases`
    ADD COLUMN `arch` VARCHAR(32) NULL AFTER `platform`,
    ADD COLUMN `package_type` VARCHAR(32) NULL AFTER `arch`,
    ADD COLUMN `file_name` VARCHAR(255) NULL AFTER `package_type`,
    ADD COLUMN `file_size` BIGINT NULL AFTER `file_name`,
    ADD COLUMN `sha256` VARCHAR(64) NULL AFTER `file_size`;
```

- [ ] **Step 2: Update result map**

Add to `BaseResultMap`:

```xml
<result column="arch" property="arch"/>
<result column="package_type" property="packageType"/>
<result column="file_name" property="fileName"/>
<result column="file_size" property="fileSize"/>
<result column="sha256" property="sha256"/>
```

- [ ] **Step 3: Update insert SQL**

Use:

```xml
INSERT INTO upgrade_releases (version, release_type, release_notes, download_url, platform, arch, package_type, file_name, file_size, sha256, min_version, is_active, published_at)
VALUES (#{version}, #{releaseType}, #{releaseNotes}, #{downloadUrl}, #{platform}, #{arch}, #{packageType}, #{fileName}, #{fileSize}, #{sha256}, #{minVersion}, #{isActive}, #{publishedAt})
```

- [ ] **Step 4: Update update SQL**

Add fields to `SET`:

```xml
arch = #{arch}, package_type = #{packageType}, file_name = #{fileName},
file_size = #{fileSize}, sha256 = #{sha256},
```

### Task 5: Nginx Configuration

**Files:**
- Modify: `d:/AiWorkbench/workmate-server-java/src/main/resources/nginx-server.conf`

- [ ] **Step 1: Add release download location**

Add before generic `location /workmate/`:

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

- [ ] **Step 2: Add upload endpoint location**

Add before generic `location /workmate/`:

```nginx
# ========== 发布版本上传接口 ==========
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
```

### Task 6: Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run build/test**

Run from `d:/AiWorkbench/workmate-server-java`:

```powershell
./mvnw test
```

Expected: build passes, or failures are unrelated existing test issues.

- [ ] **Step 2: Inspect generated endpoint**

Manual upload example:

```powershell
curl.exe -X POST "http://localhost:6173/workmate/console/upgrade/releases/upload" -F "version=1.2.0" -F "platform=win32" -F "arch=x64" -F "packageType=exe" -F "file=@D:\path\to\WorkMate.exe"
```

Expected response contains `downloadUrl`, `sha256`, `fileSize`, `fileName`, and `packageType`.

- [ ] **Step 3: Verify Nginx mapping**

After deploying Nginx, a file at:

```text
/app/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe
```

must be downloadable from:

```text
http://eiplite.htsc.com.cn/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe
```
