package com.workmate.server.interceptor;

import com.workmate.server.config.AppProperties;
import com.workmate.server.entity.AdminWhitelist;
import com.workmate.server.mapper.AdminWhitelistMapper;
import com.workmate.server.util.WhitelistMatcher;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
@Component
@RequiredArgsConstructor
public class AdminWhitelistInterceptor implements HandlerInterceptor {

    private final AdminWhitelistMapper adminWhitelistMapper;
    private final AppProperties appProperties;

    private final AtomicReference<List<WhitelistMatcher.WhitelistRule>> cachedRules = new AtomicReference<>(List.of());
    private volatile long lastCacheTime = 0;
    private static final long CACHE_TTL_MS = 60_000;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        if (!appProperties.isRequireUserId()) {
            return true;
        }

        String jobId = (String) request.getAttribute("jobId");
        if (jobId == null || jobId.isEmpty()) {
            response.setStatus(403);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":403,\"message\":\"缺少用户身份信息\",\"timestamp\":" + System.currentTimeMillis() + "}");
            return false;
        }

        List<WhitelistMatcher.WhitelistRule> rules = getAdminWhitelistRules();
        if (rules.isEmpty()) {
            response.setStatus(403);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":403,\"message\":\"未配置管理员白名单\",\"timestamp\":" + System.currentTimeMillis() + "}");
            return false;
        }

        if (WhitelistMatcher.matchAnyRule(jobId, rules)) {
            return true;
        }

        log.warn("非管理员用户尝试访问管理台: {}", jobId);
        response.setStatus(403);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":403,\"message\":\"无权限访问管理后台\",\"timestamp\":" + System.currentTimeMillis() + "}");
        return false;
    }

    private List<WhitelistMatcher.WhitelistRule> getAdminWhitelistRules() {
        long now = System.currentTimeMillis();
        if (now - lastCacheTime < CACHE_TTL_MS && !cachedRules.get().isEmpty()) {
            return cachedRules.get();
        }

        List<AdminWhitelist> entities = adminWhitelistMapper.findByIsActiveTrue();
        List<WhitelistMatcher.WhitelistRule> rules = entities.stream()
                .map(e -> new WhitelistMatcher.WhitelistRule(e.getRuleType(), e.getRuleValue()))
                .toList();

        cachedRules.set(rules);
        lastCacheTime = now;
        return rules;
    }
}
