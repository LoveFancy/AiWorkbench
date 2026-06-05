package com.workmate.server.interceptor;

import com.workmate.server.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

@Slf4j
@Component
@RequiredArgsConstructor
public class UserIdInterceptor implements HandlerInterceptor {

    private final AppProperties appProperties;

    private static final String HEADER_NAME = "x-eipgw-userid";
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128;
    private static final int IV_LENGTH = 12;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // Skip for OPTIONS (CORS preflight)
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String encrypted = request.getHeader(HEADER_NAME);

        if (encrypted == null || encrypted.isEmpty()) {
            if (!appProperties.isRequireUserId()) {
                request.setAttribute("jobId", appProperties.getDefaultUserId());
                log.debug("用户身份校验已关闭，使用默认用户: {}", appProperties.getDefaultUserId());
                return true;
            }
            response.setStatus(403);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":403,\"message\":\"缺少用户身份信息\",\"timestamp\":" + System.currentTimeMillis() + "}");
            return false;
        }

        try {
            String jobId = decryptJobId(encrypted);
            request.setAttribute("jobId", jobId);
            return true;
        } catch (Exception e) {
            if (!appProperties.isRequireUserId()) {
                request.setAttribute("jobId", appProperties.getDefaultUserId());
                log.debug("用户身份解密失败，使用默认用户: {}", appProperties.getDefaultUserId());
                return true;
            }
            log.error("解密用户身份失败", e);
            response.setStatus(403);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":403,\"message\":\"用户身份验证失败\",\"timestamp\":" + System.currentTimeMillis() + "}");
            return false;
        }
    }

    private String decryptJobId(String encryptedBase64) throws Exception {
        String keyHex = appProperties.getUserIdEncryptionKey();
        if (keyHex == null || keyHex.isEmpty()) {
            throw new IllegalStateException("USER_ID_ENCRYPTION_KEY 未配置");
        }

        byte[] keyBytes = hexToBytes(keyHex);
        if (keyBytes.length != 16) {
            throw new IllegalStateException("USER_ID_ENCRYPTION_KEY 必须为16字节 Hex 字符串");
        }

        byte[] combined = Base64.getDecoder().decode(encryptedBase64);
        byte[] iv = new byte[IV_LENGTH];
        System.arraycopy(combined, 0, iv, 0, IV_LENGTH);

        byte[] authTag = new byte[16];
        System.arraycopy(combined, combined.length - 16, authTag, 0, 16);

        byte[] ciphertext = new byte[combined.length - IV_LENGTH - 16];
        System.arraycopy(combined, IV_LENGTH, ciphertext, 0, ciphertext.length);

        // AES-GCM: Java expects ciphertext + authTag concatenated
        byte[] ciphertextWithTag = new byte[ciphertext.length + authTag.length];
        System.arraycopy(ciphertext, 0, ciphertextWithTag, 0, ciphertext.length);
        System.arraycopy(authTag, 0, ciphertextWithTag, ciphertext.length, authTag.length);

        SecretKeySpec secretKey = new SecretKeySpec(keyBytes, "AES");
        Cipher cipher = Cipher.getInstance(ALGORITHM);
        GCMParameterSpec gcmSpec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
        cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec);

        byte[] decrypted = cipher.doFinal(ciphertextWithTag);
        return new String(decrypted, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                    + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }
}
