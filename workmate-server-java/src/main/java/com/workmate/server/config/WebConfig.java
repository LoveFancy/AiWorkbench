package com.workmate.server.config;

import java.io.IOException;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import com.workmate.server.interceptor.UserIdInterceptor;
import com.workmate.server.interceptor.AdminWhitelistInterceptor;
import com.workmate.server.interceptor.RequestLoggingInterceptor;

import lombok.RequiredArgsConstructor;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final UserIdInterceptor userIdInterceptor;
    private final AdminWhitelistInterceptor adminWhitelistInterceptor;
    private final RequestLoggingInterceptor requestLoggingInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(requestLoggingInterceptor)
                .addPathPatterns("/workmate/**");

        registry.addInterceptor(userIdInterceptor)
                .addPathPatterns("/workmate/**")
                .excludePathPatterns("/workmate/health", "/workmate/admin/**");

        registry.addInterceptor(adminWhitelistInterceptor)
                .addPathPatterns("/workmate/console/**");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 管理台前端 SPA：未匹配的路径回退到 index.html
        registry.addResourceHandler("/workmate/admin/**")
                .addResourceLocations("classpath:/static/admin/", "file:./public/admin/")
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource resource = location.createRelative(resourcePath);
                        if (resource.exists() && resource.isReadable()) {
                            return resource;
                        }
                        // SPA fallback
                        Resource fallback = location.createRelative("index.html");
                        if (fallback.exists() && fallback.isReadable()) {
                            return fallback;
                        }
                        return null;
                    }
                });
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // WorkMate 业务接口
        registry.addMapping("/workmate/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);

        // EIP 网关模拟接口（开发环境）
        registry.addMapping("/gateway/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
