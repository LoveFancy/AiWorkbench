package com.workmate.server.simulator;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/**
 * 模拟 EIP 网关的登录和 Token 生成接口，用于开发环境。
 * <p>
 * 客户端原本请求 {@code http://eip.htsc.com.cn/gateway}，开发时改为请求本服务即可。
 */
@Slf4j
@RestController
@CrossOrigin(origins = "*", allowCredentials = "false")
public class EipGatewaySimulatorController {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64_DECODER = Base64.getUrlDecoder();

    /** 短期 Token 有效期：4 小时 */
    private static final long SHORT_TTL_MS = 4 * 60 * 60 * 1000L;

    /**
     * Step 1 — EIP 网关登录。
     * <p>
     * 客户端请求：
     * <pre>
     * POST /gateway/login
     * {"username":"022480","password":"123123"}
     * </pre>
     * 模拟返回：HTTP 200 + Set-Cookie: EIPGW-TOKEN=&lt;jwt&gt;
     */
    @PostMapping("/gateway/login")
    public ResponseEntity<String> login(
            @RequestBody Map<String, String> body,
            HttpServletResponse response) {

        String username = body.getOrDefault("username", "test_user");
        String token = generateJwt(username, SHORT_TTL_MS);

        log.info("[EIP模拟] 登录请求 username={}, jobId={}", username, parseMidFromJwt(token));

        response.addHeader("Set-Cookie",
                "EIPGW-TOKEN=" + token + "; Path=/; HttpOnly");

        return ResponseEntity.ok("{}");
    }

    /**
     * Step 2 — 获取长期 Token。
     * <p>
     * 客户端请求：
     * <pre>
     * GET /gateway/manage/user/token/generate?days=365
     * Cookie: EIPGW-TOKEN=&lt;short_token&gt;
     * </pre>
     * 模拟返回：EIPGW-TOKEN:您的token为：&lt;long_term_jwt&gt;
     */
    @GetMapping("/gateway/manage/user/token/generate")
    public ResponseEntity<String> generateLongTermToken(
            @RequestParam(defaultValue = "365") int days,
            HttpServletRequest request) {

        // 从 Cookie 中获取短期 Token，解析出工号
        String jobId = extractJobIdFromCookie(request);

        long ttlMs = days * 24L * 60 * 60 * 1000;
        String token = generateJwt(jobId, ttlMs);

        log.info("[EIP模拟] 生成长期Token jobId={}, days={}", jobId, days);

        String body = "您的token为：" + token + ", 有效期 " + days + "天（可通过 ?days=" + days + " 传参）。请谨慎使用，token为您的个人令牌。若token泄露，您的隐私将会泄露。";
        return ResponseEntity.ok(body);
    }

    // ===== Token 生成 =====

    /**
     * 生成一个简易 JWT，payload 中包含 {@code mid}（工号）。
     */
    private String generateJwt(String jobId, long ttlMs) {
        long now = System.currentTimeMillis();
        long exp = now + ttlMs;

        String headerJson = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
        String payloadJson = "{\"mid\":\"" + jobId + "\",\"iat\":" + (now / 1000)
                + ",\"exp\":" + (exp / 1000) + ",\"jti\":\"" + UUID.randomUUID() + "\"}";

        String header = B64.encodeToString(headerJson.getBytes(StandardCharsets.UTF_8));
        String payload = B64.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
        // 签名部分用随机串填充，模拟器不需要验签
        String signature = B64.encodeToString(UUID.randomUUID().toString().getBytes(StandardCharsets.UTF_8));

        return header + "." + payload + "." + signature;
    }

    /**
     * 从 JWT payload 中解析出 {@code mid}（工号）。
     */
    private String parseMidFromJwt(String jwt) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) return "unknown";
            byte[] decoded = B64_DECODER.decode(parts[1]);
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = MAPPER.readValue(decoded, Map.class);
            Object mid = payload.get("mid");
            return mid != null ? mid.toString() : "unknown";
        } catch (Exception e) {
            return "unknown";
        }
    }

    /**
     * 从请求 Cookie 中提取 EIPGW-TOKEN 并解析出工号。
     */
    private String extractJobIdFromCookie(HttpServletRequest request) {
        // 优先从 Cookie header 解析
        String cookieHeader = request.getHeader("Cookie");
        if (cookieHeader != null) {
            for (String part : cookieHeader.split(";")) {
                part = part.trim();
                if (part.startsWith("EIPGW-TOKEN=")) {
                    String token = part.substring("EIPGW-TOKEN=".length());
                    if (!token.isEmpty()) {
                        return parseMidFromJwt(token);
                    }
                }
            }
        }
        return "test_user";
    }
}
