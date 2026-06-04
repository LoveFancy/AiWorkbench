package com.workmate.server.util;

import java.util.List;

public class WhitelistMatcher {

    public static boolean matchAnyRule(String jobId, List<WhitelistRule> rules) {
        return rules.stream().anyMatch(rule -> matchRule(jobId, rule));
    }

    private static boolean matchRule(String jobId, WhitelistRule rule) {
        return switch (rule.getRuleType()) {
            case "list" -> {
                String[] ids = rule.getRuleValue().split(",");
                for (String id : ids) {
                    if (id.trim().equals(jobId)) {
                        yield true;
                    }
                }
                yield false;
            }
            case "range" -> {
                String[] parts = rule.getRuleValue().split("-");
                if (parts.length == 2) {
                    String start = parts[0].trim();
                    String end = parts[1].trim();
                    yield jobId.compareTo(start) >= 0 && jobId.compareTo(end) <= 0;
                }
                yield false;
            }
            case "prefix" -> {
                String prefix = rule.getRuleValue().replaceAll("\\*$", "");
                yield jobId.startsWith(prefix);
            }
            case "suffix" -> {
                String suffix = rule.getRuleValue().replaceAll("^\\*", "");
                yield jobId.endsWith(suffix);
            }
            default -> false;
        };
    }

    public record WhitelistRule(String ruleType, String ruleValue) {
        public String getRuleType() { return ruleType; }
        public String getRuleValue() { return ruleValue; }
    }
}
