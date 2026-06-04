package com.workmate.server.service;

import com.workmate.server.config.AppProperties;
import com.workmate.server.dto.request.ObservabilityEventRequest;
import com.workmate.server.dto.response.EventStats;
import com.workmate.server.dto.response.PaginatedData;
import com.workmate.server.entity.ObservabilityEvent;
import com.workmate.server.mapper.ObservabilityEventMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.pagehelper.PageHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    private final Map<String, AtomicInteger> eventCountMap = new ConcurrentHashMap<>();

    @Scheduled(fixedRate = 60_000)
    public void clearEventCountMap() {
        eventCountMap.clear();
    }

    @Transactional
    public ObservabilityEvent createEvent(ObservabilityEventRequest request, String jobId) {
        String userId = (jobId != null && !jobId.isEmpty()) ? jobId
                : (request.getUserId() != null ? request.getUserId() : "unknown");

        if (!"error".equals(request.getType()) && Math.random() > appProperties.getObservabilitySampleRate()) {
            return null;
        }

        String minuteKey = userId + ":" + (System.currentTimeMillis() / 60000);
        AtomicInteger count = eventCountMap.computeIfAbsent(minuteKey, k -> new AtomicInteger(0));
        if (count.incrementAndGet() > appProperties.getObservabilityMaxEventsPerMinute()) {
            return null;
        }

        if (request.getEventId() != null && !request.getEventId().isEmpty()) {
            if (eventMapper.findByEventId(request.getEventId()).isPresent()) {
                log.warn("事件去重：跳过重复事件, eventId={}", request.getEventId());
                return null;
            }
        }

        ObservabilityEvent event = new ObservabilityEvent();
        event.setEventId(request.getEventId());
        event.setUserId(userId);
        event.setUserName(request.getUserName());
        event.setEventType(request.getType());
        event.setQuestion(request.getQuestion());
        event.setQuestionLength(request.getQuestionLength() != null ? request.getQuestionLength()
                : (request.getQuestion() != null ? request.getQuestion().length() : null));
        event.setModelId(request.getModelId());
        event.setChannelId(request.getChannelId());
        event.setSessionId(request.getSessionId());
        event.setWorkspaceId(request.getWorkspaceId());
        event.setResult(request.getResult());
        event.setResponseDurationMs(request.getResponseDurationMs());

        if (request.getError() != null) {
            event.setErrorType(request.getError().getType());
            event.setErrorMessage(request.getError().getMessage());
            event.setErrorStack(request.getError().getStack());
            event.setErrorFingerprint(request.getError().getFingerprint());
            event.setErrorStatusCode(request.getError().getStatusCode());
        }

        event.setBreadcrumbs(toJson(request.getBreadcrumbs()));
        event.setTags(toJson(request.getTags()));

        if (request.getClient() != null) {
            event.setClientVersion(request.getClient().getAppVersion());
            event.setClientPlatform(request.getClient().getPlatform());
            event.setClientOsVersion(request.getClient().getOsVersion());
        }

        event.setCreatedAt(LocalDateTime.now());
        eventMapper.insert(event);
        return event;
    }

    @Transactional(readOnly = true)
    public PaginatedData<List<ObservabilityEvent>> queryEvents(int page, int pageSize, String eventType,
                                                                String userId, String startDate, String endDate,
                                                                String clientVersion, String errorFingerprint) {
        LocalDateTime start = null;
        LocalDateTime end = null;
        if (startDate != null && !startDate.isEmpty()) {
            start = LocalDateTime.parse(startDate.contains("T") ? startDate : startDate + "T00:00:00");
        }
        if (endDate != null && !endDate.isEmpty()) {
            end = LocalDateTime.parse(endDate.contains("T") ? endDate : endDate + "T23:59:59");
        }

        PageHelper.startPage(page, pageSize);
        List<ObservabilityEvent> list = eventMapper.queryEvents(
                eventType, userId, start, end, clientVersion, errorFingerprint);
        return PaginatedData.of(list, list.size(), page, pageSize);
    }

    @Transactional(readOnly = true)
    public EventStats getEventStats(String startDate, String endDate) {
        long totalEvents = eventMapper.count();
        long errorEvents = eventMapper.countByEventType("error");

        List<ObservabilityEvent> topErrorsRaw;
        if (startDate != null || endDate != null) {
            LocalDateTime start = startDate != null
                    ? LocalDateTime.parse(startDate.contains("T") ? startDate : startDate + "T00:00:00")
                    : LocalDateTime.of(2000, 1, 1, 0, 0);
            LocalDateTime end = endDate != null
                    ? LocalDateTime.parse(endDate.contains("T") ? endDate : endDate + "T23:59:59")
                    : LocalDateTime.now();
            topErrorsRaw = eventMapper.findTopErrorFingerprintsBetween(start, end, 10);
        } else {
            topErrorsRaw = eventMapper.findTopErrorFingerprints(10);
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

    private String toJson(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
