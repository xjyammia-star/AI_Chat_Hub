// ============================================
// Chat Store (Zustand)
// ============================================

import { create } from 'zustand'
import type { ChatState, ChatSession, ChatMessage, ChatMode } from '@/types'
import { apiRequest } from './auth'

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  isLoading: false,
  isSending: false,
  activeMode: 'normal',
  selectedAIIds: [],

  setCurrentSession: (session) => {
    set({ currentSession: session, messages: [] })
    if (session) get().loadMessages(session.id)
  },

  setActiveMode: (mode) => set({ activeMode: mode }),

  toggleAIMember: (id) => {
    const current = get().selectedAIIds
    if (current.includes(id)) {
      set({ selectedAIIds: current.filter((x) => x !== id) })
    } else {
      set({ selectedAIIds: [...current, id] })
    }
  },

  loadSessions: async () => {
    set({ isLoading: true })
    try {
      const res = await apiRequest('/chat/sessions')
      if (!res.ok) throw new Error('Failed to load sessions')
      const data = await res.json()
      set({ sessions: data.sessions, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  loadMessages: async (sessionId) => {
    set({ isLoading: true })
    try {
      const res = await apiRequest(`/chat/messages?session_id=${sessionId}`)
      if (!res.ok) throw new Error('Failed to load messages')
      const data = await res.json()
      set({ messages: data.messages, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  sendMessage: async (content) => {
    const { currentSession, activeMode, selectedAIIds } = get()
    if (!currentSession || !content.trim()) return

    // 乐观更新：先显示用户消息
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: currentSession.id,
      sender_type: 'user',
      sender_name: '我',
      content,
      created_at: new Date().toISOString(),
    }
    set((state) => ({
      messages: [...state.messages, tempUserMsg],
      isSending: true,
    }))

    // 添加"正在思考"占位消息
    const thinkingMsg: ChatMessage = {
      id: `thinking-${Date.now()}`,
      session_id: currentSession.id,
      sender_type: 'system',
      sender_name: 'system',
      content: '...',
      metadata: { thinking: true },
      created_at: new Date().toISOString(),
    }
    set((state) => ({ messages: [...state.messages, thinkingMsg] }))

    try {
      const res = await apiRequest('/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          session_id: currentSession.id,
          content,
          mode: activeMode,
          selected_ai_ids: selectedAIIds,
        }),
      })

      if (!res.ok) throw new Error('发送失败')
      const data = await res.json()

      // 替换占位消息，加入真实 AI 回复
      set((state) => ({
        messages: [
          ...state.messages.filter((m) => !m.metadata?.thinking),
          ...data.messages,
        ],
        isSending: false,
      }))

      // 更新会话列表（刷新 updated_at）
      get().loadSessions()
    } catch (e) {
      set((state) => ({
        messages: state.messages.filter((m) => !m.metadata?.thinking),
        isSending: false,
      }))
      throw e
    }
  },

  createSession: async (mode = 'normal') => {
    const res = await apiRequest('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    })
    if (!res.ok) throw new Error('创建会话失败')
    const data = await res.json()
    set((state) => ({ sessions: [data.session, ...state.sessions] }))
    return data.session
  },

  updateSessionTitle: async (id, title) => {
    await apiRequest(`/chat/sessions`, {
      method: 'PUT',
      body: JSON.stringify({ id, title }),
    })
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
      currentSession: state.currentSession?.id === id
        ? { ...state.currentSession, title }
        : state.currentSession,
    }))
  },

  deleteSession: async (id) => {
    await apiRequest(`/chat/sessions`, {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      currentSession: state.currentSession?.id === id ? null : state.currentSession,
      messages: state.currentSession?.id === id ? [] : state.messages,
    }))
  },

  archiveSession: async (id) => {
    await apiRequest('/chat/sessions', {
      method: 'PUT',
      body: JSON.stringify({ id, is_archived: true }),
    })
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, is_archived: true } : s
      ),
    }))
  },
}))
