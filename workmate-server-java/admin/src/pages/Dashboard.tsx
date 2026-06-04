import React, { useEffect, useState } from 'react'
import { Row, Col, App } from 'antd'
import {
  DashboardOutlined,
  BugOutlined,
  RocketOutlined,
  TeamOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons'
import StatCard from '../components/StatCard'
import { fetchDashboardStats, type DashboardStats } from '../api/dashboard.api'

export default function DashboardPage() {
  const { message } = App.useApp()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      setLoading(true)
      const res = await fetchDashboardStats()
      setStats(res.data)
    } catch (err: any) {
      message.error(err.message ?? '加载失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>仪表盘</h2>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="总事件数"
            value={stats?.totalEvents ?? 0}
            prefix={<DashboardOutlined />}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="错误事件"
            value={stats?.errorEvents ?? 0}
            prefix={<BugOutlined />}
            loading={loading}
            valueStyle={{ color: stats && stats.errorRate > 0.05 ? '#cf1322' : undefined }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="错误率"
            value={stats ? (stats.errorRate * 100) : 0}
            suffix="%"
            precision={2}
            prefix={<BugOutlined />}
            loading={loading}
            valueStyle={{ color: stats && stats.errorRate > 0.05 ? '#cf1322' : '#3f8600' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="活跃用户数"
            value={stats?.totalUsers ?? 0}
            prefix={<TeamOutlined />}
            loading={loading}
          />
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="进行中策略"
            value={stats?.activeStrategies ?? 0}
            prefix={<RocketOutlined />}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="活跃发布版本"
            value={stats?.activeReleases ?? 0}
            prefix={<CloudUploadOutlined />}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title="总事件数"
            value={stats?.totalEvents ?? 0}
            prefix={<DashboardOutlined />}
            loading={loading}
          />
        </Col>
      </Row>
    </div>
  )
}