package com.workmate.server.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ObservabilityEvent {

    private Integer id;
    private String eventId;
    private String userId;
    private String userName;
    private String eventType;
    private String question;
    private Integer questionLength;
    private String modelId;
    private String channelId;
    private String sessionId;
    private String workspaceId;
    private String result;
    private Integer responseDurationMs;
    private String errorType;
    private String errorMessage;
    private String errorStack;
    private String errorFingerprint;
    private Integer errorStatusCode;
    private String breadcrumbs;
    private String tags;
    private String clientVersion;
    private String clientPlatform;
    private String clientOsVersion;
    private LocalDateTime createdAt;
}
