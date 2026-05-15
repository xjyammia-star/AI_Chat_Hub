// src/components/members/UserAIModal.tsx
// 用户私人 AI 成员管理弹窗

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { apiRequest } from '@/lib/auth'
import { AI_PROVIDERS, checkOllamaAvailability } from '@/lib/providers'
import toast from 'react-hot-toast'

interface UserAIMember {
  id: string
  name: string
  avatar: string
  provider: string
  model: string
  base_url?: string
  is_local: boolean
  is_enabled: boolean
  is_available: boolean
  type: 'user'
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function UserAIModal({ onClose, onSaved }: Props) {
  const [members, setMembers] = useState<UserAIMember[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [checking, setChecking] = useState<Record<string, boolean>>({})
  const [form, setForm] = useState({
    name: '',
    avatar: '🤖',
    provider: 'ollama',
    model: '',
    api_key: '',
    base_url: 'http://localhost:11434',
    is_local: true,
  })

  const load = async () => {
    const res = await apiRequest('/members')
    if (res.ok) {
      const data = await res.json()
      const userMembers = data.members.filter((m: UserAIMember) => m.type === 'user')
      setMembers(userMembers)
      // 检测本地模型可用性
      userMembers.forEach((m: UserAIMember) => {
        if (m.is_local) checkAvailability(m)
      })
    }
  }

  useEffect(() => { load() }, [])

  const checkAvailability = async (m: UserAIMember) => {
    if (!m.is_local) return
    setChecking((prev) => ({ ...prev, [m.id]: true }))
    const available = await checkOllamaAvailability(m.base_url || 'http://localhost:11434')
    setMembers((prev) =>
      prev.map((item) => item.id === m.id ? { ...item, is_available: available } : item)
    )
    setChecking((prev) => ({ ...prev, [m.id]: false }))
  }

  const handleProviderChange = (provider: string) => {
    const isLocal = provider === 'ollama'
    setForm({
      ...form,
      provider,
      is_local: isLocal,
      base_url: isLocal ? 'http://localhost:11434' : '',
      model: '',
      avatar: getDefaultAvatar(provider),
    })
  }

  const getDefaultAvatar = (provider: string) => {
    const avatars: Record<string, string> = {
      gemini: '✨', deepseek: '🌊', doubao: '🫘', glm: '🧠',
      openai: '🤖', anthropic: '🔮', ollama: '🦙', custom: '⚡',
    }
    return avatars[provider] || '🤖'
  }

  const handleAdd = async () => {
    if (!form.name || !form.model) return toast.error('名称和模型不能为空')
    if (form.provider !== 'ollama' && !form.api_key) return toast.error('请填入 API Key')

    const res = await apiRequest('/members', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    if (res.ok) {
      toast.success('添加成功')
      setShowAdd(false)
      setForm({ name: '', avatar: '🤖', provider: 'ollama', model: '', api_key: '', base_url: 'http://localhost:11434', is_local: true })
      load()
      onSaved()
    } else {
      const d = await res.json()
      toast.error(d.error || '添加失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除这个私人 AI？')) return
    const res = await apiRequest('/members', { method: 'DELETE', body: JSON.stringify({ id }) })
    if (res.ok) { toast.success('已删除'); load(); onSaved() }
  }

  const providerInfo = AI_PROVIDERS[form.provider as keyof typeof AI_PROVIDERS]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        {/* 标题 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>我的私人 AI</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          私人 AI 只有你自己可见。本地 Ollama 模型由浏览器直连，不经过服务器。
        </p>

        {/* 现有私人 AI 列表 */}
        {members.length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => (
              <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 24 }}>{m.avatar}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {m.provider} · {m.model}
                    {m.is_local && ` · ${m.base_url || 'localhost:11434'}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {m.is_local && (
                    <>
                      {m.is_available ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--green)' }}>
                          <Wifi size={12} /> 已连接
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--red)' }}>
                          <WifiOff size={12} /> 未检测到
                        </div>
                      )}
                      <button
                        onClick={() => checkAvailability(m)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
                        title="重新检测"
                      >
                        <RefreshCw size={12} className={checking[m.id] ? 'spinning' : ''} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDelete(m.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 添加表单 */}
        {showAdd ? (
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>添加私人 AI</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* 提供商 */}
              <div>
                <label className="form-label">AI 提供商 *</label>
                <select className="form-input" value={form.provider} onChange={(e) => handleProviderChange(e.target.value)}>
                  {Object.entries(AI_PROVIDERS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              {/* Ollama 特殊说明 */}
              {form.provider === 'ollama' && (
                <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>🦙 使用本地 Ollama 模型需要：</div>
                  <div>1. 确保 Ollama 已在本机运行</div>
                  <div>2. 用以下命令启动（允许跨域）：</div>
                  <div style={{ fontFamily: 'monospace', background: 'var(--bg-input)', padding: '4px 8px', borderRadius: 4, margin: '4px 0', fontSize: 11 }}>
                    OLLAMA_ORIGINS=* ollama serve
                  </div>
                  <div>Windows 用户在系统环境变量里添加 <code>OLLAMA_ORIGINS=*</code> 后重启 Ollama</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* 名称 */}
                <div>
                  <label className="form-label">显示名称 *</label>
                  <input className="form-input" placeholder="如：我的 Gamma4" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                {/* 头像 */}
                <div>
                  <label className="form-label">头像 (emoji)</label>
                  <input className="form-input" placeholder="🦙" value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} />
                </div>
              </div>

              {/* 模型 */}
              <div>
                <label className="form-label">模型名称 *</label>
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
                  placeholder={form.provider === 'ollama' ? 'gemma3:27b' : '手动输入模型名'}
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>

              {/* API Key（非本地模型才显示）*/}
              {form.provider !== 'ollama' && (
                <div>
                  <label className="form-label">API Key *</label>
                  <input className="form-input" type="password" placeholder="sk-..." value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
                </div>
              )}

              {/* Base URL */}
              <div>
                <label className="form-label">
                  API Base URL {form.provider === 'ollama' ? '（本地地址）' : '（自定义接口，可留空）'}
                </label>
                <input
                  className="form-input"
                  placeholder={form.provider === 'ollama' ? 'http://localhost:11434' : '留空使用默认地址'}
                  value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleAdd} style={{ flex: 1, justifyContent: 'center' }}>
                <Plus size={14} /> 添加
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>取消</button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', padding: 12 }}
            onClick={() => setShowAdd(true)}
          >
            <Plus size={14} /> 添加私人 AI
          </button>
        )}

        {/* 底部说明 */}
        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          💡 私人 AI 的 API Key 加密存储在服务器，本地 Ollama 模型的调用直接由你的浏览器发起，不经过服务器。
        </div>
      </div>
    </div>
  )
}
