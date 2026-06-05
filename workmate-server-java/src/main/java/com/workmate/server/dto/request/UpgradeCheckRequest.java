package com.workmate.server.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpgradeCheckRequest {

    @NotBlank(message = "currentVersion 不能为空")
    @Size(max = 32)
    private String currentVersion;

    @NotBlank(message = "platform 不能为空")
    @Pattern(regexp = "win32|darwin|linux", message = "platform 必须为 win32/darwin/linux")
    private String platform;
}
