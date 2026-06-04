package com.workmate.server.mapper;

import com.workmate.server.entity.UpgradeStrategyStage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UpgradeStrategyStageMapper {

    List<UpgradeStrategyStage> findByStrategyIdOrderByStageOrderAsc(@Param("strategyId") Integer strategyId);

    void deleteByStrategyId(@Param("strategyId") Integer strategyId);

    int insert(UpgradeStrategyStage stage);

    int update(UpgradeStrategyStage stage);

    UpgradeStrategyStage findById(@Param("id") Integer id);
}
