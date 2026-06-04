package com.workmate.server.controller;

import com.workmate.server.dto.response.ApiResponse;
import com.workmate.server.service.ModelPlatformService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/workmate/models")
@RequiredArgsConstructor
public class ModelsController {

    private final ModelPlatformService modelPlatformService;

    @GetMapping
    public ApiResponse<Map<String, Object>> getUserModels(HttpServletRequest httpRequest) {
        String jobId = (String) httpRequest.getAttribute("jobId");
        ModelPlatformService.UserCredentials credentials = modelPlatformService.getUserCredentials(jobId);
        return ApiResponse.ok(Map.of(
                "apiKey", credentials.apiKey(),
                "models", credentials.models(),
                "total", credentials.models().size()
        ));
    }
}
