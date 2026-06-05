package com.workmate.server.service;

import com.workmate.server.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

@Slf4j
@Service
@RequiredArgsConstructor
public class ModelPlatformService {

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    public record ModelInfo(String id, String name, String description, String provider,
                            String baseUrl, Integer maxTokens, boolean enabled) {
    }

    public record UserCredentials(String apiKey, List<ModelInfo> models) {
    }

    public UserCredentials getUserCredentials(String userId) {
        // 本地开发模式：直接返回预定义模型列表，不请求真实平台
        if (appProperties.getLocalDev().isEnabled()) {
            log.info("[本地开发模式] 返回预定义模型列表, userId={}, modelCount={}",
                    userId, appProperties.getLocalDev().getModels().size());
            return buildLocalDevCredentials();
        }

        String url = appProperties.getModelPlatformApiUrl() + "/users/" + userId + "/credentials";
        log.info("查询用户凭证和模型列表, userId={}, url={}", userId, url);

        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofMillis(appProperties.getModelPlatformTimeoutMs()))
                    .build();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofMillis(appProperties.getModelPlatformTimeoutMs()))
                    .GET()
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.error("大模型平台返回错误, status={}, userId={}", response.statusCode(), userId);
                return new UserCredentials("", List.of());
            }

            JsonNode root = objectMapper.readTree(response.body());
            String apiKey = root.has("apiKey") ? root.get("apiKey").asText("") : "";

            List<ModelInfo> models = new ArrayList<>();
            if (root.has("models") && root.get("models").isArray()) {
                for (JsonNode m : root.get("models")) {
                    boolean enabled = m.has("enabled") && m.get("enabled").asBoolean(false);
                    if (enabled) {
                        models.add(new ModelInfo(
                                m.has("id") ? m.get("id").asText() : null,
                                m.has("name") ? m.get("name").asText() : null,
                                m.has("description") ? m.get("description").asText() : null,
                                m.has("provider") ? m.get("provider").asText() : null,
                                m.has("baseUrl") ? m.get("baseUrl").asText() : null,
                                m.has("maxTokens") && !m.get("maxTokens").isNull() ? m.get("maxTokens").asInt() : null,
                                enabled
                        ));
                    }
                }
            }

            return new UserCredentials(apiKey, models);
        } catch (Exception e) {
            log.error("查询大模型平台失败, userId={}", userId, e);
            return new UserCredentials("", List.of());
        }
    }

    /**
     * 从 application-localdev.yml 构建本地开发模式的凭证。
     * 仅返回 enabled=true 的模型。baseUrl 由每个模型独立配置。
     */
    private UserCredentials buildLocalDevCredentials() {
        AppProperties.LocalDev localDev = appProperties.getLocalDev();
        List<ModelInfo> models = localDev.getModels().stream()
                .filter(AppProperties.LocalDevModel::isEnabled)
                .map(m -> new ModelInfo(
                        m.getId(),
                        m.getName(),
                        m.getDescription(),
                        m.getProvider(),
                        m.getBaseUrl(),
                        m.getMaxTokens(),
                        true
                ))
                .toList();
        return new UserCredentials(localDev.getApiKey(), models);
    }
}
