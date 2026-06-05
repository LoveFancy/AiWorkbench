package com.workmate.server.service;

import com.workmate.server.dto.response.DashboardStats;
import com.workmate.server.dto.response.PaginatedData;
import com.workmate.server.entity.AdminWhitelist;
import com.workmate.server.mapper.AdminWhitelistMapper;
import com.workmate.server.mapper.ObservabilityEventMapper;
import com.workmate.server.mapper.UpgradeStrategyMapper;
import com.github.pagehelper.PageHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AdminService {

    private final AdminWhitelistMapper adminWhitelistMapper;
    private final ObservabilityEventMapper eventMapper;
    private final UpgradeStrategyMapper strategyMapper;

    public DashboardStats getDashboardStats() {
        long totalEvents = eventMapper.count();
        long errorEvents = eventMapper.countByEventType("error");
        long activeStrategies = strategyMapper.countByStatus("ACTIVE");
        long activeReleases = 0; // simplified
        long totalUsers = eventMapper.countDistinctUserId();

        return DashboardStats.builder()
                .totalEvents(totalEvents)
                .errorEvents(errorEvents)
                .errorRate(totalEvents > 0 ? (double) errorEvents / totalEvents : 0)
                .activeStrategies(activeStrategies)
                .activeReleases(activeReleases)
                .totalUsers(totalUsers)
                .build();
    }

    @Transactional
    public AdminWhitelist addAdminWhitelistRule(String ruleType, String ruleValue, String remark) {
        AdminWhitelist rule = AdminWhitelist.builder()
                .ruleType(ruleType).ruleValue(ruleValue).remark(remark)
                .isActive(true).createdAt(java.time.LocalDateTime.now())
                .build();
        adminWhitelistMapper.insert(rule);
        return rule;
    }

    @Transactional
    public void removeAdminWhitelistRule(Integer id) {
        adminWhitelistMapper.deleteById(id);
    }

    @Transactional
    public AdminWhitelist updateAdminWhitelistStatus(Integer id, Boolean isActive) {
        AdminWhitelist rule = adminWhitelistMapper.findById(id);
        if (rule == null) throw new RuntimeException("白名单规则不存在");
        rule.setIsActive(isActive);
        adminWhitelistMapper.update(rule);
        return rule;
    }

    @Transactional(readOnly = true)
    public PaginatedData<List<AdminWhitelist>> listAdminWhitelistRules(int page, int pageSize) {
        PageHelper.startPage(page, pageSize);
        List<AdminWhitelist> list = adminWhitelistMapper.findAll();
        long total = adminWhitelistMapper.count();
        return PaginatedData.of(list, total, page, pageSize);
    }
}
