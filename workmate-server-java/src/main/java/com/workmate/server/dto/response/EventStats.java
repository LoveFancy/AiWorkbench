package com.workmate.server.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EventStats {

    private long totalEvents;
    private long errorEvents;
    private double errorRate;
    private java.util.List<TopError> topErrors;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TopError {
        private String fingerprint;
        private long count;
    }
}
