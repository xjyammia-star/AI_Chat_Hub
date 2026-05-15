import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth'
import toast from 'react-hot-toast'
import { Eye, EyeOff, MessageSquare } from 'lucide-react'

export default function AuthPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const { login, register, isLoading } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (tab === 'login') {
        await login(email, password)
        toast.success('登录成功')
        navigate('/')
      } else {
        await register(email, password, displayName, isAdmin ? inviteCode : undefined)
        toast.success('注册成功，欢迎加入！')
        navigate('/')
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || '操作失败')
    }
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07070f',
      }}
    >
      <div
        style={{
          width: 420,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '40px 36px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <MessageSquare size={28} color="white" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
            AI Chat Hub
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            多模型 AI 群组聊天
          </p>
        </div>

        {/* 标签页 */}
        <div className="tabs" style={{ marginBottom: 24 }}>
          <div
            className={`tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => setTab('login')}
          >
            登录
          </div>
          <div
            className={`tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => setTab('register')}
          >
            注册
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 注册时显示昵称 */}
          {tab === 'register' && (
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">昵称</label>
              <input
                className="form-input"
                placeholder="你的显示名称"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label className="form-label">邮箱</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 16, position: 'relative' }}>
            <label className="form-label">密码</label>
            <input
              className="form-input"
              type={showPw ? 'text' : 'password'}
              placeholder={tab === 'register' ? '至少 8 位' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={tab === 'register' ? 8 : undefined}
              required
              style={{ paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              style={{
                position: 'absolute',
                right: 12,
                bottom: 10,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* 注册时的管理员邀请码 */}
          {tab === 'register' && (
            <>
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="isAdmin"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <label htmlFor="isAdmin" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  我是管理员（需要邀请码）
                </label>
              </div>
              {isAdmin && (
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label">管理员邀请码</label>
                  <input
                    className="form-input"
                    placeholder="请输入管理员邀请码"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required={isAdmin}
                  />
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px' }}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="spinner" style={{ width: 18, height: 18 }} />
            ) : tab === 'login' ? (
              '登录'
            ) : (
              '注册账号'
            )}
          </button>
        </form>

        {tab === 'login' && (
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            还没有账号？点击上方「注册」标签创建
          </p>
        )}
      </div>
    </div>
  )
}
