package com.workmate.server.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ObservabilityEventRequest {

    private String eventId;

    @NotBlank(message = "type 不能为空")
    @Pattern(regexp = "user_login|user_logout|chat_question|agent_question|error|upgrade_check")
    private String type;

    private String userId;

    @NotNull(message = "timestamp 不能为空")
    private Long timestamp;

    private String question;
    private Integer questionLength;
    private String modelId;
    private String channelId;
    private String sessionId;
    private String workspaceId;

    @Pattern(regexp = "success|failure|pending")
    private String result;
    private Integer responseDurationMs;

    private ErrorInfo error;

    private List<Breadcrumb> breadcrumbs;
    private Map<String, String> tags;

    @NotNull(message = "client 不能为空")
    @Valid
    private ClientInfo client;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ErrorInfo {
        @NotBlank
        private String type;
        @NotBlank
        private String message;
        private String stack;
        private Integer statusCode;
        private String fingerprint;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Breadcrumb {
        private String type;
        private String category;
        private String message;
        private Long timestamp;
        private Map<String, Object> data;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClientInfo {
        @NotBlank(message = "appVersion 不能为空")
        @Size(max = 32)
        private String appVersion;

        @NotBlank(message = "platform 不能为空")
        @Size(max = 32)
        private String platform;

        @Size(max = 64)
        private String osVersion;
    }
}
