package com.workmate.server.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
@Component
@ConfigurationProperties(prefix = "workmate")
public class AppProperties {

    private String userIdEncryptionKey = "";
    private boolean requireUserId = true;
    private String defaultUserId = "test_user";
    private int modelPlatformTimeoutMs = 10000;
    private double observabilitySampleRate = 1.0;
    private int observabilityMaxEventsPerMinute = 60;
    private LocalDev localDev = new LocalDev();

    /** 大模型平台配置 */
    private ModelPlatform modelPlatform = new ModelPlatform();

    /** LLM 服务调用地址 */
    private LlmService llmService = new LlmService();

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
        /** 模型协议：anthropic / openai */
        private String provider;
        /** 调用地址，如 https://api.deepseek.com/anthropic */
        private String baseUrl;
        private Integer maxTokens;
        private boolean enabled = true;
    }

    /**
     * 大模型平台配置。
     * 测试和生产环境使用相同的接口地址。
     */
    @Data
    public static class ModelPlatform {
        /** 认证接口地址，POST 请求，入参 {userId, scene} */
        private String authUrl = "http://168.63.65.40:8090/llm-service/apikey/model/auth";

        /** 默认协议提供方，所有模型统一使用此 provider */
        private String defaultProvider = "openai";

        /**
         * provider 名称 → 调用地址 映射。
         * 如 anthropic → http://xxx/v1/messages，openai → http://xxx/v1/chat/completions
         */
        private Map<String, String> providerUrlMapping = new LinkedHashMap<>();
    }

    /**
     * LLM 大模型服务调用地址。
     */
    @Data
    public static class LlmService {
        /** LLM 服务基础地址 */
        private String baseUrl = "http://168.63.65.40:8090/llm-service/v1";
        /** OpenAI 兼容接口路径 */
        private String openaiPath = "/chat/completions";
        /** Anthropic 兼容接口路径 */
        private String anthropicPath = "/messages";
    }
}
