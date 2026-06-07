package com.workmate.server.service;

import com.workmate.server.dto.request.StrategyCreateRequest;
import com.workmate.server.dto.response.PaginatedData;
import com.workmate.server.entity.UpgradeStrategy;
import com.workmate.server.entity.UpgradeStrategyStage;
import com.workmate.server.entity.UpgradeStrategyStageRule;
import com.workmate.server.entity.UpgradeWhitelist;
import com.workmate.server.exception.AppException;
import com.workmate.server.mapper.ObservabilityErrorMapper;
import com.workmate.server.mapper.ObservabilityEventMapper;
import com.workmate.server.mapper.UpgradeStrategyMapper;
import com.workmate.server.mapper.UpgradeStrategyStageMapper;
import com.workmate.server.mapper.UpgradeStrategyStageRuleMapper;
import com.workmate.server.mapper.UpgradeWhitelistMapper;
import com.github.pagehelper.PageHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class StrategyService {

    private final UpgradeStrategyMapper strategyMapper;
    private final UpgradeStrategyStageMapper stageMapper;
    private final UpgradeStrategyStageRuleMapper stageRuleMapper;
    private final UpgradeWhitelistMapper whitelistMapper;
    private final ObservabilityEventMapper eventMapper;
    private final ObservabilityErrorMapper errorMapper;

    @Transactional
    public UpgradeStrategy createStrategy(StrategyCreateRequest input) {
        UpgradeStrategy strategy = UpgradeStrategy.builder()
                .name(input.getName())
                .releaseType(input.getReleaseType().name())
                .targetVersion(input.getTargetVersion())
                .downloadUrl(input.getDownloadUrl())
                .releaseNotes(input.getReleaseNotes())
                .platform(input.getPlatform())
                .minVersion(input.getMinVersion())
                .totalStages(input.getTotalStages())
                .currentStage(0)
                .soakTimeMinutes(input.getSoakTimeMinutes())
                .autoPauseErrorRate(input.getAutoPauseErrorRate())
                .autoPauseEnabled(input.getAutoPauseEnabled() != null ? input.getAutoPauseEnabled() : false)
                .status("DRAFT")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        strategyMapper.insert(strategy);

        for (int i = 0; i < input.getStages().size(); i++) {
            StrategyCreateRequest.StageInput stageInput = input.getStages().get(i);
            UpgradeStrategyStage stage = UpgradeStrategyStage.builder()
                    .strategyId(strategy.getId())
                    .stageOrder(i + 1)
                    .name(stageInput.getName())
                    .releaseNotes(stageInput.getReleaseNotes())
                    .createdAt(LocalDateTime.now())
                    .build();
            stageMapper.insert(stage);

            if (stageInput.getRules() != null) {
                for (StrategyCreateRequest.RuleInput ruleInput : stageInput.getRules()) {
                    UpgradeStrategyStageRule rule = UpgradeStrategyStageRule.builder()
                            .stageId(stage.getId())
                            .ruleType(ruleInput.getRuleType())
                            .ruleValue(ruleInput.getRuleValue())
                            .build();
                    stageRuleMapper.insert(rule);
                }
            }
        }

        return strategyMapper.findById(strategy.getId()).orElse(strategy);
    }

    @Transactional
    public UpgradeStrategy activateStrategy(Integer strategyId) {
        UpgradeStrategy strategy = strategyMapper.findById(strategyId)
                .orElseThrow(() -> new AppException(404, "策略不存在"));
        if (!"DRAFT".equals(strategy.getStatus())) {
            throw new AppException(400, "只有草稿状态的策略可以启动");
        }

        strategyMapper.findFirstByPlatformAndStatus(strategy.getPlatform(), "ACTIVE")
                .ifPresent(existing -> {
                    throw new AppException(400, "平台 " + strategy.getPlatform() +
                            " 已有激活策略「" + existing.getName() + "」（ID: " + existing.getId() + "），请先完成或暂停该策略");
                });

        LocalDateTime now = LocalDateTime.now();
        strategy.setStatus("ACTIVE");
        strategy.setCurrentStage(1);
        strategy.setUpdatedAt(now);
        strategyMapper.update(strategy);

        List<UpgradeStrategyStage> stages = stageMapper.findByStrategyIdOrderByStageOrderAsc(strategyId);
        if (!stages.isEmpty()) {
            UpgradeStrategyStage firstStage = stages.get(0);
            firstStage.setAdvancedAt(now);
            stageMapper.update(firstStage);

            List<UpgradeStrategyStageRule> rules = stageRuleMapper.findByStageId(firstStage.getId());
            if (rules != null && !rules.isEmpty()) {
                for (UpgradeStrategyStageRule rule : rules) {
                    UpgradeWhitelist whitelist = UpgradeWhitelist.builder()
                            .sourceStrategyId(strategyId)
                            .ruleType(rule.getRuleType())
                            .ruleValue(rule.getRuleValue())
                            .targetVersion(strategy.getTargetVersion())
                            .platform(strategy.getPlatform())
                            .isActive(true)
                            .createdAt(LocalDateTime.now())
                            .build();
                    whitelistMapper.insert(whitelist);
                }
            }
        }

        return strategyMapper.findById(strategyId).orElse(strategy);
    }

    @Transactional
    public UpgradeStrategyStage advanceStrategyStage(Integer strategyId) {
        UpgradeStrategy strategy = findStrategyWithStages(strategyId);
        if (!"ACTIVE".equals(strategy.getStatus())) {
            throw new AppException(400, "只有进行中的策略可以推进");
        }

        List<UpgradeStrategyStage> stages = stageMapper.findByStrategyIdOrderByStageOrderAsc(strategyId);
        UpgradeStrategyStage nextStage = stages.stream()
                .filter(s -> s.getStageOrder() == strategy.getCurrentStage() + 1)
                .findFirst()
                .orElseThrow(() -> new AppException(400, "已到达最终阶段"));

        LocalDateTime now = LocalDateTime.now();

        UpgradeStrategyStage currentStage = stages.stream()
                .filter(s -> s.getStageOrder().equals(strategy.getCurrentStage()))
                .findFirst().orElse(null);

        if (currentStage != null && currentStage.getAdvancedAt() != null && strategy.getSoakTimeMinutes() != null) {
            long elapsedMinutes = java.time.Duration.between(currentStage.getAdvancedAt(), now).toMinutes();
            if (elapsedMinutes < strategy.getSoakTimeMinutes()) {
                throw new AppException(400, "浸泡时间不足，还需等待 " +
                        (strategy.getSoakTimeMinutes() - elapsedMinutes) + " 分钟");
            }
        }

        if (Boolean.TRUE.equals(strategy.getAutoPauseEnabled()) && strategy.getAutoPauseErrorRate() != null) {
            long errorCount = getStageErrorCount(strategy.getPlatform(), strategy.getTargetVersion(),
                    currentStage != null ? currentStage.getAdvancedAt() : null);
            long totalRequests = getStageRequestCount(strategy.getPlatform(), strategy.getTargetVersion(),
                    currentStage != null ? currentStage.getAdvancedAt() : null);

            if (totalRequests > 10) {
                double errorRate = (double) errorCount / totalRequests;
                if (errorRate > strategy.getAutoPauseErrorRate().doubleValue()) {
                    strategy.setStatus("PAUSED");
                    strategy.setUpdatedAt(now);
                    strategyMapper.update(strategy);
                    throw new AppException(400, String.format(
                            "错误率 %.1f%% 超过阈值 %.1f%%，策略已自动暂停",
                            errorRate * 100, strategy.getAutoPauseErrorRate().doubleValue() * 100));
                }
            }
        }

        whitelistMapper.deleteByStrategyId(strategyId);

        List<UpgradeStrategyStageRule> allRules = stages.stream()
                .filter(s -> s.getStageOrder() <= nextStage.getStageOrder())
                .flatMap(s -> stageRuleMapper.findByStageId(s.getId()).stream())
                .toList();

        for (UpgradeStrategyStageRule rule : allRules) {
            UpgradeWhitelist whitelist = UpgradeWhitelist.builder()
                    .sourceStrategyId(strategyId)
                    .ruleType(rule.getRuleType()).ruleValue(rule.getRuleValue())
                    .targetVersion(strategy.getTargetVersion()).platform(strategy.getPlatform())
                    .isActive(true).createdAt(LocalDateTime.now())
                    .build();
            whitelistMapper.insert(whitelist);
        }

        nextStage.setAdvancedAt(now);
        stageMapper.update(nextStage);

        strategy.setCurrentStage(nextStage.getStageOrder());
        strategy.setUpdatedAt(now);
        strategyMapper.update(strategy);

        return nextStage;
    }

    @Transactional
    public UpgradeStrategy retreatStrategyStage(Integer strategyId) {
        UpgradeStrategy strategy = findStrategyWithStages(strategyId);
        if (!"ACTIVE".equals(strategy.getStatus())) {
            throw new AppException(400, "只有进行中的策略可以回撤");
        }
        if (strategy.getCurrentStage() <= 1) {
            throw new AppException(400, "已在第一阶段，无法回撤");
        }

        int prevStageOrder = strategy.getCurrentStage() - 1;
        List<UpgradeStrategyStage> stages = stageMapper.findByStrategyIdOrderByStageOrderAsc(strategyId);
        UpgradeStrategyStage prevStage = stages.stream()
                .filter(s -> s.getStageOrder() == prevStageOrder)
                .findFirst()
                .orElseThrow(() -> new AppException(400, "上一阶段不存在"));

        List<UpgradeStrategyStageRule> prevRules = stageRuleMapper.findByStageId(prevStage.getId());
        boolean isPrevFullRollout = prevRules == null || prevRules.isEmpty();

        whitelistMapper.deleteByStrategyId(strategyId);

        if (!isPrevFullRollout) {
            List<UpgradeStrategyStageRule> prevAllRules = stages.stream()
                    .filter(s -> s.getStageOrder() <= prevStageOrder)
                    .flatMap(s -> stageRuleMapper.findByStageId(s.getId()).stream())
                    .toList();

            for (UpgradeStrategyStageRule rule : prevAllRules) {
                UpgradeWhitelist whitelist = UpgradeWhitelist.builder()
                        .sourceStrategyId(strategyId)
                        .ruleType(rule.getRuleType()).ruleValue(rule.getRuleValue())
                        .targetVersion(strategy.getTargetVersion()).platform(strategy.getPlatform())
                        .isActive(true).createdAt(LocalDateTime.now())
                        .build();
                whitelistMapper.insert(whitelist);
            }
        }

        strategy.setCurrentStage(prevStageOrder);
        strategy.setUpdatedAt(LocalDateTime.now());
        strategyMapper.update(strategy);

        return strategyMapper.findById(strategyId).orElse(strategy);
    }

    @Transactional
    public UpgradeStrategy pauseStrategy(Integer strategyId) {
        UpgradeStrategy strategy = strategyMapper.findById(strategyId)
                .orElseThrow(() -> new AppException(404, "策略不存在"));
        if (!"ACTIVE".equals(strategy.getStatus())) {
            throw new AppException(400, "只有进行中的策略可以暂停");
        }

        whitelistMapper.deleteByStrategyId(strategyId);
        strategy.setStatus("PAUSED");
        strategy.setUpdatedAt(LocalDateTime.now());
        strategyMapper.update(strategy);
        return strategy;
    }

    @Transactional
    public UpgradeStrategy resumeStrategy(Integer strategyId) {
        UpgradeStrategy strategy = findStrategyWithStages(strategyId);
        if (!"PAUSED".equals(strategy.getStatus())) {
            throw new AppException(400, "只有已暂停的策略可以恢复");
        }

        List<UpgradeStrategyStage> stages = stageMapper.findByStrategyIdOrderByStageOrderAsc(strategyId);
        List<UpgradeStrategyStageRule> allRules = stages.stream()
                .filter(s -> s.getStageOrder() <= strategy.getCurrentStage())
                .flatMap(s -> stageRuleMapper.findByStageId(s.getId()).stream())
                .toList();

        whitelistMapper.deleteByStrategyId(strategyId);

        for (UpgradeStrategyStageRule rule : allRules) {
            UpgradeWhitelist whitelist = UpgradeWhitelist.builder()
                    .sourceStrategyId(strategyId)
                    .ruleType(rule.getRuleType()).ruleValue(rule.getRuleValue())
                    .targetVersion(strategy.getTargetVersion()).platform(strategy.getPlatform())
                    .isActive(true).createdAt(LocalDateTime.now())
                    .build();
            whitelistMapper.insert(whitelist);
        }

        strategy.setStatus("ACTIVE");
        strategy.setUpdatedAt(LocalDateTime.now());
        strategyMapper.update(strategy);

        return strategy;
    }

    @Transactional
    public UpgradeStrategy finishStrategy(Integer strategyId, Integer nextStrategyId) {
        UpgradeStrategy strategy = strategyMapper.findById(strategyId)
                .orElseThrow(() -> new AppException(404, "策略不存在"));
        if (!"ACTIVE".equals(strategy.getStatus()) && !"PAUSED".equals(strategy.getStatus())) {
            throw new AppException(400, "只有进行中或已暂停的策略可以完成");
        }
        if (nextStrategyId == null) {
            throw new AppException(400, "必须指定下一个升级策略，以保证升级服务不中断");
        }

        UpgradeStrategy nextStrategy = strategyMapper.findById(nextStrategyId)
                .orElseThrow(() -> new AppException(404, "下一个策略不存在"));
        if (!nextStrategy.getPlatform().equals(strategy.getPlatform())) {
            throw new AppException(400, "下一个策略平台不匹配（当前: " + strategy.getPlatform() +
                    "，目标: " + nextStrategy.getPlatform() + "）");
        }
        if (!"DRAFT".equals(nextStrategy.getStatus())) {
            throw new AppException(400, "下一个策略必须为草稿状态");
        }

        LocalDateTime now = LocalDateTime.now();

        whitelistMapper.deleteByStrategyId(strategyId);
        strategy.setStatus("FINISHED");
        strategy.setUpdatedAt(now);
        strategyMapper.update(strategy);

        nextStrategy.setStatus("ACTIVE");
        nextStrategy.setCurrentStage(1);
        nextStrategy.setUpdatedAt(now);
        strategyMapper.update(nextStrategy);

        List<UpgradeStrategyStage> nextStages = stageMapper.findByStrategyIdOrderByStageOrderAsc(nextStrategyId);
        if (!nextStages.isEmpty()) {
            UpgradeStrategyStage firstStage = nextStages.get(0);
            firstStage.setAdvancedAt(now);
            stageMapper.update(firstStage);

            List<UpgradeStrategyStageRule> rules = stageRuleMapper.findByStageId(firstStage.getId());
            if (rules != null && !rules.isEmpty()) {
                for (UpgradeStrategyStageRule rule : rules) {
                    UpgradeWhitelist whitelist = UpgradeWhitelist.builder()
                            .sourceStrategyId(nextStrategyId)
                            .ruleType(rule.getRuleType()).ruleValue(rule.getRuleValue())
                            .targetVersion(nextStrategy.getTargetVersion()).platform(nextStrategy.getPlatform())
                            .isActive(true).createdAt(LocalDateTime.now())
                            .build();
                    whitelistMapper.insert(whitelist);
                }
            }
        }

        return strategyMapper.findById(strategyId).orElse(strategy);
    }

    @Transactional
    public UpgradeStrategy editStrategyStages(Integer strategyId,
                                                List<StrategyCreateRequest.StageInput> stagesInput,
                                                Integer totalStages) {
        UpgradeStrategy strategy = strategyMapper.findById(strategyId)
                .orElseThrow(() -> new AppException(404, "策略不存在"));
        if ("FINISHED".equals(strategy.getStatus())) {
            throw new AppException(400, "已完成的策略不可编辑");
        }

        List<UpgradeStrategyStage> existingStages = stageMapper.findByStrategyIdOrderByStageOrderAsc(strategyId);
        java.util.Map<Integer, LocalDateTime> advancedAtMap = new java.util.HashMap<>();
        for (UpgradeStrategyStage es : existingStages) {
            advancedAtMap.put(es.getStageOrder(), es.getAdvancedAt());
        }

        stageMapper.deleteByStrategyId(strategyId);

        for (int i = 0; i < stagesInput.size(); i++) {
            StrategyCreateRequest.StageInput stageInput = stagesInput.get(i);
            UpgradeStrategyStage stage = UpgradeStrategyStage.builder()
                    .strategyId(strategyId)
                    .stageOrder(i + 1)
                    .name(stageInput.getName())
                    .releaseNotes(stageInput.getReleaseNotes())
                    .advancedAt(advancedAtMap.getOrDefault(i + 1, null))
                    .createdAt(LocalDateTime.now())
                    .build();
            stageMapper.insert(stage);

            if (stageInput.getRules() != null) {
                for (StrategyCreateRequest.RuleInput ruleInput : stageInput.getRules()) {
                    UpgradeStrategyStageRule rule = UpgradeStrategyStageRule.builder()
                            .stageId(stage.getId())
                            .ruleType(ruleInput.getRuleType())
                            .ruleValue(ruleInput.getRuleValue())
                            .build();
                    stageRuleMapper.insert(rule);
                }
            }
        }

        strategy.setTotalStages(totalStages);
        strategy.setUpdatedAt(LocalDateTime.now());
        strategyMapper.update(strategy);

        if ("ACTIVE".equals(strategy.getStatus())) {
            StrategyCreateRequest.StageInput currentStageInput = stagesInput.get(strategy.getCurrentStage() - 1);
            if (currentStageInput != null && currentStageInput.getRules() != null && !currentStageInput.getRules().isEmpty()) {
                whitelistMapper.deleteByStrategyId(strategyId);
                for (StrategyCreateRequest.RuleInput ruleInput : currentStageInput.getRules()) {
                    UpgradeWhitelist whitelist = UpgradeWhitelist.builder()
                            .sourceStrategyId(strategyId)
                            .ruleType(ruleInput.getRuleType()).ruleValue(ruleInput.getRuleValue())
                            .targetVersion(strategy.getTargetVersion()).platform(strategy.getPlatform())
                            .isActive(true).createdAt(LocalDateTime.now())
                            .build();
                    whitelistMapper.insert(whitelist);
                }
            }
        }

        return strategyMapper.findById(strategyId).orElse(strategy);
    }

    @Transactional(readOnly = true)
    public PaginatedData<List<UpgradeStrategy>> listStrategies(int page, int pageSize) {
        PageHelper.startPage(page, pageSize);
        List<UpgradeStrategy> list = strategyMapper.findAll();
        long total = strategyMapper.count();
        return PaginatedData.of(list, total, page, pageSize);
    }

    @Transactional(readOnly = true)
    public UpgradeStrategy getStrategyDetail(Integer strategyId) {
        return strategyMapper.findById(strategyId).orElse(null);
    }

    private UpgradeStrategy findStrategyWithStages(Integer strategyId) {
        return strategyMapper.findById(strategyId)
                .orElseThrow(() -> new AppException(404, "策略不存在"));
    }

    private long getStageErrorCount(String platform, String targetVersion, LocalDateTime since) {
        if (since != null) {
            return errorMapper.countByClientPlatformAndClientVersionAndCreatedAtGreaterThanEqual(
                    platform, targetVersion, since);
        }
        return errorMapper.countByClientPlatformAndClientVersionAndCreatedAtGreaterThanEqual(
                platform, targetVersion, LocalDateTime.of(2000, 1, 1, 0, 0));
    }

    private long getStageRequestCount(String platform, String targetVersion, LocalDateTime since) {
        List<String> eventTypes = List.of("chat_question", "agent_question");
        if (since != null) {
            return eventMapper.countByClientPlatformAndClientVersionAndCreatedAtGreaterThanEqualAndEventTypeIn(
                    platform, targetVersion, since, eventTypes);
        }
        return eventMapper.countByClientPlatformAndClientVersionAndCreatedAtGreaterThanEqualAndEventTypeIn(
                platform, targetVersion, LocalDateTime.of(2000, 1, 1, 0, 0), eventTypes);
    }
}
