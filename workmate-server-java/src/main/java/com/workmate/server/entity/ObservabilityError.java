package com.workmate.server.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 异常事件实体，映射 observability_errors 表（按月分区，保留 6 个月）。
 * 仅存储 error 类型事件，含截断后的 stack 和 breadcrumbs。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ObservabilityError {

    private Long id;
    private String eventId;
    private String userId;
    private String sessionId;
    private String workspaceId;
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
