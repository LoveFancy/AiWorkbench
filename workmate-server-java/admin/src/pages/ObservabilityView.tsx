import React, { useEffect, useState } from 'react'
import {
  Table,
  Select,
  DatePicker,
  Space,
  Tag,
  App,
  Card,
  Row,
  Col,
  Input,
  Button,
} from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  fetchEvents,
  fetchEventStats,
  type ObservabilityEvent,
  type EventStats,
} from '../api/observability.api'

const { RangePicker } = DatePicker

const eventTypeOptions = [
  { label: '全部', value: '' },
  { label: '用户登录', value: 'user_login' },
  { label: '用户登出', value: 'user_logout' },
  { label: 'Chat 提问', value: 'chat_question' },
  { label: 'Agent 提问', value: 'agent_question' },
  { label: '升级检测', value: 'upgrade_check' },
  { label: '客户端错误', value: 'error' },
]

const eventTypeColorMap: Record<string, string> = {
  user_login: 'green',
  user_logout: 'orange',
  chat_question: 'blue',
  agent_question: 'purple',
  upgrade_check: 'cyan',
  error: 'red',
}

const eventTypeLabelMap: Record<string, string> = {
  user_login: '用户登录',
  user_logout: '用户登出',
  chat_question: 'Chat 提问',
  agent_question: 'Agent 提问',
  upgrade_check: '升级检测',
  error: '客户端错误',
}

export default function ObservabilityViewPage() {
  const { message } = App.useApp()
  const [events, setEvents] = useState<ObservabilityEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<EventStats | null>(null)
  const [filters, setFilters] = useState({
    eventType: '',
    userId: '',
    startDate: '',
    endDate: '',
    errorFingerprint: '',
  })
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 })

  useEffect(() => {
    loadEvents()
    loadStats()
  }, [pagination.page, filters.eventType])

  async function loadEvents() {
    setLoading(true)
    try {
      const params: any = {
        page: pagination.page,
        pageSize: pagination.pageSize,
      }
      if (filters.eventType) params.eventType = filters.eventType
      if (filters.userId) params.userId = filters.userId
      if (filters.startDate) params.startDate = filters.startDate
      if (filters.endDate) params.endDate = filters.endDate
      if (filters.errorFingerprint) params.errorFingerprint = filters.errorFingerprint

      const res = await fetchEvents(params)
      setEvents(res.data.events)
      setTotal(res.data.total)
    } catch (err: any) {
      message.error(err.message)
    }
    setLoading(false)
  }

  async function loadStats() {
    try {
      const res = await fetchEventStats({})
      setStats(res.data)
    } catch {
      // ignore
    }
  }

  function handleSearch() {
    setPagination((prev) => ({ ...prev, page: 1 }))
    loadEvents()
  }

  const columns: ColumnsType<ObservabilityEvent> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '事件ID',
      dataIndex: 'eventId',
      width: 100,
      ellipsis: true,
      render: (id: string | null) => id ?? '-',
    },
    {
      title: '类型',
      dataIndex: 'eventType',
      width: 100,
      render: (type: string) => (
        <Tag color={eventTypeColorMap[type] ?? 'default'}>
          {eventTypeLabelMap[type] ?? type}
        </Tag>
      ),
    },
    { title: '用户工号', dataIndex: 'userId', width: 100 },
    {
      title: '提问',
      dataIndex: 'question',
      width: 200,
      ellipsis: true,
      render: (q: string | null) => q ?? '-',
    },
    {
      title: '模型ID',
      dataIndex: 'modelId',
      width: 100,
      ellipsis: true,
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      width: 150,
      ellipsis: true,
      render: (msg: string | null) =>
        msg ? <span style={{ color: 'red' }}>{msg}</span> : '-',
    },
    {
      title: '错误指纹',
      dataIndex: 'errorFingerprint',
      width: 120,
      ellipsis: true,
      render: (fp: string | null) => fp ?? '-',
    },
    {
      title: '响应耗时',
      dataIndex: 'responseDurationMs',
      width: 100,
      render: (ms: number | null) => (ms != null ? `${ms}ms` : '-'),
    },
    { title: '客户端版本', dataIndex: 'clientVersion', width: 100 },
    { title: '平台', dataIndex: 'clientPlatform', width: 80 },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
    },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>观测数据</h2>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#999', fontSize: 12 }}>总事件数</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{stats.totalEvents}</div>
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#999', fontSize: 12 }}>错误事件</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#cf1322' }}>
                  {stats.errorEvents}
                </div>
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#999', fontSize: 12 }}>错误率</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  {(stats.errorRate * 100).toFixed(2)}%
                </div>
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#999', fontSize: 12 }}>高频错误</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  {stats.topErrors?.length ?? 0}
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选栏 */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          style={{ width: 140 }}
          placeholder="事件类型"
          allowClear
          options={eventTypeOptions}
          value={filters.eventType || undefined}
          onChange={(val) => setFilters((prev) => ({ ...prev, eventType: val ?? '' }))}
        />
        <Input
          style={{ width: 140 }}
          placeholder="用户工号"
          value={filters.userId}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, userId: e.target.value }))
          }
        />
        <Input
          style={{ width: 200 }}
          placeholder="错误指纹"
          value={filters.errorFingerprint}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, errorFingerprint: e.target.value }))
          }
        />
        <RangePicker
          onChange={(dates) => {
            if (dates) {
              setFilters((prev) => ({
                ...prev,
                startDate: dates[0]!.format('YYYY-MM-DD'),
                endDate: dates[1]!.format('YYYY-MM-DD'),
              }))
            } else {
              setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }))
            }
          }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          查询
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={events}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 1400 }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total,
          onChange: (page) => setPagination((prev) => ({ ...prev, page })),
        }}
      />
    </div>
  )
}