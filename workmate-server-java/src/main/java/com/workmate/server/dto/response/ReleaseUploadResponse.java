package com.workmate.server.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReleaseUploadResponse {
    private String version;
    private String platform;
    private String arch;
    private String packageType;
    private String fileName;
    private Long fileSize;
    private String sha256;
    private String downloadUrl;
}
