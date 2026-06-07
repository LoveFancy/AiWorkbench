package com.workmate.server.service;

import com.workmate.server.config.AppProperties;
import com.workmate.server.dto.response.ReleaseUploadResponse;
import com.workmate.server.exception.AppException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReleaseFileServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void uploadStoresPackageAndReturnsDownloadMetadata() throws Exception {
        AppProperties properties = new AppProperties();
        Path releaseRoot = tempDir.resolve("releases");
        Path uploadTemp = tempDir.resolve("upload-tmp");
        properties.getUpgrade().setReleaseRootDir(releaseRoot.toString());
        properties.getUpgrade().setUploadTempDir(uploadTemp.toString());
        properties.getUpgrade().setPublicDownloadBaseUrl("http://eiplite.htsc.com.cn/workmate/releases/");

        ReleaseFileService service = new ReleaseFileService(properties);
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "source.exe",
                "application/octet-stream",
                "hello-workmate".getBytes());

        ReleaseUploadResponse response = service.upload("1.2.0", "win32", "x64", "exe", file);

        assertThat(response.getFileName()).isEqualTo("WorkMate-1.2.0-win32-x64.exe");
        assertThat(response.getFileSize()).isEqualTo(14L);
        assertThat(response.getSha256()).isEqualTo("8f22f3fb295df40e5dd17c47231333b19d06078f13ca14068faddf4b4d083cb2");
        assertThat(response.getDownloadUrl()).isEqualTo("http://eiplite.htsc.com.cn/workmate/releases/1.2.0/WorkMate-1.2.0-win32-x64.exe");
        assertThat(Files.readString(releaseRoot.resolve("1.2.0").resolve("WorkMate-1.2.0-win32-x64.exe"))).isEqualTo("hello-workmate");
    }

    @Test
    void uploadRejectsUnsupportedPlatformPackageCombination() {
        AppProperties properties = new AppProperties();
        properties.getUpgrade().setReleaseRootDir(tempDir.resolve("releases").toString());
        properties.getUpgrade().setUploadTempDir(tempDir.resolve("upload-tmp").toString());
        ReleaseFileService service = new ReleaseFileService(properties);
        MockMultipartFile file = new MockMultipartFile("file", "source.dmg", "application/octet-stream", "data".getBytes());

        assertThatThrownBy(() -> service.upload("1.2.0", "win32", "x64", "dmg", file))
                .isInstanceOf(AppException.class)
                .hasMessage("win32 平台只支持 exe 安装包");
    }
}
