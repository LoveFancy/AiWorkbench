package com.workmate.server.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "workmate")
public class AppProperties {

    private String userIdEncryptionKey = "";
    private boolean requireUserId = true;
    private String defaultUserId = "test_user";
    private String modelPlatformApiUrl = "http://model-platform.htsc.com/api/v1";
    private int modelPlatformTimeoutMs = 10000;
    private double observabilitySampleRate = 1.0;
    private int observabilityMaxEventsPerMinute = 60;
}
