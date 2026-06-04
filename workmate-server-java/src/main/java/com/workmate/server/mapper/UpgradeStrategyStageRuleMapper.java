package com.workmate.server.mapper;

import com.workmate.server.entity.UpgradeStrategyStageRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UpgradeStrategyStageRuleMapper {

    List<UpgradeStrategyStageRule> findByStageId(@Param("stageId") Integer stageId);

    void deleteByStageIdIn(@Param("stageIds") List<Integer> stageIds);

    int insert(UpgradeStrategyStageRule rule);
}
