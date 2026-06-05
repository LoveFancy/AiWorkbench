package com.workmate.server.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardStats {

    private long totalEvents;
    private long errorEvents;
    private double errorRate;
    private long activeStrategies;
    private long activeReleases;
    private long totalUsers;
}
