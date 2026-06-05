package com.workmate.server.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpgradeRelease {

    private Integer id;
    private String version;
    private String releaseType;
    private String releaseNotes;
    private String downloadUrl;
    private String platform;
    private String minVersion;
    private Boolean isActive;
    private LocalDateTime publishedAt;
}
