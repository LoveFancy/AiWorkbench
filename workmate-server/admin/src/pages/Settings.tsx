import React, { useEffect, useState } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Popconfirm,
  App,
  Badge,
  Card,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  fetchAdminWhitelist,
  addAdminWhitelistRule,
  removeAdminWhitelistRule,
  toggleAdminWhitelistRule,
  type AdminWhitelistRule,
} from '../api/whitelist.api'

const ruleTypeOptions = [
  { label: '列表 (工号逗号分隔)', value: 'list' },
  { label: '范围 (区间)', value: 'range' },
  { label: '前缀 (通配)', value: 'prefix' },
  { label: '后缀 (通配)', value: 'suffix' },
]

export default function SettingsPage() {
  const { message } = App.useApp()
  const [rules, setRules] = useState<AdminWhitelistRule[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 })

  useEffect(() => {
    loadRules()
  }, [pagination.page])

  async function loadRules() {
    setLoading(true)
    try {
      const res = await fetchAdminWhitelist({ page: pagination.page, pageSize: pagination.pageSize })
      setRules(res.data.rules)
      setTotal(res.data.total)
    } catch (err: any) {
      message.error(err.message)
    }
    setLoading(false)
  }

  async function handleAdd() {
    try {
      const values = await form.validateFields()
      await addAdminWhitelistRule(values)
      message.success('管理员白名单添加成功')
      setModalOpen(false)
      form.resetFields()
      loadRules()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  async function handleToggle(id: number, isActive: boolean) {
    try {
      await toggleAdminWhitelistRule(id, isActive)
      message.success(isActive ? '已启用' : '已禁用')
      loadRules()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  async function handleDelete(id: number) {
    try {
      await removeAdminWhitelistRule(id)
      message.success('已删除')
      loadRules()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const columns: ColumnsType<AdminWhitelistRule> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '类型',
      dataIndex: 'ruleType',
      width: 80,
      render: (type: string) => <Tag>{type}</Tag>,
    },
    { title: '规则值', dataIndex: 'ruleValue', width: 200 },
    { title: '备注', dataIndex: 'remark', width: 200 },
    {
      title: '状态',
      dataIndex: 'isActive',
      width: 80,
      render: (active: boolean) =>
        active ? <Badge status="processing" text="启用" /> : <Badge status="default" text="禁用" />,
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 180 },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            onClick={() => handleToggle(record.id, !record.isActive)}
          >
            {record.isActive ? '禁用' : '启用'}
          </Button>
          <Popconfirm
            title="确定删除？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>权限设置</h2>

      <Card
        title="管理台访问白名单"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
          >
            添加规则
          </Button>
        }
      >
        <p style={{ color: '#999', marginBottom: 16 }}>
          配置哪些工号可以访问管理后台。支持列表、范围、前缀、后缀四种匹配规则。
        </p>
        <Table
          columns={columns}
          dataSource={rules}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total,
            onChange: (page) => setPagination((prev) => ({ ...prev, page })),
          }}
        />
      </Card>

      <Modal
        title="添加管理员白名单"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ruleType" label="规则类型" rules={[{ required: true }]}>
            <Select options={ruleTypeOptions} />
          </Form.Item>
          <Form.Item name="ruleValue" label="规则值" rules={[{ required: true }]}>
            <Input placeholder="如 022480 或 022* 或 022480-023480" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input placeholder="可选，便于识别" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}