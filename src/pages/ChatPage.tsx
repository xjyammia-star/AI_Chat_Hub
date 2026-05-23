import { useEffect, useState } from 'react'
import { useChatStore } from '@/lib/chat'
import Sidebar from '@/components/layout/Sidebar'
import ChatArea from '@/components/layout/ChatArea'

export default function ChatPage() {
  const loadSessions = useChatStore((s) => s.loadSessions)
  const loadReputationScores = useChatStore((s) => s.loadReputationScores)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    loadSessions()
    loadReputationScores()
  }, [])

  // 判断是否手机（用于决定侧边栏行为）
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

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
      <div className="app-window">
        <Sidebar
          isOpen={isMobile ? sidebarOpen : true}
          onClose={isMobile ? () => setSidebarOpen(false) : undefined}
        />
        <ChatArea
          onMenuClick={() => setSidebarOpen(true)}
        />
      </div>
    </div>
  )
}
