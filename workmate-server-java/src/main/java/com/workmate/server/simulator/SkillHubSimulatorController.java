package com.workmate.server.simulator;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 模拟 SkillHub 的认证和技能市场接口，用于开发环境。
 * <p>
 * 客户端原本请求 {@code http://skillhub.uat.saas.htsc}，开发时改为请求本服务即可。
 */
@Slf4j
@RestController
@CrossOrigin(origins = "*", allowCredentials = "false")
public class SkillHubSimulatorController {

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64_DECODER = Base64.getUrlDecoder();

    // ===== Mock 数据 =====

    private static final List<Map<String, Object>> MOCK_SKILLS = List.of(
        buildSkill("@ht-skills/code-review", "代码审查助手",
            "自动审查代码质量，发现潜在的安全漏洞、代码坏味道和性能问题",
            "工具", List.of("AI", "审查", "代码"), "k0892142", "张三", "1.2.0", 1200,
            "# 代码审查助手\n\n自动审查代码质量，发现潜在的安全漏洞、代码坏味道和性能问题。\n\n## 功能\n\n- **安全审查** — 检测 SQL 注入、XSS、敏感信息泄露\n- **代码规范** — 检查命名规范、代码结构、注释完整性\n- **性能分析** — 识别 N+1 查询、内存泄漏\n\n## 使用方式\n\n在 Agent 对话中提及 `@code-review` 即可触发审查。",
            List.of(buildVersion("1.2.0", "新增 Go 语言支持，优化 Rust 审查规则", "2026-04-20T10:30:00"),
                    buildVersion("1.1.0", "支持自定义规则集", "2026-03-15T08:00:00"),
                    buildVersion("1.0.0", "初始版本，支持 JS/TS/Python", "2026-02-01T12:00:00"))),

        buildSkill("@ht-skills/web-search", "网络搜索技能",
            "将网络搜索能力集成到 Agent 中，支持多种搜索引擎",
            "AI", List.of("搜索", "联网"), "k0892142", "张三", "2.0.1", 3400,
            "# 网络搜索技能\n\n将网络搜索能力集成到 Agent 中。\n\n## 功能\n\n- 支持 Google、Bing 搜索\n- 支持搜索结果摘要\n- 支持 URL 抓取和内容提取",
            List.of(buildVersion("2.0.1", "修复搜索结果排序问题", "2026-05-10T14:00:00"),
                    buildVersion("2.0.0", "重构搜索引擎适配层", "2026-04-01T10:00:00"),
                    buildVersion("1.0.0", "初始版本", "2026-01-15T09:00:00"))),

        buildSkill("@ht-skills/pptx-creator", "PPT 创建助手",
            "快速生成精美的 PPT 演示文稿，支持多种模板和自定义样式",
            "文档", List.of("PPT", "演示"), "k021877", "周士奇", "1.5.0", 890,
            "# PPT 创建助手\n\n快速生成精美的 PPT 演示文稿。\n\n## 功能\n\n- 支持多种模板风格\n- 支持自定义配色和字体\n- 支持图片和图表插入",
            List.of(buildVersion("1.5.0", "新增 3 种模板", "2026-05-01T16:00:00"),
                    buildVersion("1.0.0", "初始版本", "2026-03-01T10:00:00"))),

        buildSkill("@ht-skills/xlsx-helper", "Excel 数据处理助手",
            "Excel 数据处理助手，支持公式计算、数据清洗和批量导出",
            "工具", List.of("Excel", "数据处理"), "k021877", "周士奇", "2.0.0", 2100,
            "# Excel 数据处理助手\n\nExcel 数据处理助手。\n\n## 功能\n\n- 公式计算\n- 数据清洗\n- 批量导出",
            List.of(buildVersion("2.0.0", "重构架构，性能提升 50%", "2026-06-01T08:00:00"),
                    buildVersion("1.2.0", "新增数据清洗功能", "2026-04-20T12:00:00"),
                    buildVersion("1.0.0", "初始版本", "2026-02-01T10:00:00"))),

        buildSkill("@ht-skills/drawio-skill", "Draw.io 图表工具",
            "使用 Draw.io 创建流程图、架构图和 UML 图表",
            "开发", List.of("图表", "架构", "UML"), "k0892142", "张三", "0.9.0", 560,
            "# Draw.io 图表工具\n\n使用 Draw.io 创建流程图。\n\n## 功能\n\n- 流程图\n- 架构图\n- UML 图表",
            List.of(buildVersion("0.9.0", "初始版本", "2026-04-15T09:00:00")))
    );

    // ===== 认证接口 =====

    /**
     * 签发 SkillHub Token（模拟）。
     * <p>
     * 客户端请求：
     * <pre>
     * POST /ai_skillhub_bff/api/v1/auth/token?clientId=proma
     * Cookie: EIPGW-TOKEN=&lt;jwt&gt;
     * </pre>
     */
    @PostMapping("/ai_skillhub_bff/api/v1/auth/token")
    public ResponseEntity<Map<String, Object>> issueToken(
            @RequestParam(defaultValue = "proma") String clientId,
            HttpServletRequest request) {

        String jobId = extractJobIdFromCookie(request);
        log.info("[SkillHub模拟] 签发Token clientId={}, jobId={}", clientId, jobId);

        String accessToken = "sk-mock-" + UUID.randomUUID().toString().substring(0, 8);
        long expiresIn = 7200; // 2 小时

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("accessToken", accessToken);
        response.put("tokenType", "Bearer");
        response.put("expiresIn", expiresIn);

        return ResponseEntity.ok(response);
    }

    // ===== Skill 列表查询 =====

    /**
     * 技能列表查询（模拟）。
     * <p>
     * 支持 keyword 模糊搜索、category 分类筛选。
     * <pre>
     * POST /ai_skillhub_service/api/v1/market/skills
     * Authorization: Bearer &lt;token&gt;
     * {"keyword":"搜索","category":"AI","env":"all","page":1,"pageSize":20,"sort":"updated","order":"desc"}
     * </pre>
     */
    @PostMapping("/ai_skillhub_service/api/v1/market/skills")
    public ResponseEntity<Map<String, Object>> listSkills(
            @RequestBody Map<String, Object> body) {

        String keyword = (String) body.getOrDefault("keyword", "");
        String category = (String) body.getOrDefault("category", "");
        String env = (String) body.getOrDefault("env", "all");

        log.info("[SkillHub模拟] 列表查询 keyword='{}', category='{}', env='{}'", keyword, category, env);

        List<Map<String, Object>> filtered = MOCK_SKILLS.stream()
            .filter(s -> {
                if (!keyword.isEmpty()) {
                    String skillName = (String) s.get("skillName");
                    String displayName = (String) s.get("displayName");
                    String desc = (String) s.get("description");
                    String kw = keyword.toLowerCase();
                    return (skillName != null && skillName.toLowerCase().contains(kw))
                        || (displayName != null && displayName.toLowerCase().contains(kw))
                        || (desc != null && desc.toLowerCase().contains(kw));
                }
                return true;
            })
            .filter(s -> {
                if (!category.isEmpty() && !category.isBlank()) {
                    String cat = (String) s.get("category");
                    return category.equals(cat);
                }
                return true;
            })
            .collect(Collectors.toList());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("code", "200");
        response.put("message", "操作成功");
        response.put("success", true);
        response.put("data", filtered);

        log.info("[SkillHub模拟] 返回 {} 个 Skill", filtered.size());
        return ResponseEntity.ok(response);
    }

    // ===== Skill 详情 =====

    /**
     * 获取技能详情（模拟）。
     * <pre>
     * GET /ai_skillhub_service/api/v1/market/skills/{name}
     * Authorization: Bearer &lt;token&gt;
     * </pre>
     */
    @GetMapping("/ai_skillhub_service/api/v1/market/skills/{name}")
    public ResponseEntity<Map<String, Object>> getSkillDetail(@PathVariable String name) {
        // URL 编码的 @ 会变成 %40，需要解码
        String decodedName = java.net.URLDecoder.decode(name, StandardCharsets.UTF_8);

        log.info("[SkillHub模拟] 获取详情 name='{}'", decodedName);

        Optional<Map<String, Object>> skill = MOCK_SKILLS.stream()
            .filter(s -> {
                String skillName = (String) s.get("skillName");
                return skillName != null && (
                    skillName.equals(decodedName)
                    || skillName.endsWith(decodedName)
                    || ((String) s.get("displayName")).equals(decodedName)
                );
            })
            .findFirst();

        Map<String, Object> response = new LinkedHashMap<>();
        if (skill.isPresent()) {
            response.put("code", "200");
            response.put("message", "操作成功");
            response.put("success", true);
            response.put("data", skill.get());
        } else {
            response.put("code", "404");
            response.put("message", "Skill 不存在");
            response.put("success", false);
            response.put("data", null);
        }

        return ResponseEntity.ok(response);
    }

    // ===== Skill 下载 =====

    /**
     * 按版本下载 Skill 包（模拟），返回 classpath 中的预打包 zip。
     */
    @PostMapping("/ai_skillhub_service/api/v1/skills/download/{name}/{version}")
    public ResponseEntity<org.springframework.core.io.Resource> downloadSkill(
            @PathVariable String name,
            @PathVariable String version) {

        String shortName = name.contains("/") ? name.substring(name.lastIndexOf('/') + 1) : name;
        String resourcePath = "skills/" + shortName + ".zip";

        org.springframework.core.io.Resource resource =
            new org.springframework.core.io.ClassPathResource(resourcePath);

        if (!resource.exists()) {
            log.warn("[SkillHub模拟] zip 不存在: {}", resourcePath);
            return ResponseEntity.notFound().build();
        }

        log.info("[SkillHub模拟] 下载 Skill name='{}' version='{}' -> {}", name, version, resourcePath);

        return ResponseEntity.ok()
            .header("Content-Disposition", "attachment; filename=\"" + shortName + "-" + version + ".zip\"")
            .contentType(org.springframework.http.MediaType.APPLICATION_OCTET_STREAM)
            .body(resource);
    }

    // ===== 工具方法 =====

    private static Map<String, Object> buildSkill(
            String skillName, String displayName, String description,
            String category, List<String> tags, String owner, String ownerName,
            String version, int downloadCount, String readme,
            List<Map<String, Object>> versions) {

        Map<String, Object> permission = new LinkedHashMap<>();
        permission.put("role", "0");
        permission.put("grantedAt", "2026-04-20T10:30:00");
        permission.put("grantedBy", owner);
        permission.put("grantedByName", ownerName);

        Map<String, Object> skill = new LinkedHashMap<>();
        skill.put("skillName", skillName);
        skill.put("displayName", displayName);
        skill.put("description", description);
        skill.put("category", category);
        skill.put("tags", tags);
        skill.put("owner", owner);
        skill.put("ownerName", ownerName);
        skill.put("version", version);
        skill.put("author", owner + "@htsc.com");
        skill.put("license", "MIT");
        skill.put("readme", readme);
        skill.put("dependencies", "{}");
        skill.put("envVars", "[]");
        skill.put("downloadCount", downloadCount);
        skill.put("lastUpdated", "2026-06-01T10:00:00");
        skill.put("versions", versions);
        skill.put("status", "published");
        skill.put("permission", permission);
        skill.put("permissionApplicationStatus", 0);
        skill.put("createdAt", "2026-04-01T10:00:00");
        skill.put("updatedAt", "2026-06-01T10:00:00");

        return skill;
    }

    private static Map<String, Object> buildVersion(String version, String description, String publishedAt) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("version", version);
        v.put("description", description);
        v.put("publishedAt", publishedAt);
        return v;
    }

    /**
     * 从请求 Cookie 中提取 EIPGW-TOKEN 并解析出工号。
     */
    private String extractJobIdFromCookie(HttpServletRequest request) {
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

    /**
     * 从 JWT payload 中解析出 {@code mid}（工号）。
     */
    @SuppressWarnings("unchecked")
    private String parseMidFromJwt(String jwt) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) return "unknown";
            byte[] decoded = B64_DECODER.decode(parts[1]);
            Map<String, Object> payload = new com.fasterxml.jackson.databind.ObjectMapper().readValue(decoded, Map.class);
            Object mid = payload.get("mid");
            return mid != null ? mid.toString() : "unknown";
        } catch (Exception e) {
            return "unknown";
        }
    }
}
