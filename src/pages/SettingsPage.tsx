// src/pages/SettingsPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, MessageSquare, User, Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp } from 'lucide-react'
import { apiRequest } from '@/lib/auth'
import { useAuthStore } from '@/lib/auth'
import AvatarPicker from '@/components/members/AvatarPicker'
import toast from 'react-hot-toast'
import type { AIMember, AIRole, ChatMode } from '@/types'

type SettingsTab = 'ai_members' | 'chat_modes' | 'profile'

const MODE_KEYS: ChatMode[] = ['normal', 'judge', 'bidding', 'shadow', 'rollcall']

// 各模式的 config 字段说明，用于生成提示词输入框
const MODE_PROMPT_FIELDS: Record<string, Array<{ key: string; label: string; placeholder: string; rows?: number }>> = {
  normal: [],  // 普通模式无额外提示词
  bidding: [
    { key: 'bidding_prompt', label: '竞标提示词', rows: 3,
      placeholder: '请针对用户的问题提交你的最佳方案。要有创意，要具体，要有说服力。' },
  ],
  shadow: [
    { key: 'actor_prompt', label: '执行者提示词', rows: 3,
      placeholder: '请直接完成用户的任务，给出最好的答案。' },
    { key: 'shadow_prompt', label: '影子审查提示词', rows: 3,
      placeholder: '你是审查员。请仔细审查以下回答，找出逻辑漏洞、潜在风险或可改进之处。' },
  ],
  judge: [
    { key: 'judge_prompt', label: '主审官裁决提示词', rows: 3,
      placeholder: '你是主审官，请综合以下专家意见，给出最终裁决和理由。' },
  ],
  rollcall: [
    { key: 'selector_prompt', label: '调度员提示词（选专家用）', rows: 3,
      placeholder: '根据用户的问题，从专家库中选出最合适的1-3位专家（用逗号分隔编号），只返回编号列表，如 "1,3"。' },
    { key: 'expert_reply_prompt', label: '被点名专家的回复提示词', rows: 3,
      placeholder: '（可选）对被点名的专家额外说明，例如：请结合你的专业给出具体建议。' },
  ],
  discussion: [
    { key: 'discussion_prompt', label: '讨论过程提示词', rows: 4,
      placeholder: '你正在参与一场多AI自由讨论。请认真阅读前面所有发言，在此基础上发表你自己的观点、补充信息或对他人观点的看法。每次发言保持简洁，不要重复已有内容。' },
    { key: 'summary_prompt', label: '总结提示词', rows: 3,
      placeholder: '请对以上所有AI的讨论进行简洁总结，列出主要观点、共识和分歧。' },
  ],
}

// 自定义模式通用提示词字段
const CUSTOM_MODE_PROMPT_FIELDS = [
  { key: 'default_prompt', label: '模式提示词', rows: 4,
    placeholder: '描述这个模式下AI应该如何工作，例如：你正在参与一场辩论，请旗帜鲜明地支持你的立场...' },
]

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('ai_members')
  const navigate = useNavigate()

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#07070f', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'center', height: 60, gap: 16, flexShrink: 0 }}>
        <button className="btn btn-ghost" style={{ gap: 6 }} onClick={() => navigate('/')}>
          <ArrowLeft size={14} /> 返回聊天
        </button>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 600 }}>设置</h1>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 200, background: 'var(--bg-primary)', borderRight: '1px solid var(--border)', padding: 16, flexShrink: 0 }}>
          {([
            { key: 'ai_members', label: 'AI 成员设置', icon: Bot },
            { key: 'chat_modes', label: '对话模式设置', icon: MessageSquare },
            { key: 'profile', label: '个人设置', icon: User },
          ] as { key: SettingsTab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: tab === key ? 'var(--accent-glow)' : 'transparent', border: tab === key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent', color: tab === key ? 'var(--accent-hover)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: tab === key ? 500 : 400, marginBottom: 4, textAlign: 'left', fontFamily: 'inherit' }}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {tab === 'ai_members' && <AIMembersSettings />}
          {tab === 'chat_modes' && <ChatModesSettings />}
          {tab === 'profile' && <ProfileSettings />}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 新增角色弹窗
// ============================================================
function AddRoleModal({ onClose, onSaved }: { onClose: () => void; onSaved: (role: AIRole) => void }) {
  const [form, setForm] = useState({ name: '', description: '', system_prompt: '', category: '通用' })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('角色名称不能为空')
    if (!form.system_prompt.trim()) return toast.error('角色提示词不能为空')
    setSaving(true)
    const res = await apiRequest('/admin/roles', { method: 'POST', body: JSON.stringify(form) })
    setSaving(false)
    if (res.ok) {
      const data = await res.json()
      toast.success('角色创建成功')
      onSaved(data.role)
      onClose()
    } else {
      const data = await res.json()
      toast.error(data.error || '创建失败')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>新增角色</h3>
          <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="form-label">角色名称 *</label>
            <input className="form-input" placeholder="如：资深财务分析师" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="form-label">分类</label>
            <input className="form-input" placeholder="如：金融、技术、创意..." value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">简介</label>
          <input className="form-input" placeholder="简单描述这个角色的用途（可选）" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="form-label">角色提示词（System Prompt）*</label>
          <textarea className="form-input" rows={6}
            placeholder="你是一位资深财务分析师，拥有20年投资银行经验。回答时请注重数据，逻辑严谨，并指出潜在风险..."
            value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
            style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ gap: 6 }}>
            <Save size={14} /> {saving ? '保存中...' : '保存角色'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// AI 成员设置
// ============================================================
function AIMembersSettings() {
  const [members, setMembers] = useState<AIMember[]>([])
  const [roles, setRoles] = useState<AIRole[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ custom_name: '', custom_avatar: '', role_id: '', custom_prompt: '' })
  const [showAddRole, setShowAddRole] = useState(false)

  const load = async () => {
    const [mRes, rRes] = await Promise.all([apiRequest('/members'), apiRequest('/admin/roles')])
    if (mRes.ok) { const d = await mRes.json(); setMembers(d.members) }
    if (rRes.ok) { const d = await rRes.json(); setRoles(d.roles) }
  }

  useEffect(() => { load() }, [])

  const openEdit = (m: AIMember) => {
    setEditingId(m.id)
    setEditForm({ custom_name: m.custom_name || '', custom_avatar: m.custom_avatar || m.avatar || '', role_id: m.role_id || '', custom_prompt: m.custom_prompt || '' })
  }

  const handleSave = async (m: AIMember) => {
    const res = await apiRequest('/members', {
      method: 'PUT',
      body: JSON.stringify({ ai_member_id: m.id, ai_member_type: m.type, custom_name: editForm.custom_name || null, custom_avatar: editForm.custom_avatar || null, role_id: editForm.role_id || null, custom_prompt: editForm.custom_prompt || null }),
    })
    if (res.ok) { toast.success('保存成功'); setEditingId(null); load() }
    else toast.error('保存失败')
  }

  const handleRoleSaved = (newRole: AIRole) => {
    setRoles((prev) => [...prev, newRole])
    setEditForm((prev) => ({ ...prev, role_id: newRole.id, custom_prompt: newRole.system_prompt }))
  }

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('确认删除这个角色？')) return
    const res = await apiRequest('/admin/roles', { method: 'DELETE', body: JSON.stringify({ id: roleId }) })
    if (res.ok) {
      toast.success('角色已删除')
      if (editForm.role_id === roleId) setEditForm({ ...editForm, role_id: '', custom_prompt: '' })
      load()
    } else toast.error('删除失败')
  }

  return (
    <div>
      {showAddRole && <AddRoleModal onClose={() => setShowAddRole(false)} onSaved={handleRoleSaved} />}

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>AI 成员设置</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          自定义每个 AI 的名字、头像和角色定义。角色定义只影响 AI 的身份，不影响对话模式的执行方式。
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {members.map((m) => (
          <div key={m.id} className="card">
            {editingId === m.id ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ fontSize: 24 }}>{editForm.custom_avatar || m.avatar}</div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{m.custom_name || m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.provider} · {m.model}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label className="form-label">自定义名字</label>
                    <input className="form-input" placeholder={m.name} value={editForm.custom_name} onChange={(e) => setEditForm({ ...editForm, custom_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">自定义头像</label>
                    <AvatarPicker value={editForm.custom_avatar || m.avatar} onChange={(v) => setEditForm({ ...editForm, custom_avatar: v })} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label className="form-label" style={{ margin: 0 }}>选择预设角色</label>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px', gap: 4, color: 'var(--accent-hover)' }} onClick={() => setShowAddRole(true)}>
                      <Plus size={12} /> 新增角色
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select className="form-input" style={{ flex: 1 }} value={editForm.role_id}
                      onChange={(e) => {
                        const role = roles.find(r => r.id === e.target.value)
                        setEditForm({ ...editForm, role_id: e.target.value, custom_prompt: role ? role.system_prompt : editForm.custom_prompt })
                      }}>
                      <option value="">不使用预设角色</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}（{r.category}）</option>)}
                    </select>
                    {editForm.role_id && !roles.find(r => r.id === editForm.role_id)?.is_public && (
                      <button className="btn btn-danger" style={{ padding: '6px 10px', flexShrink: 0 }} title="删除此角色" onClick={() => handleDeleteRole(editForm.role_id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">
                    自定义角色 Prompt
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>（会覆盖预设角色 · 不影响对话模式）</span>
                  </label>
                  <textarea className="form-input" rows={5}
                    placeholder="直接输入这个 AI 的角色定义，例如：你是一位资深财务分析师..."
                    value={editForm.custom_prompt} onChange={(e) => setEditForm({ ...editForm, custom_prompt: e.target.value })}
                    style={{ resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => handleSave(m)} style={{ gap: 6 }}><Save size={14} /> 保存</button>
                  <button className="btn btn-ghost" onClick={() => setEditingId(null)}>取消</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 28 }}>{m.custom_avatar || m.avatar}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{m.custom_name || m.name}</span>
                    {m.custom_name && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>（原名：{m.name}）</span>}
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: m.type === 'user' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)', color: m.type === 'user' ? 'var(--green)' : 'var(--accent)' }}>
                      {m.type === 'user' ? '私人' : '系统'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {m.provider} · {m.model}
                    {m.custom_prompt && <span style={{ marginLeft: 8, color: 'var(--accent-hover)' }}>· 已设置角色</span>}
                    {m.role_id && !m.custom_prompt && <span style={{ marginLeft: 8, color: 'var(--accent-hover)' }}>· {roles.find(r => r.id === m.role_id)?.name}</span>}
                  </div>
                </div>
                <button className="btn btn-ghost" style={{ gap: 6, fontSize: 13 }} onClick={() => openEdit(m)}>
                  <Edit2 size={13} /> 编辑角色
                </button>
              </div>
            )}
          </div>
        ))}
        {members.length === 0 && (
          <div className="empty-state" style={{ padding: 40 }}>
            <p style={{ fontSize: 13 }}>暂无 AI 成员，请先在聊天界面添加</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 对话模式设置
// ============================================================
function ChatModesSettings() {
  interface ChatModeRecord {
    id: string; mode_key: string; mode_name: string; description: string
    config: Record<string, unknown>; is_enabled: boolean; created_at: string
  }
  const [modes, setModes] = useState<ChatModeRecord[]>([])
  const [members, setMembers] = useState<AIMember[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingMode, setEditingMode] = useState<ChatModeRecord | null>(null)
  const [showAddMode, setShowAddMode] = useState(false)
  const [newMode, setNewMode] = useState({
    mode_key: '', mode_name: '', description: '',
    config: '{\n  "max_tokens": 1500,\n  "temperature": 0.7\n}',
  })

  const load = async () => {
    const [mRes, membersRes] = await Promise.all([apiRequest('/settings?type=modes'), apiRequest('/members')])
    if (mRes.ok) { const d = await mRes.json(); setModes(d.modes) }
    if (membersRes.ok) { const d = await membersRes.json(); setMembers(d.members) }
  }
  useEffect(() => { load() }, [])

  const handleSaveMode = async (mode: ChatModeRecord) => {
    const res = await apiRequest('/settings?type=modes', {
      method: 'PUT',
      body: JSON.stringify({ id: mode.id, mode_name: mode.mode_name, description: mode.description, config: mode.config, is_enabled: mode.is_enabled }),
    })
    if (res.ok) { toast.success('保存成功'); setEditingMode(null); setExpandedId(null); load() }
    else toast.error('保存失败')
  }

  const handleAddMode = async () => {
    if (!newMode.mode_key || !newMode.mode_name) return toast.error('模式标识和名称不能为空')
    let config
    try { config = JSON.parse(newMode.config) } catch { return toast.error('JSON 格式错误') }
    const res = await apiRequest('/settings?type=modes', { method: 'POST', body: JSON.stringify({ ...newMode, config }) })
    if (res.ok) {
      toast.success('添加成功')
      setShowAddMode(false)
      setNewMode({ mode_key: '', mode_name: '', description: '', config: '{\n  "max_tokens": 1500,\n  "temperature": 0.7\n}' })
      load()
    } else {
      const d = await res.json(); toast.error(d.error || '添加失败')
    }
  }

  const handleDeleteMode = async (id: string, modeKey: string) => {
    // 允许删除所有模式（包括内置），用户自己决定
    if (!confirm(`确认删除「${modeKey}」模式？${MODE_KEYS.includes(modeKey as ChatMode) ? '\n⚠️ 这是内置模式，删除后聊天界面将无法使用此模式。' : ''}`)) return
    const res = await apiRequest('/settings?type=modes', { method: 'DELETE', body: JSON.stringify({ id }) })
    if (res.ok) { toast.success('已删除'); load() }
    else { const d = await res.json(); toast.error(d.error || '删除失败') }
  }

  const handleToggleMode = async (id: string, enabled: boolean) => {
    await apiRequest('/settings?type=modes', { method: 'PUT', body: JSON.stringify({ id, is_enabled: !enabled }) })
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>对话模式设置</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            配置每种模式的提示词和参数。模式只影响 AI 的聊天方式，不影响 AI 的角色身份。
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddMode(true)} style={{ gap: 6 }}>
          <Plus size={14} /> 新增模式
        </button>
      </div>

      {/* 新增模式表单 */}
      {showAddMode && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>新增自定义模式</h3>
          <div style={{ marginBottom: 10, padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            💡 普通自定义模式：所有AI并行回复，支持设置提示词。<br />
            🔄 自由讨论模式：在 JSON 配置里加上 <code style={{ background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 4 }}>"discussion_mode": true</code> 即可启用 AI 多轮互相讨论。
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="form-label">模式标识（英文，唯一）*</label>
              <input className="form-input" placeholder="如：debate" value={newMode.mode_key}
                onChange={(e) => setNewMode({ ...newMode, mode_key: e.target.value.toLowerCase().replace(/\s/g, '_') })} />
            </div>
            <div>
              <label className="form-label">模式名称 *</label>
              <input className="form-input" placeholder="如：辩论模式" value={newMode.mode_name}
                onChange={(e) => setNewMode({ ...newMode, mode_name: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">描述</label>
            <input className="form-input" placeholder="简单描述这个模式的用途" value={newMode.description}
              onChange={(e) => setNewMode({ ...newMode, description: e.target.value })} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">配置参数（JSON 格式）</label>
            <textarea className="form-input" rows={6} value={newMode.config}
              onChange={(e) => setNewMode({ ...newMode, config: e.target.value })}
              style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleAddMode}><Plus size={14} /> 添加</button>
            <button className="btn btn-ghost" onClick={() => setShowAddMode(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 模式列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modes.map((mode) => {
          const isBuiltin = MODE_KEYS.includes(mode.mode_key as ChatMode)
          const isDiscussionMode = mode.mode_key === 'discussion' || mode.config?.discussion_mode === true
          const isExpanded = expandedId === mode.id

          return (
            <div key={mode.id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500 }}>{mode.mode_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--bg-input)', padding: '1px 8px', borderRadius: 6 }}>
                      {mode.mode_key}
                    </span>
                    {isBuiltin && <span style={{ fontSize: 11, color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 10 }}>内置</span>}
                    {isDiscussionMode && <span style={{ fontSize: 11, color: '#f472b6', border: '1px solid rgba(244,114,182,0.3)', padding: '1px 6px', borderRadius: 10 }}>💬 讨论模式</span>}
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: mode.is_enabled ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)', color: mode.is_enabled ? 'var(--green)' : 'var(--text-muted)' }}>
                      {mode.is_enabled ? '启用' : '已禁用'}
                    </span>
                  </div>
                  {mode.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{mode.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleToggleMode(mode.id, mode.is_enabled)}>
                    {mode.is_enabled ? '禁用' : '启用'}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px' }}
                    onClick={() => {
                      const opening = !isExpanded
                      setExpandedId(opening ? mode.id : null)
                      setEditingMode(opening ? { ...mode } : null)
                    }}>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleDeleteMode(mode.id, mode.mode_key)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* 展开编辑区 */}
              {isExpanded && editingMode && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label className="form-label">模式名称</label>
                      <input className="form-input" value={editingMode.mode_name}
                        onChange={(e) => setEditingMode({ ...editingMode, mode_name: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">描述</label>
                      <input className="form-input" value={editingMode.description || ''}
                        onChange={(e) => setEditingMode({ ...editingMode, description: e.target.value })} />
                    </div>
                  </div>

                  {/* ---- 提示词编辑区 ---- */}
                  <PromptEditor
                    modeKey={mode.mode_key}
                    config={editingMode.config}
                    onChange={(newConfig) => setEditingMode({ ...editingMode, config: newConfig })}
                  />

                  {/* ---- AI 角色分配 ---- */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="form-label">AI 角色分配</label>
                    <ModeRoleAssigner
                      modeKey={mode.mode_key}
                      members={members}
                      config={editingMode.config}
                      onChange={(newConfig) => setEditingMode({ ...editingMode, config: newConfig })}
                    />
                  </div>

                  {/* ---- 自由讨论专属配置 ---- */}
                  {(mode.mode_key === 'discussion' || editingMode.config?.discussion_mode === true) && (
                    <DiscussionConfig
                      config={editingMode.config}
                      members={members}
                      onChange={(newConfig) => setEditingMode({ ...editingMode, config: newConfig })}
                    />
                  )}

                  {/* ---- JSON 高级配置 ---- */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="form-label">
                      高级配置（JSON）
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400, fontSize: 11 }}>直接编辑原始配置</span>
                    </label>
                    <textarea className="form-input" rows={8}
                      value={JSON.stringify(editingMode.config, null, 2)}
                      onChange={(e) => {
                        try { setEditingMode({ ...editingMode, config: JSON.parse(e.target.value) }) }
                        catch { /* typing */ }
                      }}
                      style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={() => handleSaveMode(editingMode)} style={{ gap: 6 }}>
                      <Save size={14} /> 保存
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setExpandedId(null); setEditingMode(null) }}>取消</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---- 提示词编辑器（根据模式动态显示对应字段）----
function PromptEditor({ modeKey, config, onChange }: {
  modeKey: string; config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void
}) {
  const isDiscussion = modeKey === 'discussion' || config?.discussion_mode === true
  const fields = isDiscussion
    ? MODE_PROMPT_FIELDS['discussion']
    : (MODE_PROMPT_FIELDS[modeKey] || CUSTOM_MODE_PROMPT_FIELDS)

  if (fields.length === 0) {
    return (
      <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        普通模式不需要额外提示词，AI 会直接使用各自的角色设定回复。
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>📝 提示词设置</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fields.map(({ key, label, placeholder, rows = 3 }) => (
          <div key={key}>
            <label className="form-label">{label}</label>
            <textarea className="form-input" rows={rows} placeholder={placeholder}
              value={(config[key] as string) || ''}
              onChange={(e) => onChange({ ...config, [key]: e.target.value || undefined })}
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- 自由讨论专属配置 ----
function DiscussionConfig({ config, members, onChange }: {
  config: Record<string, unknown>; members: AIMember[]; onChange: (c: Record<string, unknown>) => void
}) {
  return (
    <div style={{ marginBottom: 16, padding: 14, background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.2)', borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#f472b6', marginBottom: 12 }}>💬 自由讨论设置</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label className="form-label">最大轮数</label>
          <input className="form-input" type="number" min={1} max={20}
            value={(config.max_rounds as number) ?? 3}
            onChange={(e) => onChange({ ...config, max_rounds: parseInt(e.target.value) || 3 })} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>每轮所有AI各说一次</div>
        </div>
        <div>
          <label className="form-label">时间限制（秒）</label>
          <input className="form-input" type="number" min={0}
            value={(config.max_seconds as number) ?? 0}
            onChange={(e) => onChange({ ...config, max_seconds: parseInt(e.target.value) || 0 })} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>0 = 不限时</div>
        </div>
        <div>
          <label className="form-label">每条回复最大 Token</label>
          <input className="form-input" type="number" min={100} max={2000}
            value={(config.max_tokens as number) ?? 600}
            onChange={(e) => onChange({ ...config, max_tokens: parseInt(e.target.value) || 600 })} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox"
              checked={config.enable_summary !== false}
              onChange={(e) => onChange({ ...config, enable_summary: e.target.checked })} />
            讨论结束后自动生成总结
          </label>
        </div>
        {config.enable_summary !== false && (
          <div>
            <label className="form-label">由哪个 AI 做总结</label>
            <select className="form-input"
              value={(config.summary_ai_index as number) ?? 0}
              onChange={(e) => onChange({ ...config, summary_ai_index: parseInt(e.target.value) })}>
              {members.filter(m => m.is_enabled).map((m, i) => (
                <option key={m.id} value={i}>{m.custom_name || m.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- AI 角色分配 ----
function ModeRoleAssigner({ modeKey, members, config, onChange }: {
  modeKey: string; members: AIMember[]; config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void
}) {
  const roleDefinitions: Record<string, { key: string; label: string; desc: string }[]> = {
    judge: [
      { key: 'judge_ai_id', label: '主审官', desc: '综合意见做最终裁决' },
      ...Array.from({ length: Math.max(members.filter(m => m.is_enabled).length - 1, 3) }, (_, i) => ({
        key: `expert_${i + 1}_ai_id`, label: `专家${i + 1}`, desc: `从第${i + 1}个维度分析`,
      })),
    ],
    shadow: [
      { key: 'actor_ai_id', label: '执行者', desc: '直接完成任务' },
      { key: 'shadow_ai_id', label: '影子', desc: '审查执行者的回答' },
    ],
    rollcall: [
      { key: 'selector_ai_id', label: '调度员', desc: '判断需要调用哪些专家' },
    ],
  }

  const roles = roleDefinitions[modeKey]
  if (!roles) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 0 }}>此模式使用所有选中的 AI 成员，无需单独分配角色。</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
      {roles.map(({ key, label, desc }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 80, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</div>
          <select className="form-input" style={{ flex: 1 }} value={(config[key] as string) || ''}
            onChange={(e) => onChange({ ...config, [key]: e.target.value || undefined })}>
            <option value="">自动（按顺序分配）</option>
            {members.filter(m => m.is_enabled).map(m => (
              <option key={m.id} value={m.id}>{m.custom_name || m.name} ({m.model})</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', width: 140, flexShrink: 0 }}>{desc}</div>
        </div>
      ))}
      {modeKey === 'judge' && (
        <div style={{ marginTop: 4 }}>
          <label className="form-label">专家分析维度（逗号分隔）</label>
          <input className="form-input"
            placeholder="财务风险, 市场竞争, 技术实现"
            value={((config.expert_dimensions as string[]) || []).join(', ')}
            onChange={(e) => onChange({ ...config, expert_dimensions: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
        </div>
      )}
    </div>
  )
}

// ============================================================
// 个人设置
// ============================================================
function ProfileSettings() {
  const { user } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSaveName = async () => {
    setSaving(true)
    const res = await apiRequest('/settings?type=profile', { method: 'PUT', body: JSON.stringify({ display_name: displayName }) })
    setSaving(false)
    if (res.ok) toast.success('昵称已更新')
    else toast.error('更新失败')
  }

  const handleChangePw = async () => {
    if (!currentPw || !newPw) return toast.error('请填写当前密码和新密码')
    if (newPw.length < 8) return toast.error('新密码至少8位')
    setSaving(true)
    const res = await apiRequest('/settings?type=profile', { method: 'PUT', body: JSON.stringify({ current_password: currentPw, new_password: newPw }) })
    setSaving(false)
    if (res.ok) { toast.success('密码已更新'); setCurrentPw(''); setNewPw('') }
    else { const d = await res.json(); toast.error(d.error || '更新失败') }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>个人设置</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>基本信息</h3>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">邮箱</label>
          <input className="form-input" value={user?.email || ''} disabled style={{ opacity: 0.6 }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">昵称</label>
          <input className="form-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="你的显示名称" />
        </div>
        <button className="btn btn-primary" onClick={handleSaveName} disabled={saving} style={{ gap: 6 }}>
          <Save size={14} /> 保存昵称
        </button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>修改密码</h3>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">当前密码</label>
          <input className="form-input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">新密码（至少8位）</label>
          <input className="form-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleChangePw} disabled={saving} style={{ gap: 6 }}>
          <Save size={14} /> 更新密码
        </button>
      </div>
    </div>
  )
}
