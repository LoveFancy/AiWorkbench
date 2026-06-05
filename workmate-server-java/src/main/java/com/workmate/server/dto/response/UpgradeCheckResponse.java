package com.workmate.server.dto.response;

import com.workmate.server.enums.ReleaseType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpgradeCheckResponse {

    private boolean hasUpdate;
    private boolean forceUpdate;
    private ReleaseType releaseType;
    private String latestVersion;
    private String downloadUrl;
    private String releaseNotes;
    private String minVersion;
    private String hint;

    public static UpgradeCheckResponse noUpdate() {
        return UpgradeCheckResponse.builder()
                .hasUpdate(false)
                .forceUpdate(false)
                .build();
    }
}
