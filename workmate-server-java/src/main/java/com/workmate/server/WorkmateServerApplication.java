package com.workmate.server;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

@SpringBootApplication
@EnableScheduling
@EnableTransactionManagement
@MapperScan("com.workmate.server.mapper")
public class WorkmateServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(WorkmateServerApplication.class, args);
    }
}
