#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量创建 STORY 命令
从CSV文件批量创建STORY，并将生成的story编号回写到CSV中
"""

import argparse
import sys
import csv
import os
import io
from typing import List, Dict, Any, Optional

# 设置标准输出编码为UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from .api_client import create_client


def read_csv_file(csv_file_path: str) -> tuple[List[Dict[str, str]], List[bool]]:
    """读取CSV文件，返回字典列表和是否需要创建的标志列表"""
    stories = []
    need_create_flags = []  # True表示需要创建，False表示已存在

    try:
        with open(csv_file_path, 'r', encoding='utf-8-sig') as f:  # utf-8-sig处理BOM
            # 使用csv.reader读取，处理可能的空格
            reader = csv.reader(f)
            headers = [header.strip() for header in next(reader)]  # 第一行是表头

            # 验证必需字段
            required_fields = ['story名称', 'story描述', '经办人工号', '创建人工号']
            missing_fields = [field for field in required_fields if field not in headers]
            if missing_fields:
                raise ValueError(f"CSV文件缺少必需字段: {missing_fields}")

            # 检查是否有story_key列
            has_story_key = 'story_key' in headers
            story_key_index = headers.index('story_key') if has_story_key else -1

            for row_num, row in enumerate(reader, start=2):  # 从第2行开始（数据行）
                if len(row) == 0 or all(cell.strip() == '' for cell in row):
                    continue  # 跳过空行

                # 确保行长度与表头一致
                if len(row) < len(headers):
                    # 填充缺失的列为空字符串
                    row.extend([''] * (len(headers) - len(row)))
                elif len(row) > len(headers):
                    # 截断多余的列
                    row = row[:len(headers)]

                # 构建story字典
                story = {}
                for i, header in enumerate(headers):
                    story[header] = row[i].strip() if i < len(row) else ''

                # 验证必需字段不为空
                missing_values = []
                for field in required_fields:
                    if not story.get(field):
                        missing_values.append(f"{field}（第{row_num}行）")

                if missing_values:
                    print(f"[WARN] 第{row_num}行缺少值: {', '.join(missing_values)}")
                    continue

                # 判断是否需要创建
                need_create = True  # 默认需要创建

                if has_story_key and story_key_index < len(row):
                    story_key_value = row[story_key_index].strip()
                    # 如果story_key有有效值（不是<>、空值或占位符），则不需要创建
                    if story_key_value and story_key_value != '<>' and story_key_value != '<story_key>':
                        need_create = False
                        print(f"[INFO] 第{row_num}行已有story_key: {story_key_value}，跳过创建")

                stories.append(story)
                need_create_flags.append(need_create)

    except FileNotFoundError:
        raise FileNotFoundError(f"CSV文件不存在: {csv_file_path}")
    except Exception as e:
        raise Exception(f"读取CSV文件失败: {e}")

    return stories, need_create_flags


def map_csv_to_api(story: Dict[str, str], project_key: str, priority: str) -> Dict[str, Any]:
    """将CSV字段映射到API字段"""
    api_data = {
        "projectkey": project_key,
        "name": story.get('story名称', ''),
        "priorityLevel": priority,
        "description": story.get('story描述', ''),
        "reporter": story.get('创建人工号', ''),
        "assignee": story.get('经办人工号', '')
    }

    # 可选字段映射
    field_mappings = {
        '所属完整迭代名': 'iterationname',
        '所属需求编号': 'reqcode',
        '计划开发完成日期': 'plandevend',
        '计划测试完成日期': 'plantestend',
        '计划完成日期': 'planend'
    }

    for csv_field, api_field in field_mappings.items():
        if csv_field in story and story[csv_field]:
            api_data[api_field] = story[csv_field]

    return api_data


def write_story_keys_back(csv_file_path: str, stories: List[Dict[str, str]],
                         story_keys: List[str], need_create_flags: List[bool]) -> str:
    """将生成的story编号写回CSV文件"""
    if len(stories) != len(story_keys) or len(stories) != len(need_create_flags):
        raise ValueError(f"数据不匹配: stories({len(stories)}), story_keys({len(story_keys)}), flags({len(need_create_flags)})")

    # 创建新文件路径（在原文件名后添加_timestamp）
    import time
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    base_name, ext = os.path.splitext(csv_file_path)
    output_file = f"{base_name}_processed_{timestamp}{ext}"

    try:
        with open(csv_file_path, 'r', encoding='utf-8-sig') as infile:
            reader = csv.reader(infile)
            rows = list(reader)

        # 找到story_key列的索引
        headers = rows[0]
        if 'story_key' not in headers:
            # 如果没有story_key列，添加到表头
            headers.append('story_key')
            for i in range(1, len(rows)):
                if i-1 < len(story_keys):
                    rows[i].append(story_keys[i-1])
                else:
                    rows[i].append('')
        else:
            # 更新现有的story_key列
            key_index = headers.index('story_key')
            for i in range(1, len(rows)):
                if i-1 < len(story_keys) and i-1 < len(need_create_flags):
                    # 只有需要创建的行才更新story_key
                    if need_create_flags[i-1]:
                        if key_index < len(rows[i]):
                            rows[i][key_index] = story_keys[i-1]
                        else:
                            # 如果行长度不够，扩展到key_index
                            while len(rows[i]) <= key_index:
                                rows[i].append('')
                            rows[i][key_index] = story_keys[i-1]
                    # 对于跳过创建的行，保持原值不变

        # 写入新文件
        with open(output_file, 'w', newline='', encoding='utf-8') as outfile:
            writer = csv.writer(outfile)
            writer.writerows(rows)

        return output_file

    except Exception as e:
        raise Exception(f"写回CSV文件失败: {e}")


def main(args=None):
    """批量创建STORY主函数"""
    parser = argparse.ArgumentParser(
        prog="batch-create-story",
        description="从CSV文件批量创建STORY，并将生成的story编号回写到CSV中",
        epilog="示例: run.py batch-create-story --csv-file story_list.csv --project-key TEST0408 --priority \"高(一般)\""
    )

    # 必需参数
    parser.add_argument("--csv-file", required=True, help="CSV文件路径")
    parser.add_argument("--project-key", required=True, help="项目空间key")

    # 可选参数
    parser.add_argument("--priority",
                       choices=["紧急(致命)", "极高(严重)", "高(一般)", "中(轻微)", "低(改善)"],
                       default="高(一般)",
                       help="优先级，默认为'高(一般)'")

    # 特殊参数
    parser.add_argument("--mock", action="store_true", help="Mock模式，不实际调用API")
    parser.add_argument("--dry-run", action="store_true",
                       help="干运行模式，只解析CSV不实际创建，用于测试CSV格式")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    print("=" * 60)
    print("批量创建 STORY")
    print("=" * 60)
    print(f"CSV文件: {opts.csv_file}")
    print(f"项目空间: {opts.project_key}")
    print(f"优先级: {opts.priority}")
    print(f"模式: {'Mock' if opts.mock else 'Dry-run' if opts.dry_run else '实际创建'}")
    print("-" * 60)

    try:
        # 1. 读取CSV文件
        print("📖 读取CSV文件...")
        stories, need_create_flags = read_csv_file(opts.csv_file)
        print(f"✅ 成功读取 {len(stories)} 条STORY记录")

        # 统计需要创建的数量
        need_create_count = sum(need_create_flags)
        skip_count = len(stories) - need_create_count
        if skip_count > 0:
            print(f"📊 其中 {skip_count} 条已有story_key，将跳过创建")

        if opts.dry_run:
            print("\n📋 CSV解析结果（干运行模式）:")
            for i, story in enumerate(stories, 1):
                print(f"\n第{i}条STORY:")
                print(f"  名称: {story.get('story名称')}")
                print(f"  描述: {story.get('story描述', '')[:50]}...")
                print(f"  经办人: {story.get('经办人工号')}")
                print(f"  创建人: {story.get('创建人工号')}")
                if story.get('所属需求编号'):
                    print(f"  所属需求: {story.get('所属需求编号')}")
            print("\n✅ 干运行完成，CSV格式正确")
            return

        # 2. 创建STORY
        print("\n🚀 开始创建STORY...")
        client = create_client() if not opts.mock else None
        story_keys = []
        success_count = 0
        fail_count = 0

        for i, (story, need_create) in enumerate(zip(stories, need_create_flags), 1):
            story_name = story.get('story名称')
            print(f"\n处理第{i}/{len(stories)}条STORY: {story_name}")

            # 检查是否需要创建
            if not need_create:
                # 从CSV中获取已有的story_key
                existing_key = story.get('story_key', '')
                story_keys.append(existing_key)
                print(f"  [SKIP] 已有story_key: {existing_key}，跳过创建")
                continue

            # 映射字段
            api_data = map_csv_to_api(story, opts.project_key, opts.priority)

            if opts.mock:
                # Mock模式
                mock_key = f"MOCK-STORY-{i:03d}"
                story_keys.append(mock_key)
                success_count += 1
                print(f"  [OK] [Mock] 创建成功: {mock_key}")
                continue

            try:
                # 实际调用API
                result = client.create_story(api_data)

                if result.get("code") == "0":
                    data = result.get("resultData", {})
                    story_key = data.get("code", f"UNKNOWN-{i}")
                    story_keys.append(story_key)
                    success_count += 1
                    print(f"  [OK] 创建成功: {story_key}")
                else:
                    error_msg = result.get("msg", "未知错误")
                    story_keys.append("")  # 失败时留空
                    fail_count += 1
                    print(f"  [ERROR] 创建失败: {error_msg}")

            except Exception as e:
                story_keys.append("")  # 失败时留空
                fail_count += 1
                print(f"  [ERROR] 创建失败: {e}")

        # 3. 统计结果
        print("\n" + "=" * 60)
        print("📊 批量创建结果统计")
        print("=" * 60)
        print(f"总记录数: {len(stories)}")
        print(f"成功数: {success_count}")
        print(f"失败数: {fail_count}")

        if success_count > 0 and not opts.mock:
            # 4. 写回CSV文件
            print("\n💾 将生成的story编号写回CSV文件...")
            try:
                output_file = write_story_keys_back(opts.csv_file, stories, story_keys, need_create_flags)
                print(f"✅ 结果已保存到: {output_file}")

                # 显示创建成功的story列表
                print("\n📋 创建的STORY列表:")
                for i, (story, key) in enumerate(zip(stories, story_keys), 1):
                    if key:  # 只显示成功的
                        print(f"  {i}. {story.get('story名称')} → {key}")

            except Exception as e:
                print(f"❌ 写回CSV文件失败: {e}")
                print("\n📋 生成的story编号（请手动记录）:")
                for i, (story, key) in enumerate(zip(stories, story_keys), 1):
                    if key:
                        print(f"  {i}. {story.get('story名称')}: {key}")

        print("\n" + "=" * 60)
        print("批量创建完成")

        if fail_count > 0:
            print(f"⚠️  注意: 有 {fail_count} 条记录创建失败")
            sys.exit(1)

    except Exception as e:
        print(f"\n❌ 批量创建失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()