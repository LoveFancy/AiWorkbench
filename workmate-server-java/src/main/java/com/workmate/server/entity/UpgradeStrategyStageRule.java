package com.workmate.server.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpgradeStrategyStageRule {

    private Integer id;
    private Integer stageId;
    private String ruleType;
    private String ruleValue;
}
