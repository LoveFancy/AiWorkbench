import React from 'react'
import { Card, Statistic } from 'antd'

interface StatCardProps {
  title: string
  value: number | string
  suffix?: React.ReactNode
  prefix?: React.ReactNode
  precision?: number
  loading?: boolean
  valueStyle?: React.CSSProperties
}

export default function StatCard({
  title,
  value,
  suffix,
  prefix,
  precision,
  loading,
  valueStyle,
}: StatCardProps) {
  return (
    <Card loading={loading} style={{ height: '100%' }}>
      <Statistic
        title={title}
        value={value}
        suffix={suffix}
        prefix={prefix}
        precision={precision}
        valueStyle={valueStyle}
      />
    </Card>
  )
}