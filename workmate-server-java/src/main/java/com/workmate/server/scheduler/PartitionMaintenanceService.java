package com.workmate.server.scheduler;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * 分区自动维护定时任务。
 * <p>
 * - observability_errors：确保未来 12 个月分区存在（每月 1 日补建，提前兜底）
 * - observability_events：确保未来 6 年分区存在（每年补建）
 * <p>
 * 通过查询 information_schema.partitions 判断已有分区，
 * 仅对缺失分区执行 REORGANIZE PARTITION p_max INTO (...)。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartitionMaintenanceService {

    private final JdbcTemplate jdbc;

    /**
     * 每月 1 日 03:00 执行。
     */
    @Scheduled(cron = "0 0 3 1 * ?")
    public void maintainPartitions() {
        maintainErrorPartitions();
        maintainEventPartitions();
    }

    // ==================== 异常表：确保未来 12 个月分区 ====================

    private void maintainErrorPartitions() {
        try {
            List<String> existing = getExistingPartitions("observability_errors");
            YearMonth current = YearMonth.now();

            for (int i = 0; i < 12; i++) {
                YearMonth ym = current.plusMonths(i);
                String partitionName = String.format("p_%d%02d", ym.getYear(), ym.getMonthValue());
                if (existing.contains(partitionName)) continue;

                String nextMonth = ym.plusMonths(1).toString() + "-01";
                String sql = String.format(
                        "ALTER TABLE observability_errors REORGANIZE PARTITION p_max INTO ("
                                + "PARTITION %s VALUES LESS THAN (TO_DAYS('%s')),"
                                + "PARTITION p_max VALUES LESS THAN MAXVALUE)",
                        partitionName, nextMonth);

                log.info("创建异常表分区: {}", partitionName);
                executePartitionDdl(sql, partitionName);
                break;
            }
        } catch (Exception e) {
            log.error("异常表分区维护失败", e);
        }
    }

    // ==================== 业务表：确保未来 6 年分区 ====================

    private void maintainEventPartitions() {
        try {
            List<String> existing = getExistingPartitions("observability_events");
            int currentYear = LocalDate.now().getYear();

            for (int y = currentYear; y <= currentYear + 5; y++) {
                String partitionName = "p_" + y;
                if (existing.contains(partitionName)) continue;

                String sql = String.format(
                        "ALTER TABLE observability_events REORGANIZE PARTITION p_max INTO ("
                                + "PARTITION %s VALUES LESS THAN (%d),"
                                + "PARTITION p_max VALUES LESS THAN MAXVALUE)",
                        partitionName, y + 1);

                log.info("创建业务表分区: {}", partitionName);
                executePartitionDdl(sql, partitionName);
                break;
            }
        } catch (Exception e) {
            log.error("业务表分区维护失败", e);
        }
    }

    // ==================== 工具方法 ====================

    private List<String> getExistingPartitions(String tableName) {
        return jdbc.query(
                "SELECT PARTITION_NAME FROM information_schema.partitions "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND PARTITION_NAME IS NOT NULL",
                (rs, rowNum) -> rs.getString("PARTITION_NAME"),
                tableName);
    }

    /**
     * 执行分区 DDL，遇到 "Duplicate partition" (MySQL errno 1517) 视为幂等跳过。
     */
    private void executePartitionDdl(String sql, String partitionName) {
        try {
            jdbc.update(sql);
        } catch (DuplicateKeyException e) {
            log.warn("分区 {} 已存在（并发创建），跳过", partitionName);
        }
    }
}
