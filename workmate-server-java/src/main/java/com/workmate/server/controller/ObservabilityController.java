package com.workmate.server.controller;

import com.workmate.server.dto.request.ObservabilityEventRequest;
import com.workmate.server.dto.response.ApiResponse;
import com.workmate.server.dto.response.EventStats;
import com.workmate.server.dto.response.PaginatedData;
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

    @PostMapping("/events")
    public ApiResponse<Object> reportEvent(
            @Valid @RequestBody ObservabilityEventRequest request,
            HttpServletRequest httpRequest) {
        String jobId = (String) httpRequest.getAttribute("jobId");
        Object result = observabilityService.createEvent(request, jobId);
        if (result == null) {
            return ApiResponse.ok(null, "rate_limited");
        }
        return ApiResponse.ok(result, "上报成功");
    }

    @GetMapping("/events")
    public ApiResponse<PaginatedData<List<ObservabilityEvent>>> queryEvents(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String clientVersion,
            @RequestParam(required = false) String errorFingerprint) {
        PaginatedData<List<ObservabilityEvent>> result = observabilityService.queryEvents(
                page, pageSize, eventType, userId, startDate, endDate, clientVersion, errorFingerprint);
        return ApiResponse.ok(result);
    }

    @GetMapping("/stats")
    public ApiResponse<EventStats> getEventStats(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        EventStats stats = observabilityService.getEventStats(startDate, endDate);
        return ApiResponse.ok(stats);
    }
}
