package com.workmate.server.service;

import com.workmate.server.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ModelPlatformService {

    private final AppProperties appProperties;
    private final ModelPlatformClientManager modelPlatformClientManager;

    public record ModelInfo(String id, String name, String description, String provider,
                            String baseUrl, Integer maxTokens, boolean enabled) {
    }

    public record UserCredentials(String apiKey, List<ModelInfo> models) {
    }

    /**
     * 获取用户凭证和可用模型列表。
     * <ul>
     *   <li>本地开发模式（local-dev.enabled=true）：返回预定义模型列表</li>
     *   <li>测试/生产环境：委托 {@link ModelPlatformClientManager} 调用大模型平台认证接口</li>
     * </ul>
     */
    public UserCredentials getUserCredentials(String userId) {
        // 本地开发模式：直接返回预定义模型列表，不请求真实平台
        if (appProperties.getLocalDev().isEnabled()) {
            log.info("[本地开发模式] 返回预定义模型列表, userId={}, modelCount={}",
                    userId, appProperties.getLocalDev().getModels().size());
            return buildLocalDevCredentials();
        }

        // 测试/生产环境：通过 ModelPlatformClientManager 调用大模型平台认证接口
        return modelPlatformClientManager.fetchUserCredentials(userId);
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
