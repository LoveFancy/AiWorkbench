package com.workmate.server.dto.request;

import com.workmate.server.enums.ReleaseType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StrategyCreateRequest {

    @NotBlank(message = "name 不能为空")
    @Size(max = 128)
    private String name;

    @Builder.Default
    private ReleaseType releaseType = ReleaseType.UPGRADE;

    @NotBlank(message = "targetVersion 不能为空")
    @Size(max = 32)
    private String targetVersion;

    @NotBlank(message = "downloadUrl 不能为空")
    @Size(max = 512)
    private String downloadUrl;

    private String releaseNotes;

    @NotBlank(message = "platform 不能为空")
    @Pattern(regexp = "win32|darwin|linux")
    private String platform;

    @Size(max = 32)
    private String minVersion;

    @NotNull(message = "totalStages 不能为空")
    @Min(1)
    private Integer totalStages;

    @Min(0)
    private Integer soakTimeMinutes;

    @DecimalMin("0")
    @DecimalMax("1")
    private BigDecimal autoPauseErrorRate;

    @Builder.Default
    private Boolean autoPauseEnabled = false;

    @NotEmpty(message = "stages 不能为空")
    @Valid
    private List<StageInput> stages;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StageInput {
        @NotBlank
        @Size(max = 64)
        private String name;

        private String releaseNotes;

        private List<RuleInput> rules;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RuleInput {
        @NotBlank
        @Pattern(regexp = "list|range|prefix|suffix")
        private String ruleType;

        @NotBlank
        @Size(max = 256)
        private String ruleValue;
    }
}
