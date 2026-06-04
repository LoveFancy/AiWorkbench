package com.workmate.server.mapper;

import com.workmate.server.entity.AdminWhitelist;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AdminWhitelistMapper {

    List<AdminWhitelist> findByIsActiveTrue();

    int insert(AdminWhitelist rule);

    void deleteById(@Param("id") Integer id);

    AdminWhitelist findById(@Param("id") Integer id);

    int update(AdminWhitelist rule);

    List<AdminWhitelist> findAll();

    long count();
}
