package com.workmate.server.mapper;

import com.workmate.server.entity.ObservabilityError;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Mapper
public interface ObservabilityErrorMapper {

    Optional<ObservabilityError> findByEventId(@Param("eventId") String eventId);

    int insert(ObservabilityError error);

    long count();

    long countByClientPlatformAndClientVersionAndCreatedAtGreaterThanEqual(
            @Param("clientPlatform") String clientPlatform,
            @Param("clientVersion") String clientVersion,
            @Param("since") LocalDateTime since);

    List<ObservabilityError> findTopErrorFingerprints(@Param("limit") int limit);

    List<ObservabilityError> findTopErrorFingerprintsBetween(@Param("startDate") LocalDateTime startDate,
                                                              @Param("endDate") LocalDateTime endDate,
                                                              @Param("limit") int limit);

    List<ObservabilityError> queryErrors(@Param("userId") String userId,
                                          @Param("startDate") LocalDateTime startDate,
                                          @Param("endDate") LocalDateTime endDate,
                                          @Param("clientVersion") String clientVersion,
                                          @Param("errorFingerprint") String errorFingerprint);
}
