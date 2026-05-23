import { useEffect, useRef, useState } from 'react'
import { Send, Settings2, Zap, Crown, Target, Eye, Radio, MessageCircle, StopCircle, ThumbsUp, ThumbsDown, UserPlus, Menu, Users, X } from 'lucide-react'
import TextareaAutosize from 'react-textarea-autosize'
import { useChatStore, discussionState } from '@/lib/chat'
import type { ChatMessage, ChatMode, AIMember } from '@/types'
import { getTitleInfo } from '@/types'
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

interface ChatAreaProps {
  onMenuClick?: () => void
}

export default function ChatArea({ onMenuClick }: ChatAreaProps) {
  const {
    currentSession, messages, isSending, activeMode, selectedAIIds,
    setActiveMode, toggleAIMember, sendMessage, createSession, setCurrentSession,
    reputationScores, loadReputationScores, reactToMessage,
  } = useChatStore()

  const [input, setInput] = useState('')
  const [aiMembers, setAiMembers] = useState<AIMember[]>([])
  const [modes, setModes] = useState<DynamicMode[]>([])
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [showUserAIModal, setShowUserAIModal] = useState(false)
  const [showRightPanel, setShowRightPanel] = useState(false) // 手机上右侧面板弹出
  const [mentionedIds, setMentionedIds] = useState<string[]>([])
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [isDiscussionRunning, setIsDiscussionRunning] = useState(false)
  const [reactingIds, setReactingIds] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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

  useEffect(() => {
    loadMembers()
    loadModes()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const handleReact = async (messageId: string, reaction: 'up' | 'down') => {
    if (reactingIds.has(messageId)) return
    setReactingIds(prev => new Set(prev).add(messageId))
    try {
      await reactToMessage(messageId, reaction)
      await loadReputationScores()
    } finally {
      setReactingIds(prev => { const s = new Set(prev); s.delete(messageId); return s })
    }
  }

  const mentionFilteredMembers = aiMembers.filter((m) =>
    m.is_enabled && (mentionQuery === '' || (m.custom_name || m.name).toLowerCase().includes(mentionQuery.toLowerCase()))
  )

  const activeModeInfo = modes.find(m => m.mode_key === activeMode)
  const activeModeStyle = BUILTIN_MODE_STYLE[activeMode] || { icon: MessageCircle, color: '#818cf8' }
  const ActiveModeIcon = activeModeStyle.icon
  const isDiscussionMode = (activeMode as string) === 'discussion' || activeModeInfo?.config?.discussion_mode === true

  const activeMembers = aiMembers.filter(m =>
    selectedAIIds.includes(m.id) || selectedAIIds.includes(`${m.id}:user`)
  )

  if (!currentSession) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="chat-area" style={{ flex: 1 }}>
          {/* 手机顶栏 */}
          <div className="chat-header">
            <button className="btn btn-ghost" style={{ padding: '6px 8px', border: 'none' }} onClick={onMenuClick}>
              <Menu size={18} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1, textAlign: 'center' }}>AI Chat Hub</span>
            <button className="btn btn-ghost" style={{ padding: '6px 8px', border: 'none' }}
              onClick={() => setShowRightPanel(true)}>
              <Users size={16} />
            </button>
          </div>
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-secondary)' }}>选择或新建一个对话</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280 }}>
              {modes.length > 0 ? `支持 ${modes.length} 种对话模式` : '支持多种对话模式'}
            </p>
            <button className="btn btn-primary" onClick={async () => {
              const session = await createSession('normal')
              setCurrentSession(session)
            }}>
              <Zap size={14} /> 开始新对话
            </button>
          </div>
        </div>

        {/* 桌面右侧栏 */}
        <div className="desktop-right-panel">
          <RightPanel
            aiMembers={aiMembers} selectedAIIds={selectedAIIds}
            mentionedIds={mentionedIds} reputationScores={reputationScores}
            onToggleMention={(id) => {
              if (mentionedIds.includes(id)) setMentionedIds(mentionedIds.filter(x => x !== id))
              else setMentionedIds([...mentionedIds, id])
            }}
            onManage={() => setShowUserAIModal(true)}
          />
        </div>

        {/* 手机右侧面板弹窗 */}
        {showRightPanel && (
          <RightPanelModal
            aiMembers={aiMembers} selectedAIIds={selectedAIIds}
            mentionedIds={mentionedIds} reputationScores={reputationScores}
            onToggleMention={(id) => {
              if (mentionedIds.includes(id)) setMentionedIds(mentionedIds.filter(x => x !== id))
              else setMentionedIds([...mentionedIds, id])
            }}
            onManage={() => { setShowUserAIModal(true); setShowRightPanel(false) }}
            onClose={() => setShowRightPanel(false)}
          />
        )}
        {showUserAIModal && <UserAIModal onClose={() => setShowUserAIModal(false)} onSaved={loadMembers} />}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minWidth: 0 }}>
      <div className="chat-area" style={{ flex: 1, minWidth: 0 }}>

        {/* 顶栏 */}
        <div className="chat-header">
          {/* 手机汉堡按钮 */}
          <button
            className="btn btn-ghost"
            style={{ padding: '6px 8px', border: 'none', flexShrink: 0 }}
            onClick={onMenuClick}
            title="菜单"
          >
            <Menu size={18} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentSession.title}
            </h2>
            <span className={`mode-badge ${activeMode}`} style={{ flexShrink: 0 }}>
              <ActiveModeIcon size={11} />
              <span className="hide-on-mobile">{activeModeInfo?.mode_name || activeMode}</span>
            </span>
            {isDiscussionRunning && (
              <span style={{ fontSize: 11, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                <span className="hide-on-mobile">讨论进行中</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {isDiscussionRunning && (
              <button className="btn btn-danger" style={{ gap: 4, fontSize: 12, padding: '6px 10px' }} onClick={handleStopDiscussion}>
                <StopCircle size={13} />
                <span className="hide-on-mobile">停止讨论</span>
              </button>
            )}
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost" style={{ gap: 4, fontSize: 12, padding: '6px 10px' }}
                onClick={() => setShowModeMenu(!showModeMenu)}>
                <Settings2 size={14} />
                <span className="hide-on-mobile">模式</span>
              </button>
              {showModeMenu && (
                <ModeDropdown modes={modes} activeMode={activeMode}
                  onSelect={(mode) => { setActiveMode(mode as ChatMode); setShowModeMenu(false) }}
                  onClose={() => setShowModeMenu(false)} />
              )}
            </div>
            {/* 手机成员按钮 */}
            <button
              className="btn btn-ghost show-on-mobile"
              style={{ gap: 4, fontSize: 12, padding: '6px 10px' }}
              onClick={() => setShowRightPanel(true)}
            >
              <Users size={14} />
              <span style={{ fontSize: 11 }}>{activeMembers.length}</span>
            </button>
          </div>
        </div>

        {/* 消息区 */}
        <div className="messages-container">
          {messages.length === 0 && (
            <div className="empty-state" style={{ flex: 1 }}>
              <p style={{ fontSize: 13, textAlign: 'center', padding: '0 20px' }}>
                {isDiscussionMode
                  ? '发送消息启动讨论，AI 们会自动轮流发言'
                  : '发送消息开始对话'}
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageRow key={msg.id} message={msg} onReact={handleReact} isReacting={reactingIds.has(msg.id)} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="input-area">
          {showMentionMenu && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, marginBottom: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', maxHeight: 200, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px 6px', fontWeight: 500 }}>@ 提及</div>
              <div onClick={() => handleMention(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: 16 }}>👥</span> 所有人（默认）
              </div>
              {mentionFilteredMembers.map((m) => (
                <div key={m.id} onClick={() => handleMention(m)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontSize: 16 }}>{m.custom_avatar || m.avatar}</span>
                  {m.custom_name || m.name}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <TextareaAutosize
              ref={inputRef}
              className="input-box"
              placeholder={
                isDiscussionRunning ? '讨论进行中...'
                : isDiscussionMode ? '发送消息启动讨论...'
                : '发送消息... (@ 提及成员)'
              }
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              minRows={1}
              maxRows={5}
              disabled={isSending || isDiscussionRunning}
            />
            <button className="btn btn-primary" onClick={handleSend}
              disabled={!input.trim() || isSending || isDiscussionRunning}
              style={{ padding: '10px 14px', flexShrink: 0 }}>
              {isSending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Send size={16} />}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, textAlign: 'right' }}>
            {isDiscussionRunning ? '讨论进行中' : 'Ctrl+Enter 发送 · @ 提及成员'}
          </div>
        </div>
      </div>

      {/* 桌面右侧爵位栏 */}
      <div className="desktop-right-panel">
        <RightPanel
          aiMembers={aiMembers} selectedAIIds={selectedAIIds}
          mentionedIds={mentionedIds} reputationScores={reputationScores}
          onToggleMention={(id) => {
            if (mentionedIds.includes(id)) setMentionedIds(mentionedIds.filter(x => x !== id))
            else setMentionedIds([...mentionedIds, id])
          }}
          onManage={() => setShowUserAIModal(true)}
        />
      </div>

      {/* 手机右侧面板弹窗 */}
      {showRightPanel && (
        <RightPanelModal
          aiMembers={aiMembers} selectedAIIds={selectedAIIds}
          mentionedIds={mentionedIds} reputationScores={reputationScores}
          onToggleMention={(id) => {
            if (mentionedIds.includes(id)) setMentionedIds(mentionedIds.filter(x => x !== id))
            else setMentionedIds([...mentionedIds, id])
          }}
          onManage={() => { setShowUserAIModal(true); setShowRightPanel(false) }}
          onClose={() => setShowRightPanel(false)}
        />
      )}

      {showUserAIModal && (
        <UserAIModal onClose={() => setShowUserAIModal(false)} onSaved={loadMembers} />
      )}
    </div>
  )
}

// ---- 桌面右侧栏（CSS 控制在手机上隐藏） ----
function RightPanel({ aiMembers, selectedAIIds, mentionedIds, reputationScores, onToggleMention, onManage }: RightPanelProps) {
  const activeMembers = aiMembers.filter(m =>
    selectedAIIds.includes(m.id) || selectedAIIds.includes(`${m.id}:user`)
  )
  return (
    <div style={{ width: 200, flexShrink: 0, background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>成员 ({activeMembers.length})</span>
        <button onClick={onManage} title="管理私人AI" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
          <UserPlus size={13} />
        </button>
      </div>
      <div style={{ padding: '6px 14px 4px', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        点击成员 = @指定，不选 = @所有人
      </div>
      <MemberList aiMembers={activeMembers} mentionedIds={mentionedIds} reputationScores={reputationScores} onToggle={onToggleMention} />
    </div>
  )
}

// ---- 手机右侧面板弹窗（从右侧滑入） ----
interface RightPanelProps {
  aiMembers: AIMember[]; selectedAIIds: string[]; mentionedIds: string[]
  reputationScores: Record<string, number>
  onToggleMention: (id: string) => void; onManage: () => void
}
interface RightPanelModalProps extends RightPanelProps { onClose: () => void }

function RightPanelModal({ aiMembers, selectedAIIds, mentionedIds, reputationScores, onToggleMention, onManage, onClose }: RightPanelModalProps) {
  const activeMembers = aiMembers.filter(m =>
    selectedAIIds.includes(m.id) || selectedAIIds.includes(`${m.id}:user`)
  )
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 180, backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(280px, 85vw)', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', zIndex: 181, display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.25s ease' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>成员 ({activeMembers.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onManage} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <UserPlus size={16} />
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--text-muted)' }}>
          点击成员 = @指定，不选 = @所有人
        </div>
        <MemberList aiMembers={activeMembers} mentionedIds={mentionedIds} reputationScores={reputationScores} onToggle={onToggleMention} />
      </div>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </>
  )
}

// ---- 成员列表（桌面和手机共用） ----
function MemberList({ aiMembers, mentionedIds, reputationScores, onToggle }: {
  aiMembers: AIMember[]; mentionedIds: string[]
  reputationScores: Record<string, number>; onToggle: (id: string) => void
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 8px' }}>
      {/* 所有人 */}
      <div onClick={() => {}} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: mentionedIds.length === 0 ? 'rgba(99,102,241,0.12)' : 'transparent', border: `1px solid ${mentionedIds.length === 0 ? 'rgba(99,102,241,0.35)' : 'transparent'}` }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>👥</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: mentionedIds.length === 0 ? 'var(--accent-hover)' : 'var(--text-secondary)' }}>所有人</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>默认</div>
        </div>
        {mentionedIds.length === 0 && <span style={{ fontSize: 11, color: 'var(--accent-hover)' }}>✓</span>}
      </div>

      {aiMembers.map((m) => {
        const score = reputationScores[m.id] ?? 0
        const titleInfo = getTitleInfo(score)
        const isSelected = mentionedIds.includes(m.id)
        return (
          <div key={m.id} onClick={() => onToggle(m.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent', border: `1px solid ${isSelected ? 'rgba(99,102,241,0.35)' : 'transparent'}`, transition: 'all 0.15s' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, border: isSelected ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--border)' }}>
                {m.custom_avatar || m.avatar}
              </div>
              <div style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 4px var(--green)', border: '1px solid var(--bg-secondary)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: isSelected ? 'var(--accent-hover)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.custom_name || m.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                <span style={{ fontSize: 12 }}>{titleInfo.icon}</span>
                <span style={{ fontSize: 11, color: titleInfo.color, fontWeight: 500 }}>{titleInfo.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{score}分</span>
              </div>
            </div>
            {isSelected && <span style={{ fontSize: 11, color: 'var(--accent-hover)', flexShrink: 0 }}>✓</span>}
          </div>
        )
      })}

      {aiMembers.length === 0 && (
        <div style={{ padding: '16px 8px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          暂无启用的 AI 成员
        </div>
      )}
    </div>
  )
}

// ---- 消息行 ----
function MessageRow({ message, onReact, isReacting }: {
  message: ChatMessage; onReact: (id: string, reaction: 'up' | 'down') => void; isReacting: boolean
}) {
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
  const isReactionReply = message.metadata?.is_reaction_reply === true

  return (
    <div className={`message-row ${isUser ? 'user' : 'ai'} fade-in`}>
      {!isUser && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div className="ai-avatar">{message.sender_avatar || '🤖'}</div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 4px var(--green)' }} />
        </div>
      )}
      <div style={{ maxWidth: '100%', minWidth: 0 }}>
        {!isUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
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

        {/* 👍👎 按钮 */}
        {!isUser && !isReactionReply && !message.metadata?.thinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
            <button onClick={() => onReact(message.id, 'up')} disabled={isReacting} title="点赞 +10分"
              style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', cursor: isReacting ? 'not-allowed' : 'pointer', fontSize: 11, color: 'var(--text-muted)', opacity: isReacting ? 0.5 : 1, minHeight: 28 }}
              onMouseEnter={(e) => { if (!isReacting) { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.color = '#10b981' } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
              <ThumbsUp size={12} /> +10
            </button>
            <button onClick={() => onReact(message.id, 'down')} disabled={isReacting} title="不满意 -10分"
              style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', cursor: isReacting ? 'not-allowed' : 'pointer', fontSize: 11, color: 'var(--text-muted)', opacity: isReacting ? 0.5 : 1, minHeight: 28 }}
              onMouseEnter={(e) => { if (!isReacting) { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
              <ThumbsDown size={12} /> -10
            </button>
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, textAlign: isUser ? 'right' : 'left' }}>
          {new Date(message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

function ModeDropdown({ modes, activeMode, onSelect, onClose }: {
  modes: DynamicMode[]; activeMode: string; onSelect: (mode: string) => void; onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onClose} />
      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 220, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 8, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxHeight: 360, overflowY: 'auto' }}>
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
                {mode.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mode.description}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
