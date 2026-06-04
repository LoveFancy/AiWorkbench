# ===== 阶段 1: 构建阶段 =====
FROM maven:3.9-eclipse-temurin-17-alpine AS builder

WORKDIR /app

# 先复制 pom.xml，利用 Docker 缓存层
COPY pom.xml .
RUN mvn dependency:go-offline -B

# 复制源码
COPY src/ ./src/

# 编译打包
RUN mvn package -DskipTests -B

# ===== 阶段 2: 运行阶段 =====
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# 从构建阶段复制 jar
COPY --from=builder /app/target/*.jar app.jar

# 管理台前端静态文件（需在宿主机先构建）
COPY admin/dist/ ./public/admin/

EXPOSE 6173

ENTRYPOINT ["java", "-jar", "app.jar"]
