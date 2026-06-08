package com.workmate.server.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 业务事件实体，映射 observability_events 表（按年分区，永久保留）。
 * 仅存储 user_login / user_logout / chat_question / agent_question / upgrade_check。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ObservabilityEvent {

    private Long id;
    private String eventId;
    private String userId;
    private String eventType;
    private String question;
    private Integer questionLength;
    private String modelId;
    private String channelId;
    private String sessionId;
    private String workspaceId;
    private String result;
    private Integer responseDurationMs;
    private String clientVersion;
    private String clientPlatform;
    private String clientOsVersion;
    private LocalDateTime createdAt;
}
