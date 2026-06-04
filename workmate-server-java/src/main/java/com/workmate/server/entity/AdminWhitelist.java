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
public class AdminWhitelist {

    private Integer id;
    private String ruleType;
    private String ruleValue;
    private String remark;
    private Boolean isActive;
    private LocalDateTime createdAt;
}
