package com.workmate.server.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpgradeStrategyStage {

    private Integer id;
    private Integer strategyId;
    private Integer stageOrder;
    private String name;
    private String releaseNotes;
    private LocalDateTime advancedAt;
    private LocalDateTime createdAt;

    private List<UpgradeStrategyStageRule> rules;
}
