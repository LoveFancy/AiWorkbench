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
public class WhitelistRuleRequest {

    @NotBlank(message = "ruleType 不能为空")
    @Pattern(regexp = "list|range|prefix|suffix")
    private String ruleType;

    @NotBlank(message = "ruleValue 不能为空")
    @Size(max = 256)
    private String ruleValue;

    private String targetVersion;

    @Pattern(regexp = "win32|darwin|linux")
    private String platform;

    private String remark;
}
