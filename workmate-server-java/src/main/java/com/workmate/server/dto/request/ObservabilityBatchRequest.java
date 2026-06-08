package com.workmate.server.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 批量上报请求体，与客户端 POST { events: [...] } 格式匹配。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ObservabilityBatchRequest {

    @NotEmpty(message = "events 不能为空")
    @Size(max = 50, message = "events 单次最多 50 条")
    @Valid
    private List<ObservabilityEventRequest> events;
}
