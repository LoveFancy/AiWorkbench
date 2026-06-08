package com.workmate.server.service;

import com.workmate.server.config.AppProperties;
import com.workmate.server.dto.request.ObservabilityEventRequest;
import com.workmate.server.dto.response.EventStats;
import com.workmate.server.dto.response.PaginatedData;
import com.workmate.server.entity.ObservabilityError;
import com.workmate.server.entity.ObservabilityEvent;
import com.workmate.server.mapper.ObservabilityErrorMapper;
import com.workmate.server.mapper.ObservabilityEventMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.pagehelper.PageHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
@RequiredArgsConstructor
public class ObservabilityService {

    private final ObservabilityEventMapper eventMapper;
    private final ObservabilityErrorMapper errorMapper;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    private final Map<String, AtomicInteger> eventCountMap = new ConcurrentHashMap<>();

    @Scheduled(fixedRate = 60_000)
    public void clearEventCountMap() {
        eventCountMap.clear();
    }

    /**
     * 批量处理客户端上报事件，返回处理统计 { received, duplicated, inserted }。
     */
    @Transactional
    public Map<String, Integer> createEvents(List<ObservabilityEventRequest> events, String jobId) {
        int received = events.size();
        int duplicated = 0;
        int inserted = 0;

        for (ObservabilityEventRequest request : events) {
            Object result = createEvent(request, jobId);
            if (result == null) {
                duplicated++;
            } else {
                inserted++;
            }
        }

        return Map.of("received", received, "duplicated", duplicated, "inserted", inserted);
    }

    /**
     * 处理客户端上报的单个事件，按 type 分流到业务表或异常表。
     */
    @Transactional
    public Object createEvent(ObservabilityEventRequest request, String jobId) {
        String userId = resolveUserId(request, jobId);

        // 采样与限流（仅对非 error 事件生效）
        if (!"error".equals(request.getType())) {
            if (Math.random() > appProperties.getObservabilitySampleRate()) {
                return null;
            }
            String minuteKey = userId + ":" + (System.currentTimeMillis() / 60000);
            AtomicInteger count = eventCountMap.computeIfAbsent(minuteKey, k -> new AtomicInteger(0));
            if (count.incrementAndGet() > appProperties.getObservabilityMaxEventsPerMinute()) {
                return null;
            }
        }

        if ("error".equals(request.getType())) {
            return createErrorEvent(request, userId);
        } else {
            return createBusinessEvent(request, userId);
        }
    }

    // ==================== 业务事件写入 ====================

    private ObservabilityEvent createBusinessEvent(ObservabilityEventRequest request, String userId) {
        if (request.getEventId() != null && !request.getEventId().isEmpty()) {
            if (eventMapper.findByEventId(request.getEventId()).isPresent()) {
                log.warn("业务事件去重：跳过重复事件, eventId={}", request.getEventId());
                return null;
            }
        }

        LocalDateTime createdAt = request.getTimestamp() != null
                ? LocalDateTime.ofEpochSecond(request.getTimestamp() / 1000,
                        (int) ((request.getTimestamp() % 1000) * 1_000_000), java.time.ZoneOffset.ofHours(8))
                : LocalDateTime.now();

        ObservabilityEvent event = ObservabilityEvent.builder()
                .eventId(request.getEventId())
                .userId(userId)
                .eventType(request.getType())
                .questionLength(request.getQuestionLength() != null ? request.getQuestionLength()
                        : (request.getQuestion() != null ? request.getQuestion().length() : null))
                .modelId(request.getModelId())
                .channelId(request.getChannelId())
                .sessionId(request.getSessionId())
                .workspaceId(request.getWorkspaceId())
                .result(request.getResult())
                .responseDurationMs(request.getResponseDurationMs())
                .createdAt(createdAt)
                .build();

        if (request.getClient() != null) {
            event.setClientVersion(request.getClient().getAppVersion());
            event.setClientPlatform(request.getClient().getPlatform());
            event.setClientOsVersion(request.getClient().getOsVersion());
        }

        eventMapper.insert(event);
        return event;
    }

    // ==================== 异常事件写入 ====================

    private ObservabilityError createErrorEvent(ObservabilityEventRequest request, String userId) {
        if (request.getEventId() != null && !request.getEventId().isEmpty()) {
            if (errorMapper.findByEventId(request.getEventId()).isPresent()) {
                log.warn("异常事件去重：跳过重复事件, eventId={}", request.getEventId());
                return null;
            }
        }

        LocalDateTime createdAt = request.getTimestamp() != null
                ? LocalDateTime.ofEpochSecond(request.getTimestamp() / 1000,
                        (int) ((request.getTimestamp() % 1000) * 1_000_000), java.time.ZoneOffset.ofHours(8))
                : LocalDateTime.now();

        // 服务端重算 fingerprint（覆盖客户端值）
        String errorFingerprint = null;
        if (request.getError() != null) {
            errorFingerprint = generateErrorFingerprint(
                    request.getError().getType(), request.getError().getMessage());
        }

        ObservabilityError error = ObservabilityError.builder()
                .eventId(request.getEventId())
                .userId(userId)
                .sessionId(request.getSessionId())
                .workspaceId(request.getWorkspaceId())
                .errorType(request.getError() != null ? request.getError().getType() : null)
                .errorMessage(request.getError() != null ? request.getError().getMessage() : null)
                .errorStack(truncateStack(request.getError() != null ? request.getError().getStack() : null, 1000))
                .errorFingerprint(errorFingerprint)
                .errorStatusCode(request.getError() != null ? request.getError().getStatusCode() : null)
                .breadcrumbs(toJson(request.getBreadcrumbs()))
                .tags(toJson(request.getTags()))
                .createdAt(createdAt)
                .build();

        if (request.getClient() != null) {
            error.setClientVersion(request.getClient().getAppVersion());
            error.setClientPlatform(request.getClient().getPlatform());
            error.setClientOsVersion(request.getClient().getOsVersion());
        }

        errorMapper.insert(error);
        return error;
    }

    // ==================== 业务事件查询（按年） ====================

    @Transactional(readOnly = true)
    public PaginatedData<List<ObservabilityEvent>> queryEvents(int page, int pageSize, String eventType,
                                                                String userId, Integer year,
                                                                String clientVersion) {
        LocalDateTime start = null;
        LocalDateTime end = null;
        if (year != null) {
            start = LocalDateTime.of(year, 1, 1, 0, 0);
            end = LocalDateTime.of(year + 1, 1, 1, 0, 0);
        }

        PageHelper.startPage(page, pageSize);
        List<ObservabilityEvent> list = eventMapper.queryEvents(
                eventType, userId, start, end, clientVersion);
        long total = list instanceof com.github.pagehelper.Page
                ? ((com.github.pagehelper.Page<?>) list).getTotal() : list.size();
        return PaginatedData.of(list, total, page, pageSize);
    }

    // ==================== 异常事件查询（按年） ====================

    @Transactional(readOnly = true)
    public PaginatedData<List<ObservabilityError>> queryErrors(int page, int pageSize,
                                                                String userId, Integer year,
                                                                String clientVersion, String errorFingerprint) {
        LocalDateTime start = null;
        LocalDateTime end = null;
        if (year != null) {
            start = LocalDateTime.of(year, 1, 1, 0, 0);
            end = LocalDateTime.of(year + 1, 1, 1, 0, 0);
        }

        PageHelper.startPage(page, pageSize);
        List<ObservabilityError> list = errorMapper.queryErrors(
                userId, start, end, clientVersion, errorFingerprint);
        long total = list instanceof com.github.pagehelper.Page
                ? ((com.github.pagehelper.Page<?>) list).getTotal() : list.size();
        return PaginatedData.of(list, total, page, pageSize);
    }

    // ==================== 统计接口 ====================

    @Transactional(readOnly = true)
    public EventStats getEventStats(Integer year) {
        LocalDateTime start = null;
        LocalDateTime end = null;
        if (year != null) {
            start = LocalDateTime.of(year, 1, 1, 0, 0);
            end = LocalDateTime.of(year + 1, 1, 1, 0, 0);
        }

        long totalEvents = eventMapper.count();
        long errorEvents = errorMapper.count();

        List<ObservabilityError> topErrorsRaw;
        if (start != null && end != null) {
            topErrorsRaw = errorMapper.findTopErrorFingerprintsBetween(start, end, 10);
        } else {
            topErrorsRaw = errorMapper.findTopErrorFingerprints(10);
        }

        List<EventStats.TopError> topErrors = topErrorsRaw.stream()
                .map(row -> EventStats.TopError.builder()
                        .fingerprint(row.getErrorFingerprint())
                        .count(row.getId() != null ? row.getId().longValue() : 0)
                        .build())
                .toList();

        return EventStats.builder()
                .totalEvents(totalEvents)
                .errorEvents(errorEvents)
                .errorRate(totalEvents > 0 ? (double) errorEvents / totalEvents : 0)
                .topErrors(topErrors)
                .build();
    }

    // ==================== 工具方法 ====================

    private String resolveUserId(ObservabilityEventRequest request, String jobId) {
        if (jobId != null && !jobId.isEmpty()) {
            return jobId;
        }
        return request.getUserId() != null ? request.getUserId() : "unknown";
    }

    /**
     * 堆栈按字节截断（UTF-8 安全），保留前 maxBytes 字节，尾部加 '...[truncated]' 标记。
     */
    static String truncateStack(String stack, int maxBytes) {
        if (stack == null || stack.isEmpty()) return null;
        byte[] bytes = stack.getBytes(StandardCharsets.UTF_8);
        if (bytes.length <= maxBytes) return stack;
        byte[] sliced = new byte[maxBytes - 15];
        System.arraycopy(bytes, 0, sliced, 0, sliced.length);
        return new String(sliced, StandardCharsets.UTF_8) + "...[truncated]";
    }

    /**
     * 服务端统一重算错误指纹：md5(errorType|errorMessage).slice(0,16)
     */
    static String generateErrorFingerprint(String errorType, String errorMessage) {
        if (errorType == null && errorMessage == null) return null;
        String raw = (errorType != null ? errorType : "") + "|" + (errorMessage != null ? errorMessage : "");
        try {
            MessageDigest md5 = MessageDigest.getInstance("MD5");
            byte[] digest = md5.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                sb.append(String.format("%02x", digest[i]));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return Integer.toHexString(raw.hashCode());
        }
    }

    private String toJson(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
