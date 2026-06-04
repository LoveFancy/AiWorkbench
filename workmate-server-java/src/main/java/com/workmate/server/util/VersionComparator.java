package com.workmate.server.util;

public class VersionComparator {

    public static int compare(String v1, String v2) {
        String[] parts1 = v1.split("\\.");
        String[] parts2 = v2.split("\\.");
        int length = Math.max(parts1.length, parts2.length);

        for (int i = 0; i < length; i++) {
            int a = i < parts1.length ? Integer.parseInt(parts1[i]) : 0;
            int b = i < parts2.length ? Integer.parseInt(parts2[i]) : 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    }
}
