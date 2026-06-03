import React, { useEffect, useState } from 'react'
import {
  Tabs,
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
  Card,
  Badge,
  InputNumber,
  Switch,
} from 'antd'
import { PlusOutlined, RollbackOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  fetchReleases,
  createRelease,
  rollbackRelease,
  fetchUpgradeWhitelist,
  addUpgradeWhitelistRule,
  removeUpgradeWhitelistRule,
  toggleUpgradeWhitelistRule,
  type UpgradeRelease,
  type UpgradeWhitelistRule,
} from '../api/upgrade.api'
import {
  fetchStrategies,
  fetchStrategyDetail,
  createStrategy,
  activateStrategy,
  advanceStrategyStage,
  pauseStrategy,
  resumeStrategy,
  finishStrategy,
  type UpgradeStrategy,
  type StrategyDetail,
} from '../api/strategy.api'

const platformOptions = [
  { label: 'Windows', value: 'win32' },
  { label: 'macOS', value: 'darwin' },
  { label: 'Linux', value: 'linux' },
]

const ruleTypeOptions = [
  { label: '列表 (工号逗号分隔)', value: 'list' },
  { label: '范围 (区间)', value: 'range' },
  { label: '前缀 (通配)', value: 'prefix' },
  { label: '后缀 (通配)', value: 'suffix' },
]

interface StageInput {
  name: string
  rules: Array<{ ruleType: string; ruleValue: string }>
}

export default function UpgradeManagementPage() {
  const { message } = App.useApp()
  const [activeTab, setActiveTab] = useState('releases')
  const [releases, setReleases] = useState<UpgradeRelease[]>([])
  const [releasesTotal, setReleasesTotal] = useState(0)
  const [releaseLoading, setReleaseLoading] = useState(false)
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [releaseForm] = Form.useForm()

  const [rollbackModalOpen, setRollbackModalOpen] = useState(false)
  const [rollbackForm] = Form.useForm()

  const [whitelist, setWhitelist] = useState<UpgradeWhitelistRule[]>([])
  const [whitelistTotal, setWhitelistTotal] = useState(0)
  const [whitelistLoading, setWhitelistLoading] = useState(false)
  const [whitelistModalOpen, setWhitelistModalOpen] = useState(false)
  const [whitelistForm] = Form.useForm()

  const [strategies, setStrategies] = useState<UpgradeStrategy[]>([])
  const [strategiesTotal, setStrategiesTotal] = useState(0)
  const [strategyModalOpen, setStrategyModalOpen] = useState(false)
  const [strategySubmitting, setStrategySubmitting] = useState(false)
  const [strategyForm] = Form.useForm()
  const [strategyStages, setStrategyStages] = useState<StageInput[]>([
    { name: '第一阶段', rules: [{ ruleType: 'list', ruleValue: '' }] },
  ])
  const [strategyDetail, setStrategyDetail] = useState<StrategyDetail | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 })

  useEffect(() => {
    if (activeTab === 'releases') loadReleases()
    else if (activeTab === 'whitelist') loadWhitelist()
    else if (activeTab === 'strategies') loadStrategies()
  }, [activeTab, pagination.page])

  async function loadReleases() {
    setReleaseLoading(true)
    try {
      const res = await fetchReleases({ page: pagination.page, pageSize: pagination.pageSize })
      setReleases(res.data.releases)
      setReleasesTotal(res.data.total)
    } catch (err: any) {
      message.error(err.message)
    }
    setReleaseLoading(false)
  }

  async function loadWhitelist() {
    setWhitelistLoading(true)
    try {
      const res = await fetchUpgradeWhitelist({ page: pagination.page, pageSize: pagination.pageSize })
      setWhitelist(res.data.rules)
      setWhitelistTotal(res.data.total)
    } catch (err: any) {
      message.error(err.message)
    }
    setWhitelistLoading(false)
  }

  async function loadStrategies() {
    try {
      const res = await fetchStrategies({ page: pagination.page, pageSize: pagination.pageSize })
      setStrategies(res.data.strategies)
      setStrategiesTotal(res.data.total)
    } catch (err: any) {
      message.error(err.message)
    }
  }

  async function handleCreateRelease() {
    try {
      const values = await releaseForm.validateFields()
      await createRelease(values)
      message.success('发布版本创建成功')
      setReleaseModalOpen(false)
      releaseForm.resetFields()
      loadReleases()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  async function handleRollback() {
    try {
      const values = await rollbackForm.validateFields()
      await rollbackRelease(values)
      message.success('回退成功')
      setRollbackModalOpen(false)
      rollbackForm.resetFields()
      loadReleases()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  async function handleAddWhitelist() {
    try {
      const values = await whitelistForm.validateFields()
      await addUpgradeWhitelistRule(values)
      message.success('白名单规则添加成功')
      setWhitelistModalOpen(false)
      whitelistForm.resetFields()
      loadWhitelist()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  async function handleToggleWhitelist(id: number, isActive: boolean) {
    try {
      await toggleUpgradeWhitelistRule(id, isActive)
      message.success(isActive ? '已启用' : '已禁用')
      loadWhitelist()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  async function handleDeleteWhitelist(id: number) {
    try {
      await removeUpgradeWhitelistRule(id)
      message.success('已删除')
      loadWhitelist()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  function handleAddStage() {
    const order = strategyStages.length + 1
    setStrategyStages([
      ...strategyStages,
      { name: `第${order}阶段`, rules: [{ ruleType: 'list', ruleValue: '' }] },
    ])
  }

  function handleRemoveStage(index: number) {
    if (strategyStages.length <= 1) return
    setStrategyStages(strategyStages.filter((_, i) => i !== index))
  }

  function handleStageNameChange(index: number, name: string) {
    const updated = [...strategyStages]
    updated[index] = { ...updated[index], name }
    setStrategyStages(updated)
  }

  function handleAddRule(stageIndex: number) {
    const updated = [...strategyStages]
    updated[stageIndex] = {
      ...updated[stageIndex],
      rules: [...updated[stageIndex].rules, { ruleType: 'list', ruleValue: '' }],
    }
    setStrategyStages(updated)
  }

  function handleRemoveRule(stageIndex: number, ruleIndex: number) {
    const updated = [...strategyStages]
    if (updated[stageIndex].rules.length <= 1) return
    updated[stageIndex] = {
      ...updated[stageIndex],
      rules: updated[stageIndex].rules.filter((_, i) => i !== ruleIndex),
    }
    setStrategyStages(updated)
  }

  function handleRuleChange(stageIndex: number, ruleIndex: number, field: string, value: string) {
    const updated = [...strategyStages]
    const rules = [...updated[stageIndex].rules]
    rules[ruleIndex] = { ...rules[ruleIndex], [field]: value }
    updated[stageIndex] = { ...updated[stageIndex], rules }
    setStrategyStages(updated)
  }

  async function handleCreateStrategy() {
    setStrategySubmitting(true)
    try {
      const values = await strategyForm.validateFields()
      await createStrategy({
        name: values.name,
        targetVersion: values.targetVersion,
        downloadUrl: values.downloadUrl,
        releaseNotes: values.releaseNotes,
        platform: values.platform,
        minVersion: values.minVersion,
        totalStages: strategyStages.length,
        soakTimeMinutes: values.soakTimeMinutes,
        autoPauseErrorRate: values.autoPauseErrorRate,
        autoPauseEnabled: values.autoPauseEnabled ?? false,
        stages: strategyStages,
      })
      message.success('策略创建成功')
      setStrategyModalOpen(false)
      strategyForm.resetFields()
      setStrategyStages([{ name: '第一阶段', rules: [{ ruleType: 'list', ruleValue: '' }] }])
      loadStrategies()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err.message)
    }
    setStrategySubmitting(false)
  }

  function openStrategyModal() {
    strategyForm.resetFields()
    setStrategyStages([{ name: '第一阶段', rules: [{ ruleType: 'list', ruleValue: '' }] }])
    setStrategyModalOpen(true)
  }

  async function handleStrategyAction(
    id: number,
    action: 'activate' | 'advance' | 'pause' | 'resume' | 'finish'
  ) {
    try {
      switch (action) {
        case 'activate':
          await activateStrategy(id)
          break
        case 'advance':
          await advanceStrategyStage(id)
          break
        case 'pause':
          await pauseStrategy(id)
          break
        case 'resume':
          await resumeStrategy(id)
          break
        case 'finish':
          await finishStrategy(id)
          break
      }
      message.success('操作成功')
      loadStrategies()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  async function handleViewStrategyDetail(id: number) {
    setDetailLoading(true)
    setDetailModalOpen(true)
    try {
      const res = await fetchStrategyDetail(id)
      setStrategyDetail(res.data)
    } catch (err: any) {
      message.error(err.message)
    }
    setDetailLoading(false)
  }

  const releaseColumns: ColumnsType<UpgradeRelease> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '版本', dataIndex: 'version', width: 100 },
    {
      title: '类型',
      dataIndex: 'releaseType',
      width: 100,
      render: (type: string) =>
        type === 'UPGRADE' ? (
          <Tag color="blue">升级</Tag>
        ) : (
          <Tag color="orange">回退</Tag>
        ),
    },
    { title: '平台', dataIndex: 'platform', width: 90 },
    { title: '最低版本', dataIndex: 'minVersion', width: 100 },
    {
      title: '状态',
      dataIndex: 'isActive',
      width: 80,
      render: (active: boolean) =>
        active ? <Badge status="processing" text="活跃" /> : <Badge status="default" text="非活跃" />,
    },
    { title: '发布时间', dataIndex: 'publishedAt', width: 180 },
  ]

  const whitelistColumns: ColumnsType<UpgradeWhitelistRule> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '类型',
      dataIndex: 'ruleType',
      width: 80,
      render: (type: string) => <Tag>{type}</Tag>,
    },
    { title: '规则值', dataIndex: 'ruleValue', width: 200 },
    { title: '目标版本', dataIndex: 'targetVersion', width: 100 },
    { title: '平台', dataIndex: 'platform', width: 90 },
    {
      title: '状态',
      dataIndex: 'isActive',
      width: 80,
      render: (active: boolean) =>
        active ? <Badge status="processing" text="启用" /> : <Badge status="default" text="禁用" />,
    },
    {
      title: '来源',
      dataIndex: 'sourceStrategyId',
      width: 100,
      render: (id: number | null) =>
        id ? <Tag color="purple">策略同步</Tag> : <Tag>手动添加</Tag>,
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            onClick={() => handleToggleWhitelist(record.id, !record.isActive)}
          >
            {record.isActive ? '禁用' : '启用'}
          </Button>
          <Popconfirm
            title="确定删除？"
            onConfirm={() => handleDeleteWhitelist(record.id)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const strategyColumns: ColumnsType<UpgradeStrategy> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '目标版本', dataIndex: 'targetVersion', width: 100 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          DRAFT: 'default',
          ACTIVE: 'processing',
          PAUSED: 'warning',
          FINISHED: 'success',
        }
        const labelMap: Record<string, string> = {
          DRAFT: '草稿',
          ACTIVE: '进行中',
          PAUSED: '已暂停',
          FINISHED: '已完成',
        }
        return <Badge status={colorMap[status] as any} text={labelMap[status]} />
      },
    },
    {
      title: '阶段',
      dataIndex: 'currentStage',
      width: 100,
      render: (stage: number, record: UpgradeStrategy) =>
        `${stage} / ${record.totalStages}`,
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 180 },
    {
      title: '操作',
      width: 300,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            onClick={() => handleViewStrategyDetail(record.id)}
          >
            详情
          </Button>
          {record.status === 'DRAFT' && (
            <Button
              size="small"
              type="primary"
              onClick={() => handleStrategyAction(record.id, 'activate')}
            >
              激活
            </Button>
          )}
          {record.status === 'ACTIVE' && (
            <>
              <Button
                size="small"
                onClick={() => handleStrategyAction(record.id, 'advance')}
              >
                推进
              </Button>
              <Button
                size="small"
                onClick={() => handleStrategyAction(record.id, 'pause')}
              >
                暂停
              </Button>
              <Button
                size="small"
                onClick={() => handleStrategyAction(record.id, 'finish')}
              >
                完成
              </Button>
            </>
          )}
          {record.status === 'PAUSED' && (
            <Button
              size="small"
              onClick={() => handleStrategyAction(record.id, 'resume')}
            >
              恢复
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const paginationConfig = {
    current: pagination.page,
    pageSize: pagination.pageSize,
    total: activeTab === 'releases' ? releasesTotal : activeTab === 'whitelist' ? whitelistTotal : strategiesTotal,
    onChange: (page: number) => setPagination((prev) => ({ ...prev, page })),
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>升级管理</h2>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'releases',
            label: '版本发布',
            children: (
              <div>
                <Space style={{ marginBottom: 16 }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setReleaseModalOpen(true)}
                  >
                    新建发布
                  </Button>
                  <Button
                    icon={<RollbackOutlined />}
                    onClick={() => setRollbackModalOpen(true)}
                  >
                    版本回退
                  </Button>
                </Space>
                <Table
                  columns={releaseColumns}
                  dataSource={releases}
                  rowKey="id"
                  loading={releaseLoading}
                  pagination={paginationConfig}
                  size="middle"
                />
              </div>
            ),
          },
          {
            key: 'whitelist',
            label: '白名单规则',
            children: (
              <div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  style={{ marginBottom: 16 }}
                  onClick={() => setWhitelistModalOpen(true)}
                >
                  添加规则
                </Button>
                <Table
                  columns={whitelistColumns}
                  dataSource={whitelist}
                  rowKey="id"
                  loading={whitelistLoading}
                  pagination={paginationConfig}
                  size="middle"
                />
              </div>
            ),
          },
          {
            key: 'strategies',
            label: '升级策略',
            children: (
              <div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  style={{ marginBottom: 16 }}
                  onClick={openStrategyModal}
                >
                  新建策略
                </Button>
                <Table
                  columns={strategyColumns}
                  dataSource={strategies}
                  rowKey="id"
                  pagination={paginationConfig}
                  size="middle"
                />
              </div>
            ),
          },
        ]}
      />

      {/* 新建发布 Modal */}
      <Modal
        title="新建发布"
        open={releaseModalOpen}
        onOk={handleCreateRelease}
        onCancel={() => setReleaseModalOpen(false)}
        destroyOnClose
      >
        <Form form={releaseForm} layout="vertical">
          <Form.Item name="version" label="版本号" rules={[{ required: true }]}>
            <Input placeholder="如 1.0.0" />
          </Form.Item>
          <Form.Item name="releaseType" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '升级', value: 'UPGRADE' },
                { label: '回退', value: 'ROLLBACK' },
              ]}
            />
          </Form.Item>
          <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
            <Select options={platformOptions} />
          </Form.Item>
          <Form.Item name="releaseNotes" label="发布说明" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="downloadUrl" label="下载地址" rules={[{ required: true }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="minVersion" label="最低升级版本（可选）">
            <Input placeholder="如 0.9.0" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 回退 Modal */}
      <Modal
        title="版本回退"
        open={rollbackModalOpen}
        onOk={handleRollback}
        onCancel={() => setRollbackModalOpen(false)}
        destroyOnClose
      >
        <Form form={rollbackForm} layout="vertical">
          <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
            <Select options={platformOptions} />
          </Form.Item>
          <Form.Item name="targetVersion" label="回退目标版本" rules={[{ required: true }]}>
            <Input placeholder="如 0.9.0" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加白名单 Modal */}
      <Modal
        title="添加白名单规则"
        open={whitelistModalOpen}
        onOk={handleAddWhitelist}
        onCancel={() => setWhitelistModalOpen(false)}
        destroyOnClose
      >
        <Form form={whitelistForm} layout="vertical">
          <Form.Item name="ruleType" label="规则类型" rules={[{ required: true }]}>
            <Select options={ruleTypeOptions} />
          </Form.Item>
          <Form.Item name="ruleValue" label="规则值" rules={[{ required: true }]}>
            <Input placeholder="如 022480 或 022* 或 022480-023480" />
          </Form.Item>
          <Form.Item name="targetVersion" label="目标版本（可选）">
            <Input placeholder="如 1.0.0" />
          </Form.Item>
          <Form.Item name="platform" label="平台（可选）">
            <Select options={platformOptions} allowClear />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建策略 Modal */}
      <Modal
        title="新建升级策略"
        open={strategyModalOpen}
        onOk={handleCreateStrategy}
        onCancel={() => setStrategyModalOpen(false)}
        confirmLoading={strategySubmitting}
        width={720}
        destroyOnClose
      >
        <Form form={strategyForm} layout="vertical" initialValues={{ autoPauseEnabled: false }}>
          <Form.Item name="name" label="策略名称" rules={[{ required: true, message: '请输入策略名称' }]}>
            <Input placeholder="如 灰度升级 v1.2.0" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="targetVersion" label="目标版本" rules={[{ required: true }]}>
              <Input placeholder="如 1.2.0" />
            </Form.Item>
            <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
              <Select options={platformOptions} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="downloadUrl" label="下载地址" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="releaseNotes" label="发布说明">
            <Input.TextArea rows={2} placeholder="可选的发布说明" />
          </Form.Item>
          <Form.Item name="minVersion" label="最低升级版本">
            <Input placeholder="如 0.9.0，低于此版本不可升级" />
          </Form.Item>

          <Card
            size="small"
            title="高级设置"
            style={{ marginBottom: 16 }}
            styles={{ body: { paddingBottom: 0 } }}
          >
            <Space size="large">
              <Form.Item name="soakTimeMinutes" label="浸泡时间（分钟）">
                <InputNumber min={0} placeholder="阶段最短停留时间" style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="autoPauseErrorRate" label="自动暂停错误率">
                <InputNumber min={0} max={1} step={0.01} placeholder="如 0.05" style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="autoPauseEnabled" label="启用自动暂停" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>
          </Card>

          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>升级阶段</strong>
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={handleAddStage}>
              添加阶段
            </Button>
          </div>

          {strategyStages.map((stage, stageIndex) => (
            <Card
              key={stageIndex}
              size="small"
              style={{ marginBottom: 12 }}
              styles={{ body: { padding: 12 } }}
              title={
                <Space>
                  <span>阶段 {stageIndex + 1}</span>
                  <Input
                    size="small"
                    style={{ width: 160 }}
                    placeholder="阶段名称"
                    value={stage.name}
                    onChange={(e) => handleStageNameChange(stageIndex, e.target.value)}
                  />
                </Space>
              }
              extra={
                strategyStages.length > 1 && (
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveStage(stageIndex)}
                  />
                )
              }
            >
              {stage.rules.map((rule, ruleIndex) => (
                <Space key={ruleIndex} style={{ display: 'flex', marginBottom: 8 }} align="start">
                  <Select
                    style={{ width: 140 }}
                    value={rule.ruleType}
                    onChange={(val) => handleRuleChange(stageIndex, ruleIndex, 'ruleType', val)}
                    options={ruleTypeOptions}
                  />
                  <Input
                    style={{ width: 280 }}
                    placeholder="规则值，如 022480 或 022*"
                    value={rule.ruleValue}
                    onChange={(e) => handleRuleChange(stageIndex, ruleIndex, 'ruleValue', e.target.value)}
                  />
                  {stage.rules.length > 1 && (
                    <Button
                      icon={<DeleteOutlined />}
                      size="small"
                      danger
                      onClick={() => handleRemoveRule(stageIndex, ruleIndex)}
                    />
                  )}
                </Space>
              ))}
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => handleAddRule(stageIndex)}
                style={{ marginTop: 4 }}
              >
                添加规则
              </Button>
            </Card>
          ))}
        </Form>
      </Modal>

      {/* 策略详情 Modal */}
      <Modal
        title="策略详情"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={800}
        loading={detailLoading}
      >
        {strategyDetail && (
          <div>
            <p>
              <strong>名称：</strong>
              {strategyDetail.name}
            </p>
            <p>
              <strong>状态：</strong>
              {strategyDetail.status}
            </p>
            <p>
              <strong>阶段进度：</strong>
              {strategyDetail.currentStage} / {strategyDetail.totalStages}
            </p>
            <h4 style={{ marginTop: 16 }}>阶段列表</h4>
            {strategyDetail.stages.map((stage) => (
              <Card
                key={stage.id}
                size="small"
                title={`阶段 ${stage.stageOrder}: ${stage.name}`}
                style={{ marginBottom: 8 }}
              >
                <p>
                  <strong>规则：</strong>
                </p>
                {stage.rules.map((rule) => (
                  <Tag key={rule.id} style={{ marginBottom: 4 }}>
                    {rule.ruleType}: {rule.ruleValue}
                  </Tag>
                ))}
                {stage.advancedAt && (
                  <p>
                    <strong>激活时间：</strong>
                    {stage.advancedAt}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}