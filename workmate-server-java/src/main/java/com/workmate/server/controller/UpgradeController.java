package com.workmate.server.controller;

import com.workmate.server.dto.request.UpgradeCheckRequest;
import com.workmate.server.dto.response.ApiResponse;
import com.workmate.server.dto.response.UpgradeCheckResponse;
import com.workmate.server.service.UpgradeService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/workmate/upgrade")
@RequiredArgsConstructor
public class UpgradeController {

    private final UpgradeService upgradeService;

    @GetMapping("/check")
    public ApiResponse<UpgradeCheckResponse> checkUpgrade(
            @Valid UpgradeCheckRequest request,
            HttpServletRequest httpRequest) {
        String jobId = (String) httpRequest.getAttribute("jobId");
        UpgradeCheckResponse result = upgradeService.checkUpgrade(request, jobId);
        return ApiResponse.ok(result);
    }
}
