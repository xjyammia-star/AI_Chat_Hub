import { useEffect, useRef, useState } from 'react'
import { Send, Settings2, Users, Zap, Crown, Target, Eye, Radio } from 'lucide-react'
import TextareaAutosize from 'react-textarea-autosize'
import { useChatStore } from '@/lib/chat'
import type { ChatMessage, ChatMode, AIMember } from '@/types'
import { apiRequest } from '@/lib/auth'
import toast from 'react-hot-toast'

const MODE_INFO: Record<ChatMode, { icon: React.ElementType; label: string; desc: string; color: string }> = {
  normal:   { icon: Zap,     label: '普通对话',  desc: '直接对话',        color: '#818cf8' },
  judge:    { icon: Crown,   label: '主审官模式', desc: '专家分析+裁决',    color: '#fbbf24' },
  bidding:  { icon: Target,  label: '竞标模式',  desc: '并行提案比选',     color: '#34d399' },
  shadow:   { icon: Eye,     label: '影子模式',  desc: '执行+后台审查',    color: '#a78bfa' },
  rollcall: { icon: Radio,   label: '点名模式',  desc: '自动调用专家',     color: '#f472b6' },
}

export default function ChatArea() {
  const { currentSession, messages, isSending, activeMode, selectedAIIds, setActiveMode, toggleAIMember, sendMessage, createSession, setCurrentSession } = useChatStore()
  const [input, setInput] = useState('')
  const [aiMembers, setAiMembers] = useState<AIMember[]>([])
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [showMemberMenu, setShowMemberMenu] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 加载 AI 成员列表
  useEffect(() => {
    apiRequest('/members').then(async (res) => {
      if (res.ok) {
        const data = await res.json()
        setAiMembers(data.members)
        // 默认选中所有可用成员
        const available = data.members.filter((m: AIMember) => m.is_enabled && m.is_available)
        if (available.length > 0 && selectedAIIds.length === 0) {
          available.forEach((m: AIMember) => toggleAIMember(m.id))
        }
      }
    })
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isSending) return
    if (!currentSession) {
      const session = await createSession(activeMode)
      setCurrentSession(session)
    }
    const text = input
    setInput('')
    try {
      await sendMessage(text)
    } catch {
      toast.error('发送失败，请重试')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!currentSession) {
    return (
      <div className="chat-area">
        <div className="empty-state">
          <div style={{ fontSize: 48 }}>💬</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)' }}>
            选择或新建一个对话
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280 }}>
            支持普通对话、主审官、竞标、影子、点名 5 种模式
          </p>
          <button className="btn btn-primary" onClick={async () => {
            const session = await createSession('normal')
            setCurrentSession(session)
          }}>
            <Zap size={14} /> 开始新对话
          </button>
        </div>
      </div>
    )
  }

  const ModeIcon = MODE_INFO[activeMode].icon

  return (
    <div className="chat-area">
      {/* 聊天头部 */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>{currentSession.title}</h2>
          <span className={`mode-badge ${activeMode}`}>
            <ModeIcon size={11} />
            {MODE_INFO[activeMode].label}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* 选择参与 AI 成员 */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost"
              style={{ gap: 6, fontSize: 13 }}
              onClick={() => { setShowMemberMenu(!showMemberMenu); setShowModeMenu(false) }}
            >
              <Users size={14} />
              成员 ({selectedAIIds.length})
            </button>
            {showMemberMenu && (
              <MemberDropdown
                members={aiMembers}
                selected={selectedAIIds}
                onToggle={toggleAIMember}
                onClose={() => setShowMemberMenu(false)}
              />
            )}
          </div>

          {/* 切换模式 */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost"
              style={{ gap: 6, fontSize: 13 }}
              onClick={() => { setShowModeMenu(!showModeMenu); setShowMemberMenu(false) }}
            >
              <Settings2 size={14} />
              模式
            </button>
            {showModeMenu && (
              <ModeDropdown
                activeMode={activeMode}
                onSelect={(mode) => { setActiveMode(mode); setShowModeMenu(false) }}
                onClose={() => setShowModeMenu(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-state" style={{ flex: 1 }}>
            <p style={{ fontSize: 13 }}>发送消息开始对话</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageRow key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入区域 */}
      <div className="input-area">
        {/* 参与的 AI 成员预览 */}
        {selectedAIIds.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {aiMembers
              .filter((m) => selectedAIIds.includes(m.id))
              .map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    background: 'var(--bg-input)',
                    borderRadius: 20,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span>{m.custom_avatar || m.avatar}</span>
                  {m.custom_name || m.name}
                  {!m.is_available && (
                    <span style={{ color: 'var(--red)', fontSize: 10 }}>⚠</span>
                  )}
                </div>
              ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <TextareaAutosize
            className="input-box"
            placeholder={`发送消息... (Enter 发送，Shift+Enter 换行)`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            minRows={1}
            maxRows={6}
            disabled={isSending}
          />
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            style={{ padding: '10px 16px', flexShrink: 0 }}
          >
            {isSending ? <span className="spinner" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// 消息行
function MessageRow({ message }: { message: ChatMessage }) {
  if (message.metadata?.thinking) {
    return (
      <div className="message-row ai">
        <div className="ai-avatar">🤔</div>
        <div>
          <div className="role-label">AI 思考中...</div>
          <div className="bubble ai">
            <div className="thinking-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (message.sender_type === 'system') {
    return (
      <div className="message-row system">
        <div className="bubble system">{message.content}</div>
      </div>
    )
  }

  const isUser = message.sender_type === 'user'

  return (
    <div className={`message-row ${isUser ? 'user' : 'ai'} fade-in`}>
      {!isUser && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div className="ai-avatar">{message.sender_avatar || '🤖'}</div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 4px var(--green)' }} />
        </div>
      )}
      <div style={{ maxWidth: '100%' }}>
        {!isUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {message.sender_name}
            </span>
            {message.role_in_mode && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 10, border: '1px solid var(--border)' }}>
                {message.role_in_mode}
              </span>
            )}
            {message.metadata?.model && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {message.metadata.model}
              </span>
            )}
          </div>
        )}
        <div className={`bubble ${isUser ? 'user' : 'ai'}`}>{message.content}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, textAlign: isUser ? 'right' : 'left' }}>
          {new Date(message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

// 成员选择下拉
function MemberDropdown({ members, selected, onToggle, onClose }: {
  members: AIMember[]
  selected: string[]
  onToggle: (id: string) => void
  onClose: () => void
}) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 49 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 6,
          width: 240,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 8,
          zIndex: 50,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px 8px', fontWeight: 500 }}>
          选择参与的 AI 成员
        </div>
        {members.length === 0 && (
          <div style={{ padding: '8px', fontSize: 12, color: 'var(--text-muted)' }}>暂无可用 AI 成员</div>
        )}
        {members.map((m) => (
          <div
            key={m.id}
            onClick={() => onToggle(m.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px',
              borderRadius: 8,
              cursor: 'pointer',
              background: selected.includes(m.id) ? 'var(--accent-glow)' : 'transparent',
              border: selected.includes(m.id) ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
              marginBottom: 2,
            }}
          >
            <div style={{ fontSize: 20 }}>{m.custom_avatar || m.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.custom_name || m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.model}</div>
            </div>
            <div className={`status-dot ${m.is_available ? 'online' : 'offline'}`} />
          </div>
        ))}
      </div>
    </>
  )
}

// 模式选择下拉
function ModeDropdown({ activeMode, onSelect, onClose }: {
  activeMode: ChatMode
  onSelect: (mode: ChatMode) => void
  onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onClose} />
      <div
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 6,
          width: 220,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 8,
          zIndex: 50,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px 8px', fontWeight: 500 }}>
          聊天模式
        </div>
        {(Object.entries(MODE_INFO) as [ChatMode, typeof MODE_INFO[ChatMode]][]).map(([key, info]) => {
          const Icon = info.icon
          return (
            <div
              key={key}
              onClick={() => onSelect(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                background: activeMode === key ? 'var(--accent-glow)' : 'transparent',
                border: activeMode === key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                marginBottom: 2,
              }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${info.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={14} color={info.color} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{info.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{info.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
