package com.workmate.server.controller;

import com.workmate.server.dto.request.StrategyCreateRequest;
import com.workmate.server.dto.request.UpgradeReleaseRequest;
import com.workmate.server.dto.request.WhitelistRuleRequest;
import com.workmate.server.dto.response.ApiResponse;
import com.workmate.server.dto.response.DashboardStats;
import com.workmate.server.dto.response.EventStats;
import com.workmate.server.dto.response.ReleaseUploadResponse;
import com.workmate.server.entity.AdminWhitelist;
import com.workmate.server.entity.UpgradeRelease;
import com.workmate.server.entity.UpgradeStrategy;
import com.workmate.server.service.AdminService;
import com.workmate.server.service.ObservabilityService;
import com.workmate.server.service.ReleaseFileService;
import com.workmate.server.service.StrategyService;
import com.workmate.server.service.UpgradeService;
import com.workmate.server.service.WhitelistService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

@RestController
@RequestMapping("/workmate/console")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final WhitelistService whitelistService;
    private final StrategyService strategyService;
    private final UpgradeService upgradeService;
    private final ReleaseFileService releaseFileService;
    private final ObservabilityService observabilityService;

    // ===== 权限校验 =====

    @GetMapping("/verify")
    public ApiResponse<Map<String, Object>> verify(HttpServletRequest httpRequest) {
        String jobId = (String) httpRequest.getAttribute("jobId");
        return ApiResponse.ok(Map.of("jobId", jobId != null ? jobId : "", "hasAccess", true));
    }

    // ===== Dashboard =====

    @GetMapping("/dashboard")
    public ApiResponse<DashboardStats> dashboard() {
        return ApiResponse.ok(adminService.getDashboardStats());
    }

    // ===== 管理台白名单 =====

    @GetMapping("/admin-whitelist")
    public ApiResponse<Map<String, Object>> listAdminWhitelist(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        var result = adminService.listAdminWhitelistRules(page, pageSize);
        return ApiResponse.ok(Map.of("total", result.total(), "rules", result.items()));
    }

    @PostMapping("/admin-whitelist")
    public ApiResponse<AdminWhitelist> addAdminWhitelist(@Valid @RequestBody WhitelistRuleRequest request) {
        AdminWhitelist rule = adminService.addAdminWhitelistRule(
                request.getRuleType(), request.getRuleValue(), request.getRemark());
        return ApiResponse.ok(rule, "添加成功");
    }

    @DeleteMapping("/admin-whitelist/{id}")
    public ApiResponse<Void> removeAdminWhitelist(@PathVariable Integer id) {
        adminService.removeAdminWhitelistRule(id);
        return ApiResponse.ok(null, "删除成功");
    }

    @PatchMapping("/admin-whitelist/{id}")
    public ApiResponse<AdminWhitelist> toggleAdminWhitelist(
            @PathVariable Integer id, @RequestBody Map<String, Boolean> body) {
        Boolean isActive = body.get("isActive");
        AdminWhitelist rule = adminService.updateAdminWhitelistStatus(id, isActive);
        return ApiResponse.ok(rule, "更新成功");
    }

    // ===== 升级白名单（仅查询） =====

    @GetMapping("/upgrade-whitelist")
    public ApiResponse<Map<String, Object>> listUpgradeWhitelist(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String platform,
            @RequestParam(required = false) String targetVersion) {
        var result = whitelistService.listWhitelistRules(page, pageSize, platform, targetVersion);
        return ApiResponse.ok(Map.of("total", result.total(), "rules", result.items()));
    }

    // ===== 发布版本管理 =====

    @GetMapping("/releases")
    public ApiResponse<Map<String, Object>> listReleases(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String platform) {
        var result = upgradeService.listReleases(page, pageSize, platform);
        return ApiResponse.ok(Map.of("total", result.total(), "releases", result.items()));
    }

    @PostMapping({"/releases/upload", "/upgrade/releases/upload"})
    public ApiResponse<ReleaseUploadResponse> uploadReleaseFile(
            @RequestParam String version,
            @RequestParam String platform,
            @RequestParam String arch,
            @RequestParam String packageType,
            @RequestParam MultipartFile file) {
        ReleaseUploadResponse result = releaseFileService.upload(version, platform, arch, packageType, file);
        return ApiResponse.ok(result, "上传成功");
    }

    @PostMapping("/releases")
    public ApiResponse<UpgradeRelease> createRelease(@Valid @RequestBody UpgradeReleaseRequest request) {
        UpgradeRelease result = upgradeService.createRelease(request);
        return ApiResponse.ok(result, "发布版本创建成功");
    }

    @PostMapping("/rollback")
    public ApiResponse<UpgradeRelease> rollbackRelease(@RequestBody Map<String, String> body) {
        String platform = body.get("platform");
        String targetVersion = body.get("targetVersion");
        if (platform == null || platform.isEmpty() || targetVersion == null || targetVersion.isEmpty()) {
            return ApiResponse.error(400, "platform 和 targetVersion 不能为空");
        }
        UpgradeRelease result = upgradeService.rollbackRelease(platform, targetVersion);
        return ApiResponse.ok(result, "回退成功");
    }

    // ===== 升级策略 =====

    @GetMapping("/strategies")
    public ApiResponse<Map<String, Object>> listStrategies(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        var result = strategyService.listStrategies(page, pageSize);
        return ApiResponse.ok(Map.of("total", result.total(), "strategies", result.items()));
    }

    @PostMapping("/strategies")
    public ApiResponse<UpgradeStrategy> createStrategy(@Valid @RequestBody StrategyCreateRequest request) {
        UpgradeStrategy strategy = strategyService.createStrategy(request);
        return ApiResponse.ok(strategy, "策略创建成功");
    }

    @GetMapping("/strategies/{id}")
    public ApiResponse<UpgradeStrategy> getStrategyDetail(@PathVariable Integer id) {
        UpgradeStrategy strategy = strategyService.getStrategyDetail(id);
        if (strategy == null) {
            return ApiResponse.error(404, "策略不存在");
        }
        return ApiResponse.ok(strategy);
    }

    @PostMapping("/strategies/{id}/activate")
    public ApiResponse<UpgradeStrategy> activateStrategy(@PathVariable Integer id) {
        return ApiResponse.ok(strategyService.activateStrategy(id), "策略已激活");
    }

    @PostMapping("/strategies/{id}/advance-stage")
    public ApiResponse<Object> advanceStrategyStage(@PathVariable Integer id) {
        return ApiResponse.ok(strategyService.advanceStrategyStage(id), "阶段推进成功");
    }

    @PostMapping("/strategies/{id}/retreat-stage")
    public ApiResponse<UpgradeStrategy> retreatStrategyStage(@PathVariable Integer id) {
        return ApiResponse.ok(strategyService.retreatStrategyStage(id), "阶段回撤成功");
    }

    @PostMapping("/strategies/{id}/pause")
    public ApiResponse<UpgradeStrategy> pauseStrategy(@PathVariable Integer id) {
        return ApiResponse.ok(strategyService.pauseStrategy(id), "策略已暂停");
    }

    @PostMapping("/strategies/{id}/resume")
    public ApiResponse<UpgradeStrategy> resumeStrategy(@PathVariable Integer id) {
        return ApiResponse.ok(strategyService.resumeStrategy(id), "策略已恢复");
    }

    @PostMapping("/strategies/{id}/finish")
    public ApiResponse<UpgradeStrategy> finishStrategy(
            @PathVariable Integer id, @RequestBody Map<String, Integer> body) {
        Integer nextStrategyId = body.get("nextStrategyId");
        if (nextStrategyId == null) {
            return ApiResponse.error(400, "必须指定下一个升级策略");
        }
        return ApiResponse.ok(strategyService.finishStrategy(id, nextStrategyId), "策略已完成，下一个策略已激活");
    }

    @PutMapping("/strategies/{id}/edit-stages")
    public ApiResponse<UpgradeStrategy> editStrategyStages(
            @PathVariable Integer id, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<StrategyCreateRequest.StageInput> stages = ((List<Map<String, Object>>) body.get("stages"))
                .stream()
                .map(this::mapToStageInput)
                .toList();
        Integer totalStages = (Integer) body.get("totalStages");
        if (stages.isEmpty() || totalStages == null) {
            return ApiResponse.error(400, "stages 和 totalStages 不能为空");
        }
        return ApiResponse.ok(strategyService.editStrategyStages(id, stages, totalStages), "阶段已更新");
    }

    // ===== 观测数据查询（管理台） =====

    @GetMapping("/observability/events")
    public ApiResponse<Map<String, Object>> queryEvents(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String clientVersion) {
        var result = observabilityService.queryEvents(
                page, pageSize, eventType, userId, year, clientVersion);
        return ApiResponse.ok(Map.of(
                "total", result.total(), "events", result.items(),
                "page", result.page(), "pageSize", result.pageSize()));
    }

    @GetMapping("/observability/errors")
    public ApiResponse<Map<String, Object>> queryErrors(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String clientVersion,
            @RequestParam(required = false) String errorFingerprint) {
        var result = observabilityService.queryErrors(
                page, pageSize, userId, year, clientVersion, errorFingerprint);
        return ApiResponse.ok(Map.of(
                "total", result.total(), "errors", result.items(),
                "page", result.page(), "pageSize", result.pageSize()));
    }

    @GetMapping("/observability/stats")
    public ApiResponse<EventStats> getEventStats(
            @RequestParam(required = false) Integer year) {
        return ApiResponse.ok(observabilityService.getEventStats(year));
    }

    @SuppressWarnings("unchecked")
    private StrategyCreateRequest.StageInput mapToStageInput(Map<String, Object> map) {
        List<StrategyCreateRequest.RuleInput> rules = null;
        if (map.get("rules") != null) {
            rules = ((List<Map<String, Object>>) map.get("rules"))
                    .stream()
                    .map(r -> StrategyCreateRequest.RuleInput.builder()
                            .ruleType((String) r.get("ruleType"))
                            .ruleValue((String) r.get("ruleValue"))
                            .build())
                    .toList();
        }
        return StrategyCreateRequest.StageInput.builder()
                .name((String) map.get("name"))
                .releaseNotes((String) map.get("releaseNotes"))
                .rules(rules)
                .build();
    }
}
