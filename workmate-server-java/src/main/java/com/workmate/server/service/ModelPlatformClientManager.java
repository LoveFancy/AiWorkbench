package com.workmate.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workmate.server.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 大模型平台客户端管理器。
 * <p>
 * 负责调用大模型平台认证接口，获取用户的 API Key 和授权模型列表。
 * 测试和生产环境使用同一接口地址。
 * <p>
 * 所有模型都支持 openai 和 anthropic 两种协议，通过 default-provider 统一决定使用哪种协议。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ModelPlatformClientManager {

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    private static final String SCENE = "workmate";

    /**
     * 调用大模型平台认证接口，获取用户凭证和模型列表。
     *
     * @param userId 工号
     * @return 用户凭证（apiKey + 模型列表），失败时返回空凭证
     */
    public ModelPlatformService.UserCredentials fetchUserCredentials(String userId) {
        String authUrl = appProperties.getModelPlatform().getAuthUrl();
        log.info("调用大模型平台认证接口, userId={}, url={}, scene={}", userId, authUrl, SCENE);

        try {
            // 构建请求体
            Map<String, String> requestBody = Map.of("userId", userId, "scene", SCENE);
            String requestJson = objectMapper.writeValueAsString(requestBody);

            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofMillis(appProperties.getModelPlatformTimeoutMs()))
                    .build();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(authUrl))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofMillis(appProperties.getModelPlatformTimeoutMs()))
                    .POST(HttpRequest.BodyPublishers.ofString(requestJson))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.error("大模型平台认证接口返回错误, status={}, userId={}, body={}",
                        response.statusCode(), userId, response.body());
                return new ModelPlatformService.UserCredentials("", List.of());
            }

            JsonNode root = objectMapper.readTree(response.body());
            String finalApiKey = root.has("finalApiKey") ? root.get("finalApiKey").asText("") : "";

            List<ModelPlatformService.ModelInfo> models = parseModelList(root);

            log.info("大模型平台认证成功, userId={}, apiKey={}..., modelCount={}",
                    userId, finalApiKey.length() > 8 ? finalApiKey.substring(0, 8) : finalApiKey, models.size());

            return new ModelPlatformService.UserCredentials(finalApiKey, models);
        } catch (Exception e) {
            log.error("调用大模型平台认证接口失败, userId={}", userId, e);
            return new ModelPlatformService.UserCredentials("", List.of());
        }
    }

    /**
     * 从响应中解析模型列表。
     * <p>
     * modeljson 字段格式：
     * <pre>{@code
     * {
     *   "object": "list",
     *   "data": [
     *     {"id": "deepseek", "object": "model", "permission": [], "owned_by": "llmpf"}
     *   ]
     * }
     * }</pre>
     * <p>
     * 所有模型统一使用 default-provider 决定协议类型和调用地址。
     */
    private List<ModelPlatformService.ModelInfo> parseModelList(JsonNode root) {
        List<ModelPlatformService.ModelInfo> models = new ArrayList<>();

        JsonNode modelJson = root.has("model") ? root.get("model") : null;
        if (modelJson == null || !modelJson.has("data") || !modelJson.get("data").isArray()) {
            log.warn("modeljson 字段缺失或格式异常");
            return models;
        }

        // 所有模型统一使用默认的 provider 和 baseUrl
        String provider = appProperties.getModelPlatform().getDefaultProvider();
        String baseUrl = resolveBaseUrl(provider);

        for (JsonNode item : modelJson.get("data")) {
            String id = item.has("id") ? item.get("id").asText() : null;
            if (id == null) continue;

            models.add(new ModelPlatformService.ModelInfo(
                    id,
                    id,                  // name: 使用模型 ID 作为显示名称
                    null,                // description
                    provider,            // 所有模型使用统一的 provider
                    baseUrl,             // 所有模型使用统一的 baseUrl
                    null,                // maxTokens
                    true                 // enabled
            ));
        }

        return models;
    }

    /**
     * 根据 provider 获取调用地址（baseUrl）。
     */
    private String resolveBaseUrl(String provider) {
        Map<String, String> providerUrlMapping = appProperties.getModelPlatform().getProviderUrlMapping();
        if (providerUrlMapping != null && providerUrlMapping.containsKey(provider)) {
            return providerUrlMapping.get(provider);
        }
        // 如果 providerUrlMapping 没有配置，根据 default-provider 组合出完整的 URL
        AppProperties.LlmService llmService = appProperties.getLlmService();
        if ("anthropic".equals(provider)) {
            return llmService.getBaseUrl() + llmService.getAnthropicPath();
        }
        return llmService.getBaseUrl() + llmService.getOpenaiPath();
    }
}
