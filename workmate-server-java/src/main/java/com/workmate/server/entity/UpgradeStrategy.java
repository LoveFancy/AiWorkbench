package com.workmate.server.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpgradeStrategy {

    private Integer id;
    private String name;
    private String releaseType;
    private String targetVersion;
    private String downloadUrl;
    private String releaseNotes;
    private String platform;
    private String minVersion;
    private Integer totalStages;
    private Integer currentStage;
    private Integer soakTimeMinutes;
    private BigDecimal autoPauseErrorRate;
    private Boolean autoPauseEnabled;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    private List<UpgradeStrategyStage> stages;
}
