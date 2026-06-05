package com.workmate.server.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

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
    private LocalDev localDev = new LocalDev();

    @Data
    public static class LocalDev {
        /** 是否启用本地开发模式，默认 false */
        private boolean enabled = false;
        /** 模拟的 API Key */
        private String apiKey = "";
        /** 预定义的模型列表 */
        private List<LocalDevModel> models = new ArrayList<>();
    }

    @Data
    public static class LocalDevModel {
        private String id;
        private String name;
        private String description;
        /** 模型协议：anthropic / openai / huatai-anthropic / huatai-openai */
        private String provider;
        /** 调用地址，如 https://api.deepseek.com/anthropic */
        private String baseUrl;
        private Integer maxTokens;
        private boolean enabled = true;
    }
}
