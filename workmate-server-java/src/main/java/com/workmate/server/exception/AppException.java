package com.workmate.server.exception;

import lombok.Getter;

@Getter
public class AppException extends RuntimeException {

    private final int statusCode;
    private final int code;

    public AppException(int statusCode, String message) {
        super(message);
        this.statusCode = statusCode;
        this.code = statusCode;
    }

    public AppException(int statusCode, String message, int code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }

    public static AppException badRequest(String message) {
        return new AppException(400, message);
    }

    public static AppException forbidden(String message) {
        return new AppException(403, message);
    }

    public static AppException notFound(String message) {
        return new AppException(404, message);
    }
}
