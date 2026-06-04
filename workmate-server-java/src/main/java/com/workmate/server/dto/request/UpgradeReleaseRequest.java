package com.workmate.server.dto.request;

import com.workmate.server.enums.ReleaseType;
import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpgradeReleaseRequest {

    @NotBlank(message = "version 不能为空")
    @Size(max = 32)
    private String version;

    @NotNull(message = "releaseType 不能为空")
    private ReleaseType releaseType;

    @NotBlank(message = "releaseNotes 不能为空")
    private String releaseNotes;

    @NotBlank(message = "downloadUrl 不能为空")
    @Size(max = 512)
    private String downloadUrl;

    @NotBlank(message = "platform 不能为空")
    @Pattern(regexp = "win32|darwin|linux")
    private String platform;

    @Size(max = 32)
    private String minVersion;
}
