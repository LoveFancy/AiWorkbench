package com.workmate.server.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpgradeWhitelist {

    private Integer id;
    private Integer sourceStrategyId;
    private String ruleType;
    private String ruleValue;
    private String targetVersion;
    private String platform;
    private Boolean isActive;
    private LocalDateTime createdAt;
}
