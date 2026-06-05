package com.workmate.server.controller;

import com.workmate.server.config.AppProperties;
import com.workmate.server.dto.response.ApiResponse;
import com.workmate.server.service.ModelPlatformService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/workmate/models")
@RequiredArgsConstructor
public class ModelsController {

    private final ModelPlatformService modelPlatformService;
    private final AppProperties appProperties;

    @GetMapping
    public ApiResponse<Map<String, Object>> getUserModels(HttpServletRequest httpRequest) {
        String jobId = (String) httpRequest.getAttribute("jobId");
        ModelPlatformService.UserCredentials credentials = modelPlatformService.getUserCredentials(jobId);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("apiKey", credentials.apiKey());
        data.put("models", credentials.models());
        data.put("total", credentials.models().size());

        // 本地开发模式：附带各协议的 Base URL
        if (appProperties.getLocalDev().isEnabled()) {
            data.put("baseUrls", Map.of(
                    "anthropic", appProperties.getLocalDev().getBaseUrls().getAnthropic(),
                    "openai", appProperties.getLocalDev().getBaseUrls().getOpenai()
            ));
        }

        return ApiResponse.ok(data);
    }
}
