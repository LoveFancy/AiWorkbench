import React from 'react'
import { Layout, Menu, Typography } from 'antd'
import {
  DashboardOutlined,
  CloudUploadOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'

const { Sider, Content, Header } = Layout
const { Text } = Typography

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/upgrade', icon: <CloudUploadOutlined />, label: '升级管理' },
  { key: '/observability', icon: <BarChartOutlined />, label: '观测数据' },
  { key: '/settings', icon: <SettingOutlined />, label: '权限设置' },
]

function getSelectedKey(pathname: string): string {
  // 从最长匹配开始，避免 '/' 总是匹配所有路径
  const sorted = [...menuItems].sort((a, b) => b.key.length - a.key.length)
  for (const item of sorted) {
    if (pathname === item.key || pathname.startsWith(item.key + '/')) {
      return item.key
    }
  }
  return '/'
}

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = getSelectedKey(location.pathname)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        style={{
          background: 'linear-gradient(180deg, #001529 0%, #002140 100%)',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Text strong style={{ color: '#fff', fontSize: 18, letterSpacing: 2 }}>
            WorkMate
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderRight: 0, marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: '1px solid #f0f0f0',
            height: 56,
          }}
        >
          <Text type="secondary">WorkMate 伴行管理后台</Text>
        </Header>
        <Content
          style={{
            margin: 16,
            padding: 24,
            background: '#fff',
            borderRadius: 8,
            overflow: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}