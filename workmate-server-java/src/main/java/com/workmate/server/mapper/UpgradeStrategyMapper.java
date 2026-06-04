package com.workmate.server.mapper;

import com.workmate.server.entity.UpgradeStrategy;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface UpgradeStrategyMapper {

    Optional<UpgradeStrategy> findById(@Param("id") Integer id);

    Optional<UpgradeStrategy> findFirstByPlatformAndStatus(@Param("platform") String platform,
                                                            @Param("status") String status);

    long countByStatus(@Param("status") String status);

    int insert(UpgradeStrategy strategy);

    int update(UpgradeStrategy strategy);

    List<UpgradeStrategy> findAll();

    long count();
}
