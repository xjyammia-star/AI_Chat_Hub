import { useEffect, useRef, useState } from 'react'
import { Send, Settings2, Users, Zap, Crown, Target, Eye, Radio, UserPlus, MessageCircle, StopCircle } from 'lucide-react'
import TextareaAutosize from 'react-textarea-autosize'
import { useChatStore, discussionState } from '@/lib/chat'
import type { ChatMessage, ChatMode, AIMember } from '@/types'
import { apiRequest } from '@/lib/auth'
import toast from 'react-hot-toast'
import UserAIModal from '@/components/members/UserAIModal'

const BUILTIN_MODE_STYLE: Record<string, { icon: React.ElementType; color: string }> = {
  normal:     { icon: Zap,           color: '#818cf8' },
  judge:      { icon: Crown,         color: '#fbbf24' },
  bidding:    { icon: Target,        color: '#34d399' },
  shadow:     { icon: Eye,           color: '#a78bfa' },
  rollcall:   { icon: Radio,         color: '#f472b6' },
  discussion: { icon: MessageCircle, color: '#38bdf8' },
}

interface DynamicMode {
  id: string; mode_key: string; mode_name: string
  description: string; is_enabled: boolean; config: Record<string, unknown>
}

export default function ChatArea() {
  const { currentSession, messages, isSending, activeMode, selectedAIIds, setActiveMode, toggleAIMember, sendMessage, createSession, setCurrentSession } = useChatStore()
  const [input, setInput] = useState('')
  const [aiMembers, setAiMembers] = useState<AIMember[]>([])
  const [modes, setModes] = useState<DynamicMode[]>([])
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [showMemberMenu, setShowMemberMenu] = useState(false)
  const [showUserAIModal, setShowUserAIModal] = useState(false)
  const [mentionedIds, setMentionedIds] = useState<string[]>([])
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [isDiscussionRunning, setIsDiscussionRunning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 监听讨论状态
  useEffect(() => {
    const interval = setInterval(() => {
      setIsDiscussionRunning(discussionState.isRunning)
    }, 300)
    return () => clearInterval(interval)
  }, [])

  const loadMembers = () => {
    apiRequest('/members').then(async (res) => {
      if (res.ok) {
        const data = await res.json()
        setAiMembers(data.members)
        const enabledIds: string[] = Array.from(new Set<string>(
          data.members
            .filter((m: AIMember) => m.is_enabled)
            .map((m: AIMember) => m.type === 'user' ? `${m.id}:user` : m.id)
        ))
        useChatStore.setState({ selectedAIIds: enabledIds })
      }
    })
  }

  const loadModes = () => {
    apiRequest('/settings?type=modes').then(async (res) => {
      if (res.ok) {
        const data = await res.json()
        setModes(data.modes.filter((m: DynamicMode) => m.is_enabled))
      }
    })
  }

  useEffect(() => { loadMembers(); loadModes() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleStopDiscussion = () => {
    discussionState.shouldStop = true
    toast('正在停止讨论...', { icon: '⏹' })
  }

  const handleSend = async () => {
    if (!input.trim() || isSending || isDiscussionRunning) return
    let session = currentSession
    if (!session) {
      session = await createSession(activeMode)
      setCurrentSession(session)
    }
    const text = input
    setInput('')
    const currentMentionedIds = [...mentionedIds]
    setMentionedIds([])
    if (currentMentionedIds.length > 0) {
      useChatStore.setState({
        selectedAIIds: currentMentionedIds.map(id => {
          const m = aiMembers.find(m => m.id === id)
          return m?.type === 'user' ? `${id}:user` : id
        })
      })
    }
    try {
      await sendMessage(text)
      if (currentMentionedIds.length > 0) {
        const enabledIds = aiMembers.filter(m => m.is_enabled).map(m => m.type === 'user' ? `${m.id}:user` : m.id)
        useChatStore.setState({ selectedAIIds: enabledIds })
      }
    } catch {
      const enabledIds = aiMembers.filter(m => m.is_enabled).map(m => m.type === 'user' ? `${m.id}:user` : m.id)
      useChatStore.setState({ selectedAIIds: enabledIds })
      toast.error('发送失败，请重试')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionMenu) {
      if (e.key === 'Escape') { setShowMentionMenu(false); e.preventDefault() }
      return
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (val: string) => {
    setInput(val)
    const lastAt = val.lastIndexOf('@')
    if (lastAt >= 0) {
      const afterAt = val.slice(lastAt + 1)
      if (!afterAt.includes(' ')) { setShowMentionMenu(true); setMentionQuery(afterAt); return }
    }
    setShowMentionMenu(false)
  }

  const handleMention = (member: AIMember | null) => {
    const lastAt = input.lastIndexOf('@')
    if (member === null) {
      setInput(input.slice(0, lastAt)); setMentionedIds([])
    } else {
      const name = member.custom_name || member.name
      setInput(input.slice(0, lastAt) + `@${name} `)
      if (!mentionedIds.includes(member.id)) setMentionedIds([...mentionedIds, member.id])
    }
    setShowMentionMenu(false)
    inputRef.current?.focus()
  }

  const mentionFilteredMembers = aiMembers.filter((m) =>
    m.is_enabled && (mentionQuery === '' || (m.custom_name || m.name).toLowerCase().includes(mentionQuery.toLowerCase()))
  )

  const activeModeInfo = modes.find(m => m.mode_key === activeMode)
  const activeModeStyle = BUILTIN_MODE_STYLE[activeMode] || { icon: MessageCircle, color: '#818cf8' }
  const ActiveModeIcon = activeModeStyle.icon
  const isDiscussionMode = activeMode === 'discussion' || activeModeInfo?.config?.discussion_mode === true

  if (!currentSession) {
    return (
      <div className="chat-area">
        <div className="empty-state">
          <div style={{ fontSize: 48 }}>💬</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)' }}>选择或新建一个对话</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280 }}>
            {modes.length > 0
              ? `支持 ${modes.length} 种对话模式`
              : '支持多种对话模式'}
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

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>{currentSession.title}</h2>
          <span className={`mode-badge ${activeMode}`}>
            <ActiveModeIcon size={11} />
            {activeModeInfo?.mode_name || activeMode}
          </span>
          {/* 讨论进行中状态 */}
          {isDiscussionRunning && (
            <span style={{ fontSize: 11, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
              讨论进行中
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* 停止讨论按钮 */}
          {isDiscussionRunning && (
            <button
              className="btn btn-danger"
              style={{ gap: 6, fontSize: 13 }}
              onClick={handleStopDiscussion}
            >
              <StopCircle size={14} /> 停止讨论
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" style={{ gap: 6, fontSize: 13 }}
              onClick={() => { setShowMemberMenu(!showMemberMenu); setShowModeMenu(false) }}>
              <Users size={14} /> 成员 ({new Set(selectedAIIds.map(id => id.replace(':user', ''))).size})
            </button>
            {showMemberMenu && (
              <MemberDropdown members={aiMembers} selected={selectedAIIds} onToggle={toggleAIMember}
                onClose={() => setShowMemberMenu(false)}
                onManage={() => { setShowMemberMenu(false); setShowUserAIModal(true) }} />
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" style={{ gap: 6, fontSize: 13 }}
              onClick={() => { setShowModeMenu(!showModeMenu); setShowMemberMenu(false) }}>
              <Settings2 size={14} /> 模式
            </button>
            {showModeMenu && (
              <ModeDropdown modes={modes} activeMode={activeMode}
                onSelect={(mode) => { setActiveMode(mode as ChatMode); setShowModeMenu(false) }}
                onClose={() => setShowModeMenu(false)} />
            )}
          </div>
        </div>
      </div>

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-state" style={{ flex: 1 }}>
            <p style={{ fontSize: 13 }}>
              {isDiscussionMode
                ? '发送消息启动讨论，AI 们会自动轮流发言，你可以随时点「停止讨论」'
                : '发送消息开始对话'}
            </p>
          </div>
        )}
        {messages.map((msg) => <MessageRow key={msg.id} message={msg} />)}
        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap', minHeight: 28 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>@:</span>
          <div onClick={() => setMentionedIds([])}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer', background: mentionedIds.length === 0 ? 'var(--accent-glow)' : 'var(--bg-input)', color: mentionedIds.length === 0 ? 'var(--accent-hover)' : 'var(--text-muted)', border: `1px solid ${mentionedIds.length === 0 ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`, transition: 'all 0.15s' }}>
            👥 所有人
          </div>
          {aiMembers.filter((m) => selectedAIIds.includes(m.id) || selectedAIIds.includes(`${m.id}:user`)).map((m) => {
            const isSelected = mentionedIds.includes(m.id)
            return (
              <div key={m.id}
                onClick={() => {
                  if (isSelected) setMentionedIds(mentionedIds.filter(id => id !== m.id))
                  else setMentionedIds([...mentionedIds, m.id])
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,0.15)' : 'var(--bg-input)', color: isSelected ? 'var(--accent-hover)' : 'var(--text-secondary)', border: `1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`, transition: 'all 0.15s' }}>
                <span>{m.custom_avatar || m.avatar}</span>
                {m.custom_name || m.name}
                {isSelected && <span style={{ fontSize: 10, marginLeft: 2 }}>✓</span>}
              </div>
            )
          })}
        </div>

        {showMentionMenu && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, marginBottom: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px 6px', fontWeight: 500 }}>@ 提及</div>
            <div onClick={() => handleMention(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: 16 }}>👥</span> 所有人（默认）
            </div>
            {mentionFilteredMembers.map((m) => (
              <div key={m.id} onClick={() => handleMention(m)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: 16 }}>{m.custom_avatar || m.avatar}</span>
                {m.custom_name || m.name}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <TextareaAutosize
            ref={inputRef}
            className="input-box"
            placeholder={isDiscussionRunning
              ? '讨论进行中，可点右上角「停止讨论」...'
              : isDiscussionMode
                ? '发送消息启动讨论... (Ctrl+Enter 发送)'
                : '发送消息... (Ctrl+Enter 发送，Enter 换行，@ 提及成员)'}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            minRows={1}
            maxRows={6}
            disabled={isSending || isDiscussionRunning}
          />
          <button className="btn btn-primary" onClick={handleSend}
            disabled={!input.trim() || isSending || isDiscussionRunning}
            style={{ padding: '10px 16px', flexShrink: 0 }} title="发送 (Ctrl+Enter)">
            {isSending ? <span className="spinner" /> : <Send size={16} />}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
          {isDiscussionRunning
            ? '讨论进行中 · 点右上角「停止讨论」可随时停止'
            : 'Ctrl+Enter 发送 · Enter 换行 · @ 提及成员'}
        </div>
      </div>

      {showUserAIModal && (
        <UserAIModal onClose={() => setShowUserAIModal(false)} onSaved={loadMembers} />
      )}
    </div>
  )
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.metadata?.thinking) {
    return (
      <div className="message-row ai">
        <div className="ai-avatar">{message.sender_avatar || '🤔'}</div>
        <div>
          <div className="role-label">{message.sender_name || 'AI'} 思考中...</div>
          <div className="bubble ai"><div className="thinking-dots"><span /><span /><span /></div></div>
        </div>
      </div>
    )
  }
  if (message.sender_type === 'system') {
    return <div className="message-row system"><div className="bubble system">{message.content}</div></div>
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
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{message.sender_name}</span>
            {message.role_in_mode && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 10, border: '1px solid var(--border)' }}>
                {message.role_in_mode}
              </span>
            )}
            {message.metadata?.model && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {String(message.metadata.model).startsWith('ep-')
                  ? String(message.metadata.display_model || message.metadata.model)
                  : String(message.metadata.model)}
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

function MemberDropdown({ members, selected, onToggle, onClose, onManage }: {
  members: AIMember[]; selected: string[]; onToggle: (id: string) => void; onClose: () => void; onManage: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onClose} />
      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 240, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 8, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px 8px', fontWeight: 500 }}>选择参与的 AI 成员</div>
        {members.length === 0 && <div style={{ padding: '8px', fontSize: 12, color: 'var(--text-muted)' }}>暂无可用 AI 成员</div>}
        {members.map((m) => (
          <div key={m.id} onClick={() => onToggle(m.type === 'user' ? `${m.id}:user` : m.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px', borderRadius: 8, cursor: 'pointer', background: (selected.includes(m.id) || selected.includes(`${m.id}:user`)) ? 'var(--accent-glow)' : 'transparent', border: (selected.includes(m.id) || selected.includes(`${m.id}:user`)) ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent', marginBottom: 2 }}>
            <div style={{ fontSize: 20 }}>{m.custom_avatar || m.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.custom_name || m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{String(m.model).startsWith('ep-') ? m.name : m.model}</div>
            </div>
            <div className={`status-dot ${(selected.includes(m.id) || selected.includes(`${m.id}:user`)) ? 'online' : 'offline'}`} />
          </div>
        ))}
        <div className="divider" style={{ margin: '6px 0' }} />
        <div onClick={() => { onClose(); onManage() }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px', borderRadius: 8, cursor: 'pointer', color: 'var(--accent-hover)', fontSize: 13 }}>
          <UserPlus size={14} /> 管理私人 AI
        </div>
      </div>
    </>
  )
}

function ModeDropdown({ modes, activeMode, onSelect, onClose }: {
  modes: DynamicMode[]; activeMode: string; onSelect: (mode: string) => void; onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onClose} />
      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 230, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 8, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxHeight: 400, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px 8px', fontWeight: 500 }}>聊天模式</div>
        {modes.length === 0 && <div style={{ padding: '8px', fontSize: 12, color: 'var(--text-muted)' }}>暂无可用模式</div>}
        {modes.map((mode) => {
          const style = BUILTIN_MODE_STYLE[mode.mode_key] || { icon: MessageCircle, color: '#818cf8' }
          const Icon = style.icon
          const isDiscussion = mode.mode_key === 'discussion' || mode.config?.discussion_mode === true
          return (
            <div key={mode.mode_key} onClick={() => onSelect(mode.mode_key)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', background: activeMode === mode.mode_key ? 'var(--accent-glow)' : 'transparent', border: activeMode === mode.mode_key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent', marginBottom: 2 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${style.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={14} color={style.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {mode.mode_name}
                  {isDiscussion && <span style={{ fontSize: 10, color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', padding: '0 4px', borderRadius: 4 }}>讨论</span>}
                </div>
                {mode.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mode.description}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
