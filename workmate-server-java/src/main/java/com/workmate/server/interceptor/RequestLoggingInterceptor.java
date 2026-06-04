package com.workmate.server.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Slf4j
@Component
public class RequestLoggingInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute("startTime", System.currentTimeMillis());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        Long startTime = (Long) request.getAttribute("startTime");
        long duration = startTime != null ? System.currentTimeMillis() - startTime : 0;
        String logMessage = String.format("%s %s %d %dms", request.getMethod(), request.getRequestURI(), response.getStatus(), duration);

        if (response.getStatus() >= 500) {
            log.error(logMessage);
        } else if (response.getStatus() >= 400) {
            log.warn(logMessage);
        } else {
            log.info(logMessage);
        }
    }
}
