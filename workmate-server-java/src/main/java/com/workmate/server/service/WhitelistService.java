package com.workmate.server.service;

import com.workmate.server.dto.response.PaginatedData;
import com.workmate.server.entity.UpgradeWhitelist;
import com.workmate.server.mapper.UpgradeWhitelistMapper;
import com.workmate.server.util.WhitelistMatcher;
import com.github.pagehelper.PageHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class WhitelistService {

    private final UpgradeWhitelistMapper whitelistMapper;

    public List<WhitelistMatcher.WhitelistRule> getActiveWhitelistRules(String platform, String targetVersion) {
        List<UpgradeWhitelist> entities;
        if (platform != null && !platform.isEmpty()) {
            entities = whitelistMapper.findActiveByPlatform(platform);
        } else {
            entities = whitelistMapper.findByIsActiveTrue();
        }

        return entities.stream()
                .map(e -> new WhitelistMatcher.WhitelistRule(e.getRuleType(), e.getRuleValue()))
                .toList();
    }

    @Transactional
    public UpgradeWhitelist addWhitelistRule(String ruleType, String ruleValue,
                                              String targetVersion, String platform,
                                              Integer sourceStrategyId) {
        UpgradeWhitelist rule = UpgradeWhitelist.builder()
                .ruleType(ruleType).ruleValue(ruleValue)
                .targetVersion(targetVersion).platform(platform)
                .sourceStrategyId(sourceStrategyId)
                .isActive(true).createdAt(java.time.LocalDateTime.now())
                .build();
        whitelistMapper.insert(rule);
        return rule;
    }

    @Transactional
    public void removeWhitelistRule(Integer id) {
        whitelistMapper.deleteById(id);
    }

    @Transactional
    public UpgradeWhitelist updateWhitelistRuleStatus(Integer id, Boolean isActive) {
        UpgradeWhitelist rule = whitelistMapper.findById(id);
        if (rule == null) throw new RuntimeException("白名单规则不存在");
        rule.setIsActive(isActive);
        whitelistMapper.update(rule);
        return rule;
    }

    @Transactional(readOnly = true)
    public PaginatedData<List<UpgradeWhitelist>> listWhitelistRules(int page, int pageSize,
                                                                      String platform, String targetVersion) {
        PageHelper.startPage(page, pageSize);
        List<UpgradeWhitelist> list;
        if (platform != null && !platform.isEmpty() && targetVersion != null && !targetVersion.isEmpty()) {
            list = whitelistMapper.findByPlatformAndTargetVersion(platform, targetVersion);
        } else if (platform != null && !platform.isEmpty()) {
            list = whitelistMapper.findByPlatform(platform);
        } else if (targetVersion != null && !targetVersion.isEmpty()) {
            list = whitelistMapper.findByTargetVersion(targetVersion);
        } else {
            list = whitelistMapper.findByIsActiveTrue();
        }
        return PaginatedData.of(list, list.size(), page, pageSize);
    }
}
