package com.workmate.server.controller;

import com.workmate.server.dto.request.ObservabilityEventRequest;
import com.workmate.server.dto.response.ApiResponse;
import com.workmate.server.dto.response.EventStats;
import com.workmate.server.dto.response.PaginatedData;
import com.workmate.server.entity.ObservabilityError;
import com.workmate.server.entity.ObservabilityEvent;
import com.workmate.server.service.ObservabilityService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/workmate/observability")
@RequiredArgsConstructor
public class ObservabilityController {

    private final ObservabilityService observabilityService;

    /**
     * 客户端批量上报观测事件（统一入口，服务端按 type 分流到业务表或异常表）
     */
    @PostMapping("/events")
    public ApiResponse<Object> reportEvents(
            @Valid @RequestBody ObservabilityEventRequest request,
            HttpServletRequest httpRequest) {
        String jobId = (String) httpRequest.getAttribute("jobId");
        Object result = observabilityService.createEvent(request, jobId);
        if (result == null) {
            return ApiResponse.ok(null, "rate_limited");
        }
        return ApiResponse.ok(result, "上报成功");
    }

    /**
     * 管理台：查询业务事件（仅 user_login/user_logout/chat_question/agent_question/upgrade_check）
     * 必须传 year 参数触发分区裁剪
     */
    @GetMapping("/events")
    public ApiResponse<PaginatedData<List<ObservabilityEvent>>> queryEvents(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String clientVersion) {
        PaginatedData<List<ObservabilityEvent>> result = observabilityService.queryEvents(
                page, pageSize, eventType, userId, year, clientVersion);
        return ApiResponse.ok(result);
    }

    /**
     * 管理台：查询异常事件（仅 error 类型）
     * 必须传 year 参数触发分区裁剪
     */
    @GetMapping("/errors")
    public ApiResponse<PaginatedData<List<ObservabilityError>>> queryErrors(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String clientVersion,
            @RequestParam(required = false) String errorFingerprint) {
        PaginatedData<List<ObservabilityError>> result = observabilityService.queryErrors(
                page, pageSize, userId, year, clientVersion, errorFingerprint);
        return ApiResponse.ok(result);
    }

    /**
     * 管理台：观测统计概览（含 Top 错误指纹）
     */
    @GetMapping("/stats")
    public ApiResponse<EventStats> getEventStats(
            @RequestParam(required = false) Integer year) {
        EventStats stats = observabilityService.getEventStats(year);
        return ApiResponse.ok(stats);
    }
}
