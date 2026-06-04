package com.workmate.server.mapper;

import com.workmate.server.entity.ObservabilityEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Mapper
public interface ObservabilityEventMapper {

    Optional<ObservabilityEvent> findByEventId(@Param("eventId") String eventId);

    long countByEventType(@Param("eventType") String eventType);

    long countByEventTypeAndClientPlatformAndClientVersionAndCreatedAtGreaterThanEqual(
            @Param("eventType") String eventType,
            @Param("clientPlatform") String clientPlatform,
            @Param("clientVersion") String clientVersion,
            @Param("since") LocalDateTime since);

    long countByClientPlatformAndClientVersionAndCreatedAtGreaterThanEqualAndEventTypeIn(
            @Param("clientPlatform") String clientPlatform,
            @Param("clientVersion") String clientVersion,
            @Param("since") LocalDateTime since,
            @Param("eventTypes") List<String> eventTypes);

    long countDistinctUserId();

    List<ObservabilityEvent> findTopErrorFingerprints(@Param("limit") int limit);

    List<ObservabilityEvent> findTopErrorFingerprintsBetween(@Param("startDate") LocalDateTime startDate,
                                                              @Param("endDate") LocalDateTime endDate,
                                                              @Param("limit") int limit);

    int insert(ObservabilityEvent event);

    long count();

    List<ObservabilityEvent> queryEvents(@Param("eventType") String eventType,
                                          @Param("userId") String userId,
                                          @Param("startDate") LocalDateTime startDate,
                                          @Param("endDate") LocalDateTime endDate,
                                          @Param("clientVersion") String clientVersion,
                                          @Param("errorFingerprint") String errorFingerprint);
}
