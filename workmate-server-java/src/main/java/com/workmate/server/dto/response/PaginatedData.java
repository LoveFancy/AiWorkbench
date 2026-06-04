package com.workmate.server.dto.response;

public record PaginatedData<T>(
        T items,
        long total,
        int page,
        int pageSize,
        int totalPages
) {
    public static <T> PaginatedData<T> of(T items, long total, int page, int pageSize) {
        return new PaginatedData<>(items, total, page, pageSize,
                (int) Math.ceil((double) total / pageSize));
    }
}
