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
        String normalizedPackageType = packageType.toLowerCase(Locale.ROOT);
        validate(version, platform, arch, normalizedPackageType, file);

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
            moveFile(tempFile, targetFile);

            return ReleaseUploadResponse.builder()
                    .version(version)
                    .platform(platform)
                    .arch(arch)
                    .packageType(normalizedPackageType)
                    .fileName(fileName)
                    .fileSize(fileSize)
                    .sha256(sha256)
                    .downloadUrl(buildDownloadUrl(version, fileName))
                    .build();
        } catch (AppException e) {
            deleteQuietly(tempFile);
            throw e;
        } catch (IOException e) {
            deleteQuietly(tempFile);
            throw new AppException(500, "安装包上传失败");
        }
    }

    private void validate(String version, String platform, String arch, String normalizedPackageType, MultipartFile file) {
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
        if (normalizedPackageType == null || !PACKAGE_EXTENSIONS.containsKey(normalizedPackageType)) {
            throw new AppException(400, "packageType 不支持");
        }
        if (file == null || file.isEmpty()) {
            throw new AppException(400, "file 不能为空");
        }
        validatePlatformPackage(platform, normalizedPackageType);
    }

    private void validatePlatformPackage(String platform, String packageType) {
        if ("win32".equals(platform) && !"exe".equals(packageType)) {
            throw new AppException(400, "win32 平台只支持 exe 安装包");
        }
        if ("darwin".equals(platform) && !"dmg".equals(packageType)) {
            throw new AppException(400, "darwin 平台只支持 dmg 安装包");
        }
        if ("linux".equals(platform)
                && !("appimage".equals(packageType) || "deb".equals(packageType) || "rpm".equals(packageType))) {
            throw new AppException(400, "linux 平台只支持 appimage、deb 或 rpm 安装包");
        }
    }

    private void moveFile(Path tempFile, Path targetFile) throws IOException {
        try {
            Files.move(tempFile, targetFile, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            Files.move(tempFile, targetFile);
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
                    // 读取文件内容以更新摘要。
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
