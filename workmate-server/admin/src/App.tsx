import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppLayout from './components/Layout'
import DashboardPage from './pages/Dashboard'
import UpgradeManagementPage from './pages/UpgradeManagement'
import ObservabilityViewPage from './pages/ObservabilityView'
import SettingsPage from './pages/Settings'

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <AppLayout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/upgrade" element={<UpgradeManagementPage />} />
            <Route path="/observability" element={<ObservabilityViewPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppLayout>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}