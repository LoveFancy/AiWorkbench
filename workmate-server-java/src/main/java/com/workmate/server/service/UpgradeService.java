package com.workmate.server.service;

import com.workmate.server.dto.request.UpgradeCheckRequest;
import com.workmate.server.dto.request.UpgradeReleaseRequest;
import com.workmate.server.dto.response.PaginatedData;
import com.workmate.server.dto.response.UpgradeCheckResponse;
import com.workmate.server.entity.UpgradeRelease;
import com.workmate.server.entity.UpgradeStrategy;
import com.workmate.server.entity.UpgradeStrategyStage;
import com.workmate.server.entity.UpgradeStrategyStageRule;
import com.workmate.server.mapper.UpgradeReleaseMapper;
import com.workmate.server.mapper.UpgradeStrategyMapper;
import com.workmate.server.mapper.UpgradeWhitelistMapper;
import com.workmate.server.util.VersionComparator;
import com.workmate.server.util.WhitelistMatcher;
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
public class UpgradeService {

    private final UpgradeStrategyMapper strategyMapper;
    private final UpgradeReleaseMapper releaseMapper;
    private final UpgradeWhitelistMapper whitelistMapper;

    @Transactional(readOnly = true)
    public UpgradeCheckResponse checkUpgrade(UpgradeCheckRequest request, String userId) {
        String currentVersion = request.getCurrentVersion();
        String platform = request.getPlatform();

        UpgradeCheckResponse noUpdate = UpgradeCheckResponse.noUpdate();

        UpgradeStrategy activeStrategy = strategyMapper
                .findFirstByPlatformAndStatus(platform, "ACTIVE")
                .orElse(null);

        if (activeStrategy == null) {
            log.info("升级检测：无激活策略, platform={}", platform);
            return noUpdate;
        }

        String targetVersion = activeStrategy.getTargetVersion();
        String releaseType = activeStrategy.getReleaseType();
        log.info("升级检测：找到激活策略, strategyId={}, targetVersion={}, releaseType={}, currentStage={}, platform={}",
                activeStrategy.getId(), targetVersion, releaseType, activeStrategy.getCurrentStage(), platform);

        List<UpgradeStrategyStage> stages = activeStrategy.getStages();
        if (stages == null || stages.isEmpty()) {
            return noUpdate;
        }

        List<UpgradeStrategyStage> executedStages = stages.stream()
                .filter(s -> s.getStageOrder() <= activeStrategy.getCurrentStage())
                .toList();

        if (executedStages.isEmpty()) {
            log.info("升级检测：无已执行阶段, userId={}", userId);
            return noUpdate;
        }

        UpgradeStrategyStage currentStageData = executedStages.get(executedStages.size() - 1);
        List<UpgradeStrategyStageRule> currentRules = currentStageData.getRules();
        boolean isFullRollout = currentRules == null || currentRules.isEmpty();

        if (!isFullRollout) {
            List<WhitelistMatcher.WhitelistRule> allRules = executedStages.stream()
                    .flatMap(s -> {
                        List<UpgradeStrategyStageRule> rules = s.getRules();
                        return rules != null ? rules.stream() : java.util.stream.Stream.empty();
                    })
                    .map(r -> new WhitelistMatcher.WhitelistRule(r.getRuleType(), r.getRuleValue()))
                    .toList();

            if (!allRules.isEmpty() && !WhitelistMatcher.matchAnyRule(userId, allRules)) {
                log.info("升级检测：用户不在白名单, userId={}, targetVersion={}, platform={}", userId, targetVersion, platform);
                return noUpdate;
            }
        }

        int currentCmp = VersionComparator.compare(currentVersion, targetVersion);

        if ("UPGRADE".equals(releaseType)) {
            if (currentCmp >= 0) {
                log.debug("升级检测：当前版本已是最新, currentVersion={}, targetVersion={}", currentVersion, targetVersion);
                return noUpdate;
            }
            String minVersion = activeStrategy.getMinVersion();
            if (minVersion != null && VersionComparator.compare(currentVersion, minVersion) < 0) {
                return UpgradeCheckResponse.builder()
                        .hasUpdate(true).forceUpdate(false)
                        .releaseType(com.workmate.server.enums.ReleaseType.valueOf(releaseType))
                        .latestVersion(targetVersion).downloadUrl(null)
                        .releaseNotes(activeStrategy.getReleaseNotes())
                        .minVersion(minVersion)
                        .hint("当前版本过低，请先升级到 " + minVersion)
                        .build();
            }
        } else if ("ROLLBACK".equals(releaseType)) {
            if (currentCmp <= 0) {
                log.debug("升级检测：当前版本不高于回退目标, currentVersion={}, targetVersion={}", currentVersion, targetVersion);
                return noUpdate;
            }
        }

        return UpgradeCheckResponse.builder()
                .hasUpdate(true).forceUpdate(false)
                .releaseType(com.workmate.server.enums.ReleaseType.valueOf(releaseType))
                .latestVersion(targetVersion)
                .downloadUrl(activeStrategy.getDownloadUrl())
                .releaseNotes(activeStrategy.getReleaseNotes())
                .minVersion(activeStrategy.getMinVersion())
                .hint("ROLLBACK".equals(releaseType) ? "当前版本将回退到 " + targetVersion : null)
                .build();
    }

    @Transactional
    public UpgradeRelease createRelease(UpgradeReleaseRequest request) {
        releaseMapper.deactivateByPlatform(request.getPlatform());

        UpgradeRelease release = UpgradeRelease.builder()
                .version(request.getVersion())
                .releaseType(request.getReleaseType().name())
                .releaseNotes(request.getReleaseNotes())
                .downloadUrl(request.getDownloadUrl())
                .platform(request.getPlatform())
                .arch(request.getArch())
                .packageType(request.getPackageType())
                .fileName(request.getFileName())
                .fileSize(request.getFileSize())
                .sha256(request.getSha256())
                .minVersion(request.getMinVersion())
                .isActive(true)
                .publishedAt(LocalDateTime.now())
                .build();

        releaseMapper.insert(release);
        return release;
    }

    @Transactional
    public UpgradeRelease rollbackRelease(String platform, String targetVersion) {
        UpgradeRelease targetRelease = releaseMapper
                .findFirstByPlatformAndVersion(platform, targetVersion)
                .orElseThrow(() -> new RuntimeException("版本 " + targetVersion + " (" + platform + ") 不存在"));

        whitelistMapper.deleteByPlatformWithStrategy(platform);
        releaseMapper.deactivateByPlatform(platform);

        targetRelease.setIsActive(true);
        releaseMapper.update(targetRelease);
        return targetRelease;
    }

    @Transactional(readOnly = true)
    public PaginatedData<List<UpgradeRelease>> listReleases(int page, int pageSize, String platform) {
        PageHelper.startPage(page, pageSize);
        List<UpgradeRelease> list;
        if (platform != null && !platform.isEmpty()) {
            list = releaseMapper.findByPlatform(platform);
        } else {
            list = releaseMapper.findAll();
        }
        long total = releaseMapper.count(platform);
        return PaginatedData.of(list, total, page, pageSize);
    }
}
