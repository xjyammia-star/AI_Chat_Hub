import { useEffect } from 'react'
import { useChatStore } from '@/lib/chat'
import Sidebar from '@/components/layout/Sidebar'
import ChatArea from '@/components/layout/ChatArea'

export default function ChatPage() {
  const loadSessions = useChatStore((s) => s.loadSessions)

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

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
        <Sidebar />
        <ChatArea />
      </div>
    </div>
  )
}
