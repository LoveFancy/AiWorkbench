package com.workmate.server.mapper;

import com.workmate.server.entity.UpgradeRelease;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface UpgradeReleaseMapper {

    Optional<UpgradeRelease> findFirstByPlatformAndIsActiveTrue(@Param("platform") String platform);

    Optional<UpgradeRelease> findFirstByPlatformAndVersion(@Param("platform") String platform,
                                                            @Param("version") String version);

    void deactivateByPlatform(@Param("platform") String platform);

    int insert(UpgradeRelease release);

    int update(UpgradeRelease release);

    List<UpgradeRelease> findByPlatform(@Param("platform") String platform);

    List<UpgradeRelease> findAll();

    long count(@Param("platform") String platform);
}
