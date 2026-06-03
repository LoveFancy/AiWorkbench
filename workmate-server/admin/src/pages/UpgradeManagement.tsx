import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Tabs, Table, Button, Modal, Form, Input, Select, Tag, Space,
  App, Badge, InputNumber, Switch, Card,
} from 'antd'
import { PlusOutlined, DeleteOutlined, EyeOutlined, RollbackOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  fetchReleases, createRelease, rollbackRelease,
  fetchUpgradeWhitelist,
  type UpgradeRelease, type UpgradeWhitelistRule,
} from '../api/upgrade.api'
import {
  fetchStrategies, fetchStrategyDetail, createStrategy,
  activateStrategy, advanceStrategyStage, pauseStrategy, resumeStrategy, finishStrategy,
  type UpgradeStrategy, type StrategyDetail,
  editStrategyStages,
} from '../api/strategy.api'

// ==================== 常量 ====================

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

const rulePlaceholders: Record<string, string> = {
  list: '工号列表，逗号分隔，如 022480,021220',
  range: '工号区间，如 022480-023480',
  prefix: '前缀匹配，如 022*',
  suffix: '后缀匹配，如 *022',
}

const TAB_KEYS = { RELEASES: 'releases', STRATEGIES: 'strategies' } as const

// ==================== 版本管理 Tab ====================

function ReleasesTab() {
  const { message } = App.useApp()
  const [data, setData] = useState<UpgradeRelease[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchReleases({ page, pageSize: 20 })
      setData(res.data.releases)
      setTotal(res.data.total)
    } catch (err: any) { message.error(err.message) }
    setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      await createRelease({ ...values, releaseType: 'UPGRADE' })
      message.success('版本发布成功')
      setModalOpen(false); form.resetFields(); load()
    } catch (err: any) { if (err?.errorFields) return; message.error(err.message) }
  }

  const columns: ColumnsType<UpgradeRelease> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '版本号', dataIndex: 'version', width: 120 },
    { title: '平台', dataIndex: 'platform', width: 80 },
    { title: '最低升级版本', dataIndex: 'minVersion', width: 130, render: (v: string|null) => v || '-' },
    {
      title: '状态', dataIndex: 'isActive', width: 70,
      render: (a: boolean) => a ? <Badge status="processing" text="活跃" /> : <Badge status="default" text="-" />,
    },
    { title: '下载地址', dataIndex: 'downloadUrl', ellipsis: true, width: 220 },
    { title: '发布时间', dataIndex: 'publishedAt', width: 170 },
  ]

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true) }} style={{ marginBottom: 16 }}>
        新建发布
      </Button>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage }} size="middle" />

      <Modal title="新建版本发布" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} destroyOnClose width={520}>
        <Form form={form} layout="vertical" initialValues={{ releaseType: 'UPGRADE' }}>
          <Form.Item name="version" label="版本号" rules={[{ required: true }]}>
            <Input placeholder="如 1.2.0" />
          </Form.Item>
          <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
            <Select options={platformOptions} placeholder="选择平台" />
          </Form.Item>
          <Form.Item name="downloadUrl" label="下载地址" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="releaseNotes" label="发布说明">
            <Input.TextArea rows={3} placeholder="此版本的更新内容" />
          </Form.Item>
          <Form.Item name="minVersion" label="最低升级版本" tooltip="低于此版本的客户端不可直接升级">
            <Input placeholder="如 0.9.0（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ==================== 升级策略 Tab ====================

function StrategiesTab() {
  const { message } = App.useApp()
  const [data, setData] = useState<UpgradeStrategy[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const [allReleases, setAllReleases] = useState<UpgradeRelease[]>([])
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(null)
  const [stages, setStages] = useState<StageInput[]>([
    { name: '', rules: [{ ruleType: 'list', ruleValue: '' }] },
  ])

  // 详情弹窗
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<StrategyDetail | null>(null)
  const [detailRules, setDetailRules] = useState<UpgradeWhitelistRule[]>([])

  // 回退弹窗
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [rollbackStrategyId, setRollbackStrategyId] = useState<number | null>(null)
  const [rollbackTargetVersion, setRollbackTargetVersion] = useState<string | null>(null)
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false)

  // 编辑阶段弹窗
  const [editOpen, setEditOpen] = useState(false)
  const [editStrategyId, setEditStrategyId] = useState<number | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editStages, setEditStages] = useState<StageInput[]>([{ name: '', rules: [{ ruleType: 'list', ruleValue: '' }] }])

  const load = useCallback(async () => {
    try {
      const res = await fetchStrategies({ page, pageSize: 20 })
      setData(res.data.strategies)
      setTotal(res.data.total)
    } catch (err: any) { message.error(err.message) }
  }, [page])

  useEffect(() => { load() }, [load])

  /** 所有发布版本（供选择目标版本） */
  const upgradeReleases = useMemo(() =>
    allReleases.filter(r => r.releaseType === 'UPGRADE'),
  [allReleases])

  const openModal = async () => {
    form.resetFields()
    setSelectedReleaseId(null)
    setStages([{ name: '', rules: [{ ruleType: 'list', ruleValue: '' }] }])
    try {
      const res = await fetchReleases({ page: 1, pageSize: 100 })
      setAllReleases(res.data.releases)
    } catch { setAllReleases([]) }
    setModalOpen(true)
  }

  const handleVersionSelect = (releaseId: number) => {
    setSelectedReleaseId(releaseId)
    const r = allReleases.find(x => x.id === releaseId)
    if (r) {
      form.setFieldsValue({
        name: `v${r.version} 灰度升级`,
        targetVersion: r.version, downloadUrl: r.downloadUrl,
        releaseNotes: r.releaseNotes || '', platform: r.platform,
        minVersion: r.minVersion || '',
      })
    }
  }

  const handleCreate = async () => {
    setSubmitting(true)
    try {
      const values = await form.validateFields()
      // 用户阶段 + 自动追加一个全量阶段
      const allStages = [
        ...stages,
        { name: '全量放开', rules: [] }, // rules 为空 = 全量
      ]
      await createStrategy({
        name: values.name,
        targetVersion: values.targetVersion, downloadUrl: values.downloadUrl,
        releaseNotes: values.releaseNotes, platform: values.platform,
        minVersion: values.minVersion || undefined,
        totalStages: allStages.length,
        soakTimeMinutes: values.soakTimeMinutes,
        autoPauseErrorRate: values.autoPauseErrorRate,
        autoPauseEnabled: values.autoPauseEnabled ?? false,
        stages: allStages,
      })
      message.success('策略创建成功')
      setModalOpen(false); load()
    } catch (err: any) { if (err?.errorFields) return; message.error(err.message) }
    setSubmitting(false)
  }

  const handleAction = async (id: number, action: 'activate' | 'advance' | 'pause' | 'resume' | 'finish') => {
    try {
      const fn = { activate: activateStrategy, advance: advanceStrategyStage, pause: pauseStrategy, resume: resumeStrategy, finish: finishStrategy }[action]
      await fn(id)
      message.success('操作成功'); load()
    } catch (err: any) { message.error(err.message) }
  }

  // 打开回退弹窗
  const openRollbackModal = async (strategy: UpgradeStrategy) => {
    setRollbackStrategyId(strategy.id)
    setRollbackTargetVersion(null)
    // 加载该平台的历史版本（版本号 < 当前目标版本）
    try {
      const res = await fetchReleases({ page: 1, pageSize: 100 })
      setAllReleases(res.data.releases)
    } catch { setAllReleases([]) }
    setRollbackOpen(true)
  }

  // 打开编辑阶段弹窗
  const openEditModal = async (strategy: UpgradeStrategy) => {
    setEditStrategyId(strategy.id)
    setEditSubmitting(false)
    try {
      const res = await fetchStrategyDetail(strategy.id)
      // 构建编辑用的 stages（只包含非全量阶段，全量阶段自动追加）
      const userStages = res.data.stages
        .filter(s => s.rules.length > 0 || s.name !== '全量放开')
        .map(s => ({
          name: s.name,
          rules: s.rules.map(r => ({ ruleType: r.ruleType, ruleValue: r.ruleValue })),
        }))
      setEditStages(userStages.length > 0 ? userStages : [{ name: '', rules: [{ ruleType: 'list', ruleValue: '' }] }])
    } catch {
      setEditStages([{ name: '', rules: [{ ruleType: 'list', ruleValue: '' }] }])
    }
    setEditOpen(true)
  }

  const handleEditSubmit = async () => {
    if (!editStrategyId) return
    setEditSubmitting(true)
    try {
      const allStages = [...editStages, { name: '全量放开', rules: [] }]
      await editStrategyStages(editStrategyId, { stages: allStages, totalStages: allStages.length })
      message.success('阶段已更新')
      setEditOpen(false); load()
    } catch (err: any) { message.error(err.message) }
    setEditSubmitting(false)
  }

  // 可回退的版本：同平台、版本号 < 策略目标版本
  const rollbackableReleases = useMemo(() => {
    if (!rollbackStrategyId) return []
    const strategy = data.find(s => s.id === rollbackStrategyId)
    if (!strategy) return []
    return allReleases.filter(r =>
      r.platform === strategy.platform &&
      compareVersion(r.version, strategy.targetVersion) < 0
    )
  }, [allReleases, rollbackStrategyId, data])

  const handleRollback = async () => {
    if (!rollbackTargetVersion || !rollbackStrategyId) return
    setRollbackSubmitting(true)
    try {
      const strategy = data.find(s => s.id === rollbackStrategyId)!
      // 1. 先暂停/完成策略
      await finishStrategy(rollbackStrategyId).catch(() =>
        pauseStrategy(rollbackStrategyId)
      )
      // 2. 创建回退发布
      await rollbackRelease({ platform: strategy.platform, targetVersion: rollbackTargetVersion })
      message.success(`已回退到 ${rollbackTargetVersion}`)
      setRollbackOpen(false); load()
    } catch (err: any) { message.error(err.message) }
    setRollbackSubmitting(false)
  }

  const handleViewDetail = async (id: number) => {
    setDetailLoading(true); setDetailOpen(true)
    try {
      const [res, rules] = await Promise.all([
        fetchStrategyDetail(id),
        fetchUpgradeWhitelist({ page: 1, pageSize: 100 }).then(r => r.data.rules.filter(x => x.sourceStrategyId === id)),
      ])
      setDetail(res.data); setDetailRules(rules)
    } catch (err: any) { message.error(err.message) }
    setDetailLoading(false)
  }

  // ---- 阶段编辑（只编辑用户阶段，不含全量阶段）----
  const addStage = () => setStages([...stages, { name: '', rules: [{ ruleType: 'list', ruleValue: '' }] }])
  const removeStage = (i: number) => { if (stages.length > 1) setStages(stages.filter((_, idx) => idx !== i)) }
  const setStageName = (i: number, name: string) => { const u = [...stages]; u[i] = { ...u[i], name }; setStages(u) }
  const addRule = (si: number) => { const u = [...stages]; u[si] = { ...u[si], rules: [...u[si].rules, { ruleType: 'list', ruleValue: '' }] }; setStages(u) }
  const removeRule = (si: number, ri: number) => {
    if (stages[si].rules.length <= 1) return
    const u = [...stages]; u[si] = { ...u[si], rules: u[si].rules.filter((_, i) => i !== ri) }; setStages(u)
  }
  const setRule = (si: number, ri: number, field: string, val: string) => {
    const u = [...stages]; const rules = [...u[si].rules]; rules[ri] = { ...rules[ri], [field]: val }; u[si] = { ...u[si], rules }; setStages(u)
  }

  // ---- 编辑弹窗阶段操作 ----
  const editAddStage = () => setEditStages([...editStages, { name: '', rules: [{ ruleType: 'list', ruleValue: '' }] }])
  const editRemoveStage = (i: number) => { if (editStages.length > 1) setEditStages(editStages.filter((_, idx) => idx !== i)) }
  const editSetName = (i: number, name: string) => { const u = [...editStages]; u[i] = { ...u[i], name }; setEditStages(u) }
  const editAddRule = (si: number) => { const u = [...editStages]; u[si] = { ...u[si], rules: [...u[si].rules, { ruleType: 'list', ruleValue: '' }] }; setEditStages(u) }
  const editRemoveRule = (si: number, ri: number) => {
    if (editStages[si].rules.length <= 1) return
    const u = [...editStages]; u[si] = { ...u[si], rules: u[si].rules.filter((_, i) => i !== ri) }; setEditStages(u)
  }
  const editSetRule = (si: number, ri: number, field: string, val: string) => {
    const u = [...editStages]; const rules = [...u[si].rules]; rules[ri] = { ...rules[ri], [field]: val }; u[si] = { ...u[si], rules }; setEditStages(u)
  }

  // ---- 列定义 ----
  const statusColor: Record<string, string> = { DRAFT: 'default', ACTIVE: 'processing', PAUSED: 'warning', FINISHED: 'success' }
  const statusLabel: Record<string, string> = { DRAFT: '草稿', ACTIVE: '进行中', PAUSED: '已暂停', FINISHED: '已完成' }

  // 同一平台同一时间只能有一个激活策略
  const activePlatforms = useMemo(() => {
    const set = new Set<string>()
    data.filter(s => s.status === 'ACTIVE').forEach(s => set.add(s.platform))
    return set
  }, [data])

  const columns: ColumnsType<UpgradeStrategy> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '策略名称', dataIndex: 'name', width: 200 },
    { title: '目标版本', dataIndex: 'targetVersion', width: 100 },
    { title: '平台', dataIndex: 'platform', width: 80 },
    {
      title: '状态', width: 90,
      render: (_: any, r: UpgradeStrategy) => <Badge status={statusColor[r.status] as any} text={statusLabel[r.status] || r.status} />,
    },
    { title: '阶段', width: 80, render: (_: any, r: UpgradeStrategy) => `${r.currentStage} / ${r.totalStages}` },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 450,
      render: (_: any, r: UpgradeStrategy) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.id)}>详情</Button>
          {r.status === 'DRAFT' && <Button size="small" type="primary" onClick={() => handleAction(r.id, 'activate')} disabled={activePlatforms.has(r.platform)} title={activePlatforms.has(r.platform) ? '该平台已有激活策略' : ''}>激活</Button>}
          {r.status === 'ACTIVE' && <>
            <Button size="small" onClick={() => handleAction(r.id, 'advance')}>推进</Button>
            <Button size="small" onClick={() => handleAction(r.id, 'pause')}>暂停</Button>
            <Button size="small" onClick={() => handleAction(r.id, 'finish')}>完成</Button>
            <Button size="small" onClick={() => openEditModal(r)}>编辑阶段</Button>
          </>}
          {r.status === 'PAUSED' && <>
            <Button size="small" onClick={() => handleAction(r.id, 'resume')}>恢复</Button>
            <Button size="small" onClick={() => handleAction(r.id, 'finish')}>完成</Button>
            <Button size="small" onClick={() => openEditModal(r)}>编辑阶段</Button>
          </>}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={openModal} style={{ marginBottom: 16 }}>新建策略</Button>
      <Table columns={columns} dataSource={data} rowKey="id"
        pagination={{ current: page, pageSize: 20, total, onChange: setPage }} size="middle" />

      {/* ========== 新建策略 Modal ========== */}
      <Modal title="新建升级策略" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)}
        confirmLoading={submitting} width={760} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ autoPauseEnabled: false }}>
          <Form.Item name="name" label="策略名称" rules={[{ required: true }]}>
            <Input placeholder="如 v1.2.0 灰度升级" />
          </Form.Item>

          <Form.Item label="选择目标版本" tooltip="从版本管理中选择要升级到的版本">
            <Select placeholder="从版本管理中选择" value={selectedReleaseId} onChange={handleVersionSelect}
              options={upgradeReleases.map(r => ({
                label: `${r.version} (${r.platform})${r.isActive ? ' [活跃]' : ''}`,
                value: r.id,
              }))}
              allowClear />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="targetVersion" label="目标版本" rules={[{ required: true }]}>
              <Input placeholder="选择版本后自动填入" disabled={!!selectedReleaseId} />
            </Form.Item>
            <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
              <Select options={platformOptions} style={{ width: 120 }} disabled={!!selectedReleaseId} />
            </Form.Item>
          </Space>
          <Form.Item name="downloadUrl" label="下载地址" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="选择版本后自动填入" disabled={!!selectedReleaseId} />
          </Form.Item>
          <Form.Item name="releaseNotes" label="发布说明">
            <Input.TextArea rows={2} placeholder="选择版本后自动填入" disabled={!!selectedReleaseId} />
          </Form.Item>
          <Form.Item name="minVersion" label="最低升级版本">
            <Input placeholder="如 0.9.0，低于此版本不可直接升级" disabled={!!selectedReleaseId} />
          </Form.Item>

          <Card size="small" title="高级设置" style={{ marginBottom: 16 }}>
            <Space size="large" wrap>
              <Form.Item name="soakTimeMinutes" label="浸泡时间(分钟)" style={{ marginBottom: 0 }}>
                <InputNumber min={0} placeholder="阶段最短停留" style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="autoPauseErrorRate" label="自动暂停错误率" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={1} step={0.01} placeholder="如 0.05" style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="autoPauseEnabled" label="启用自动暂停" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch />
              </Form.Item>
            </Space>
          </Card>

          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>灰度阶段配置</strong>
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addStage}>添加阶段</Button>
          </div>
          <p style={{ color: '#999', fontSize: 12, marginBottom: 12 }}>以下配置的是灰度放量阶段。最后一个"全量放开"阶段将自动追加，无需配置白名单。</p>

          {stages.map((stage, si) => (
            <Card key={si} size="small" style={{ marginBottom: 12 }}
              title={<Space><span>阶段 {si + 1}</span><Input size="small" style={{ width: 160 }} placeholder="阶段名称" value={stage.name} onChange={e => setStageName(si, e.target.value)} /></Space>}
              extra={stages.length > 1 && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeStage(si)} />}>
              {stage.rules.map((rule, ri) => (
                <Space key={ri} style={{ display: 'flex', marginBottom: 8 }} align="start">
                  <Select style={{ width: 140 }} value={rule.ruleType} onChange={v => setRule(si, ri, 'ruleType', v)} options={ruleTypeOptions} />
                  <Input style={{ width: 280 }} placeholder={rulePlaceholders[rule.ruleType] || '规则值'} value={rule.ruleValue} onChange={e => setRule(si, ri, 'ruleValue', e.target.value)} />
                  {stage.rules.length > 1 && <Button icon={<DeleteOutlined />} size="small" danger onClick={() => removeRule(si, ri)} />}
                </Space>
              ))}
              <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => addRule(si)}>添加规则</Button>
            </Card>
          ))}

          {/* 全量阶段预览 */}
          <Card size="small" style={{ borderStyle: 'dashed', background: '#fafafa' }}
            title={<span style={{ color: '#52c41a' }}>阶段 {stages.length + 1}: 全量放开 🏁</span>}>
            <span style={{ color: '#999' }}>此阶段不会限制白名单，所有用户均可升级</span>
          </Card>
        </Form>
      </Modal>

      {/* ========== 回退弹窗 ========== */}
      <Modal title="版本回退" open={rollbackOpen} onOk={handleRollback} onCancel={() => setRollbackOpen(false)}
        confirmLoading={rollbackSubmitting} destroyOnClose>
        <p style={{ marginBottom: 16, color: '#666' }}>选择要回退到的历史版本（版本号低于当前策略目标版本）：</p>
        <Select placeholder="选择回退目标版本" value={rollbackTargetVersion} onChange={setRollbackTargetVersion}
          style={{ width: '100%' }}
          options={rollbackableReleases.map(r => ({
            label: `${r.version} (${r.platform}) — ${r.releaseNotes ? r.releaseNotes.slice(0, 40) : '无说明'}`,
            value: r.version,
          }))}
        />
      </Modal>

      {/* ========== 编辑阶段 Modal ========== */}
      <Modal title="编辑灰度阶段" open={editOpen} onOk={handleEditSubmit} onCancel={() => setEditOpen(false)}
        confirmLoading={editSubmitting} width={760} destroyOnClose>
        <p style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>编辑灰度阶段配置。最后一个"全量放开"阶段将自动追加。</p>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>灰度阶段</strong>
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={editAddStage}>添加阶段</Button>
        </div>
        {editStages.map((stage, si) => (
          <Card key={si} size="small" style={{ marginBottom: 12 }}
            title={<Space><span>阶段 {si + 1}</span><Input size="small" style={{ width: 160 }} placeholder="阶段名称" value={stage.name} onChange={e => editSetName(si, e.target.value)} /></Space>}
            extra={editStages.length > 1 && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => editRemoveStage(si)} />}>
            {stage.rules.map((rule, ri) => (
              <Space key={ri} style={{ display: 'flex', marginBottom: 8 }} align="start">
                <Select style={{ width: 140 }} value={rule.ruleType} onChange={v => editSetRule(si, ri, 'ruleType', v)} options={ruleTypeOptions} />
                <Input style={{ width: 280 }} placeholder={rulePlaceholders[rule.ruleType] || '规则值'} value={rule.ruleValue} onChange={e => editSetRule(si, ri, 'ruleValue', e.target.value)} />
                {stage.rules.length > 1 && <Button icon={<DeleteOutlined />} size="small" danger onClick={() => editRemoveRule(si, ri)} />}
              </Space>
            ))}
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => editAddRule(si)}>添加规则</Button>
          </Card>
        ))}
        <Card size="small" style={{ borderStyle: 'dashed', background: '#fafafa' }}
          title={<span style={{ color: '#52c41a' }}>阶段 {editStages.length + 1}: 全量放开 🏁</span>}>
          <span style={{ color: '#999' }}>此阶段不会限制白名单，所有用户均可升级</span>
        </Card>
      </Modal>

      {/* ========== 策略详情 Modal ========== */}
      <Modal title="策略详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={800} loading={detailLoading}>
        {detail && (
          <div>
            <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
              <p><strong>名称：</strong>{detail.name}</p>
              <p><strong>状态：</strong><Tag color={statusColor[detail.status]}>{statusLabel[detail.status]}</Tag></p>
              <p><strong>阶段进度：</strong>{detail.currentStage} / {detail.totalStages}</p>
            </Card>
            <Card size="small" title="目标版本" style={{ marginBottom: 16 }}>
              <p><strong>版本：</strong>{detail.targetVersion} ({detail.platform})</p>
              {detail.downloadUrl && <p><strong>下载：</strong>{detail.downloadUrl}</p>}
              {detail.releaseNotes && <p><strong>说明：</strong>{detail.releaseNotes}</p>}
            </Card>
            {detailRules.length > 0 && (
              <Card size="small" title={`已同步白名单（${detailRules.length} 条）`} style={{ marginBottom: 16 }}>
                {detailRules.map(r => <Tag key={r.id} color="purple">{r.ruleType}: {r.ruleValue}</Tag>)}
              </Card>
            )}
            <h4>阶段列表</h4>
            {detail.stages.map(s => {
              const isActive = detail.currentStage >= s.stageOrder
              const isFull = s.rules.length === 0
              return (
                <Card key={s.id} size="small"
                  title={`阶段 ${s.stageOrder}: ${s.name}${isActive ? ' ✅' : ''}${isFull ? ' 🏁' : ''}`}
                  style={{ marginBottom: 8, borderLeft: isActive ? '3px solid #1890ff' : isFull ? '3px solid #52c41a' : undefined }}>
                  {isFull ? <span style={{ color: '#999' }}>全量放开，无白名单限制</span> :
                    <>{s.rules.map(r => <Tag key={r.id}>{r.ruleType}: {r.ruleValue}</Tag>)}</>}
                  {s.advancedAt && <p style={{ marginTop: 8, color: '#888' }}>⏱ 激活时间: {new Date(s.advancedAt).toLocaleString('zh-CN')}</p>}
                </Card>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ==================== 工具函数 ====================

interface StageInput {
  name: string
  rules: Array<{ ruleType: string; ruleValue: string }>
}

function compareVersion(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number)
  const p2 = v2.split('.').map(Number)
  const len = Math.max(p1.length, p2.length)
  for (let i = 0; i < len; i++) {
    const a = p1[i] ?? 0, b = p2[i] ?? 0
    if (a > b) return 1
    if (a < b) return -1
  }
  return 0
}

// ==================== 主页面 ====================

export default function UpgradeManagementPage() {
  const [activeTab, setActiveTab] = useState<string>(TAB_KEYS.RELEASES)

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>升级管理</h2>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: TAB_KEYS.RELEASES, label: '版本管理', children: <ReleasesTab /> },
        { key: TAB_KEYS.STRATEGIES, label: '升级策略', children: <StrategiesTab /> },
      ]} />
    </div>
  )
}
