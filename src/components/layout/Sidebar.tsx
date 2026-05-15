import { useState } from 'react'
import { Plus, Archive, Settings, Search, ChevronDown, ChevronRight, Edit2, Trash2, Pin, LogOut, Shield, SlidersHorizontal } from 'lucide-react'
import { useChatStore } from '@/lib/chat'
import { useAuthStore } from '@/lib/auth'
import type { ChatSession, ChatMode } from '@/types'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

const MODE_LABELS: Record<ChatMode, string> = {
  normal: '普通',
  judge: '主审官',
  bidding: '竞标',
  shadow: '影子',
  rollcall: '点名',
}

const MODE_COLORS: Record<ChatMode, string> = {
  normal: '#818cf8',
  judge: '#fbbf24',
  bidding: '#34d399',
  shadow: '#a78bfa',
  rollcall: '#f472b6',
}

export default function Sidebar() {
  const { sessions, currentSession, setCurrentSession, createSession, updateSessionTitle, deleteSession, archiveSession } = useChatStore()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())

  const handleNew = async () => {
    try {
      const session = await createSession('normal')
      setCurrentSession(session)
    } catch {
      toast.error('创建失败')
    }
  }

  const handleEdit = (s: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(s.id)
    setEditTitle(s.title)
  }

  const handleEditSave = async (id: string) => {
    if (editTitle.trim()) {
      await updateSessionTitle(id, editTitle.trim())
    }
    setEditingId(null)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确认删除这个会话吗？')) return
    await deleteSession(id)
    toast.success('已删除')
  }

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await archiveSession(id)
    toast.success('已归档')
  }

  const filtered = sessions.filter((s) => {
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase())
    const matchArchive = showArchived ? s.is_archived : !s.is_archived
    return matchSearch && matchArchive
  })

  // 按分类分组
  const pinned = filtered.filter((s) => s.is_pinned)
  const unpinned = filtered.filter((s) => !s.is_pinned)

  const allCategories = Array.from(new Set(unpinned.map((s) => s.category || '未分类')))

  const toggleCat = (cat: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div className="sidebar">
      {/* 顶部 */}
      <div className="sidebar-header">
        <span style={{ fontWeight: 600, fontSize: 15 }}>AI Chat Hub</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={handleNew} title="新对话">
            <Plus size={16} />
          </button>
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => navigate('/settings')} title="设置">
            <SlidersHorizontal size={16} />
          </button>
          {user?.role === 'admin' && (
            <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => navigate('/admin')} title="管理后台">
              <Shield size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 搜索 */}
      <div style={{ padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            placeholder="搜索会话..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 13, padding: '8px 12px 8px 30px' }}
          />
        </div>
      </div>

      {/* 归档切换 */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 8px', flexShrink: 0 }}>
        <button
          className={`tab ${!showArchived ? 'active' : ''}`}
          style={{ flex: 1, fontSize: 12 }}
          onClick={() => setShowArchived(false)}
        >
          会话
        </button>
        <button
          className={`tab ${showArchived ? 'active' : ''}`}
          style={{ flex: 1, fontSize: 12 }}
          onClick={() => setShowArchived(true)}
        >
          <Archive size={12} style={{ marginRight: 4 }} />
          归档
        </button>
      </div>

      {/* 会话列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
        {/* 置顶 */}
        {pinned.length > 0 && (
          <>
            <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Pin size={11} /> 置顶
            </div>
            {pinned.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                isActive={currentSession?.id === s.id}
                isEditing={editingId === s.id}
                editTitle={editTitle}
                onSelect={() => setCurrentSession(s)}
                onEdit={(e) => handleEdit(s, e)}
                onEditChange={setEditTitle}
                onEditSave={() => handleEditSave(s.id)}
                onDelete={(e) => handleDelete(s.id, e)}
                onArchive={(e) => handleArchive(s.id, e)}
              />
            ))}
            <div className="divider" style={{ margin: '8px 12px' }} />
          </>
        )}

        {/* 按分类显示 */}
        {allCategories.map((cat) => {
          const catSessions = unpinned.filter((s) => (s.category || '未分类') === cat)
          if (catSessions.length === 0) return null
          const collapsed = collapsedCats.has(cat)

          return (
            <div key={cat}>
              {allCategories.length > 1 && (
                <button
                  onClick={() => toggleCat(cat)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 500,
                    textAlign: 'left',
                  }}
                >
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {cat} ({catSessions.length})
                </button>
              )}
              {!collapsed &&
                catSessions.map((s) => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    isActive={currentSession?.id === s.id}
                    isEditing={editingId === s.id}
                    editTitle={editTitle}
                    onSelect={() => setCurrentSession(s)}
                    onEdit={(e) => handleEdit(s, e)}
                    onEditChange={setEditTitle}
                    onEditSave={() => handleEditSave(s.id)}
                    onDelete={(e) => handleDelete(s.id, e)}
                    onArchive={(e) => handleArchive(s.id, e)}
                  />
                ))}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <p style={{ fontSize: 13 }}>
              {showArchived ? '暂无归档会话' : '还没有对话，点击 + 开始'}
            </p>
          </div>
        )}
      </div>

      {/* 底部用户信息 */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: 'white',
            fontWeight: 600,
          }}
        >
          {(user?.display_name || user?.email || 'U')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.display_name || user?.email}
          </div>
          {user?.role === 'admin' && (
            <div style={{ fontSize: 11, color: '#fbbf24' }}>管理员</div>
          )}
        </div>
        <button
          className="btn btn-ghost"
          style={{ padding: '6px', border: 'none' }}
          onClick={() => {
            logout()
            navigate('/auth')
          }}
          title="退出登录"
        >
          <LogOut size={15} />
        </button>
      </div>
    </div>
  )
}

// 单个会话项
function SessionItem({
  session, isActive, isEditing, editTitle,
  onSelect, onEdit, onEditChange, onEditSave, onDelete, onArchive,
}: {
  session: ChatSession
  isActive: boolean
  isEditing: boolean
  editTitle: string
  onSelect: () => void
  onEdit: (e: React.MouseEvent) => void
  onEditChange: (v: string) => void
  onEditSave: () => void
  onDelete: (e: React.MouseEvent) => void
  onArchive: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={`session-item ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span
          className={`mode-badge ${session.chat_mode}`}
          style={{ fontSize: 10, padding: '1px 6px' }}
        >
          {MODE_LABELS[session.chat_mode]}
        </span>
        {hovered && !isEditing && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            <button
              onClick={onEdit}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
              title="重命名"
            >
              <Edit2 size={12} />
            </button>
            <button
              onClick={onArchive}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
              title="归档"
            >
              <Archive size={12} />
            </button>
            <button
              onClick={onDelete}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }}
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <input
          autoFocus
          className="form-input"
          value={editTitle}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditSave}
          onKeyDown={(e) => { if (e.key === 'Enter') onEditSave(); if (e.key === 'Escape') onEditSave() }}
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 13, padding: '4px 8px' }}
        />
      ) : (
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.title}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
        {formatDistanceToNow(new Date(session.updated_at), { addSuffix: true, locale: zhCN })}
      </div>
    </div>
  )
}
