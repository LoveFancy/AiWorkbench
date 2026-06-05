package com.workmate.server.mapper;

import com.workmate.server.entity.UpgradeWhitelist;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UpgradeWhitelistMapper {

    List<UpgradeWhitelist> findByIsActiveTrue();

    List<UpgradeWhitelist> findActiveByPlatform(@Param("platform") String platform);

    void deleteByStrategyId(@Param("strategyId") Integer strategyId);

    void deleteByPlatformWithStrategy(@Param("platform") String platform);

    int insert(UpgradeWhitelist whitelist);

    int update(UpgradeWhitelist whitelist);

    UpgradeWhitelist findById(@Param("id") Integer id);

    void deleteById(@Param("id") Integer id);

    List<UpgradeWhitelist> findByPlatform(@Param("platform") String platform);

    List<UpgradeWhitelist> findByTargetVersion(@Param("targetVersion") String targetVersion);

    List<UpgradeWhitelist> findByPlatformAndTargetVersion(@Param("platform") String platform,
                                                           @Param("targetVersion") String targetVersion);
}
