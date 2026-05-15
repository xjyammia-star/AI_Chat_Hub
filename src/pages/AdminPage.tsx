import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Edit2, Eye, EyeOff, Users, Bot, BookOpen, Settings } from 'lucide-react'
import { apiRequest } from '@/lib/auth'
import { AI_PROVIDERS, DEFAULT_AVATARS } from '@/lib/providers'
import AvatarPicker from '@/components/members/AvatarPicker'
import type { AIRole } from '@/types'
import toast from 'react-hot-toast'

type AdminTab = 'members' | 'roles' | 'modes' | 'users'

export default function AdminPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<AdminTab>('members')

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#07070f', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部导航 */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'center', height: 60, gap: 16, flexShrink: 0 }}>
        <button className="btn btn-ghost" style={{ gap: 6 }} onClick={() => navigate('/')}>
          <ArrowLeft size={14} /> 返回聊天
        </button>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 600 }}>管理员后台</h1>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧 Tab */}
        <div style={{ width: 200, background: 'var(--bg-primary)', borderRight: '1px solid var(--border)', padding: 16, flexShrink: 0 }}>
          {([
            { key: 'members', label: 'AI 成员管理', icon: Bot },
            { key: 'roles', label: '角色预设库', icon: BookOpen },
            { key: 'modes', label: '模式配置', icon: Settings },
            { key: 'users', label: '用户管理', icon: Users },
          ] as { key: AdminTab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                background: tab === key ? 'var(--accent-glow)' : 'transparent',
                border: tab === key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                color: tab === key ? 'var(--accent-hover)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: tab === key ? 500 : 400,
                marginBottom: 4,
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* 右侧内容 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {tab === 'members' && <AIManagerPanel />}
          {tab === 'roles' && <RoleLibraryPanel />}
          {tab === 'modes' && <ModesPanel />}
          {tab === 'users' && <UsersPanel />}
        </div>
      </div>
    </div>
  )
}

// ---- AI 成员管理面板 ----
function AIManagerPanel() {
  const [members, setMembers] = useState<Record<string, unknown>[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', avatar: '🤖', provider: 'gemini', model: '', api_key: '', base_url: '', is_public: true })
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})

  const load = async () => {
    const res = await apiRequest('/admin/members')
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.name || !form.model) return toast.error('名称和模型不能为空')
    const res = await apiRequest('/admin/members', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    if (res.ok) {
      toast.success('添加成功')
      setShowAdd(false)
      setForm({ name: '', avatar: '🤖', provider: 'gemini', model: '', api_key: '', base_url: '', is_public: true })
      load()
    } else {
      const d = await res.json()
      toast.error(d.error || '添加失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除？')) return
    const res = await apiRequest('/admin/members', { method: 'DELETE', body: JSON.stringify({ id }) })
    if (res.ok) { toast.success('已删除'); load() }
  }

  const handleTogglePublic = async (id: string, isPublic: boolean) => {
    const res = await apiRequest('/admin/members', { method: 'PUT', body: JSON.stringify({ id, is_public: !isPublic }) })
    if (res.ok) { load() }
  }

  const providerInfo = AI_PROVIDERS[form.provider as keyof typeof AI_PROVIDERS]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>系统 AI 成员</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> 添加 AI 成员
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>添加新成员</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="form-label">显示名称 *</label>
              <input className="form-input" placeholder="如：Gemini Pro" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="form-label">头像</label>
              <AvatarPicker value={form.avatar} onChange={(emoji) => setForm({ ...form, avatar: emoji })} />
            </div>
            <div>
              <label className="form-label">AI 提供商 *</label>
              <select className="form-input" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value, model: '' })}>
                {Object.entries(AI_PROVIDERS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">模型 *</label>
              {providerInfo?.models.length > 0 && (
                <select
                  className="form-input"
                  style={{ marginBottom: 6 }}
                  onChange={(e) => { if (e.target.value) setForm({ ...form, model: e.target.value }) }}
                >
                  <option value="">从常用模型选择…</option>
                  {providerInfo.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
              <input
                className="form-input"
                placeholder="手动输入模型名或接入点 ID，如 ep-20241234-xxxxx"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="form-label">API Key {providerInfo?.requiresKey ? '*' : '(本地模型无需填写)'}</label>
              <input className="form-input" type="password" placeholder="sk-..." value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            </div>
            {(form.provider === 'ollama' || form.provider === 'custom') && (
              <div style={{ gridColumn: '1/-1' }}>
                <label className="form-label">API Base URL</label>
                <input className="form-input" placeholder="http://localhost:11434" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
              </div>
            )}
            <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="isPublic" checked={form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
              <label htmlFor="isPublic" style={{ fontSize: 13, cursor: 'pointer' }}>对所有用户开放（不勾选则需指定用户）</label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleAdd}><Plus size={14} /> 添加</button>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>取消</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {members.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>还没有系统 AI 成员</p>}
        {members.map((m) => (
          <div key={m.id as string} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 28 }}>{m.avatar as string}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{m.name as string}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.provider as string} · {m.model as string}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: m.is_public ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)', color: m.is_public ? 'var(--green)' : 'var(--accent)', border: `1px solid ${m.is_public ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}` }}>
                {m.is_public ? '公开' : '指定用户'}
              </span>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => handleTogglePublic(m.id as string, m.is_public as boolean)}>
                {m.is_public ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleDelete(m.id as string)}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- 角色库面板（简化版）----
function RoleLibraryPanel() {
  const [roles, setRoles] = useState<AIRole[]>([])

  const load = async () => {
    const res = await apiRequest('/admin/roles')
    if (res.ok) { const d = await res.json(); setRoles(d.roles) }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>角色预设库</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {roles.map((r) => (
          <div key={r.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{r.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '1px 8px', borderRadius: 10 }}>{r.category}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- 模式配置面板（简化版）----
function ModesPanel() {
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>聊天模式配置</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>模式的详细参数在数据库 chat_modes 表中，可通过 Neon SQL Editor 直接修改 config 字段。</p>
      <div className="card" style={{ marginTop: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>完整的模式参数编辑界面将在下一版本中添加。</p>
      </div>
    </div>
  )
}

// ---- 用户管理面板（简化版）----
function UsersPanel() {
  const [users, setUsers] = useState<Record<string, unknown>[]>([])

  const load = async () => {
    const res = await apiRequest('/admin/users')
    if (res.ok) { const d = await res.json(); setUsers(d.users) }
  }

  useEffect(() => { load() }, [])

  const toggleActive = async (id: string, active: boolean) => {
    await apiRequest('/admin/users', { method: 'PUT', body: JSON.stringify({ id, is_active: !active }) })
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>用户管理</h2>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>共 {users.length} 个用户</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map((u) => (
          <div key={u.id as string} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: u.role === 'admin' ? 'rgba(245,158,11,0.2)' : 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
              {((u.display_name || u.email) as string)[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{u.display_name as string || u.email as string}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email as string}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {u.role === 'admin' && <span style={{ fontSize: 11, color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '1px 8px' }}>管理员</span>}
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.is_active ? 'var(--green)' : 'var(--text-muted)', display: 'inline-block' }} />
              {u.role !== 'admin' && (
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggleActive(u.id as string, u.is_active as boolean)}>
                  {u.is_active ? '禁用' : '启用'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
