// ============================================
// Chat Store (Zustand)
// ============================================

import { create } from 'zustand'
import type { ChatState, ChatSession, ChatMessage, ChatMode } from '@/types'
import { apiRequest } from './auth'

// 浏览器直接调用本地 Ollama
async function callOllamaLocal(params: {
  name: string, avatar: string, model: string,
  base_url: string, system_prompt?: string,
  messages: Array<{ role: string; content: string }>
}): Promise<string> {
  const { model, base_url, system_prompt, messages } = params
  const allMessages = system_prompt
    ? [{ role: 'system', content: system_prompt }, ...messages]
    : messages
  const url = `${base_url.replace(/\/v1$/, '')}/api/chat`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: allMessages, stream: false }),
  })
  if (!resp.ok) throw new Error(`Ollama ${resp.status} — 请确认已设置 OLLAMA_ORIGINS=* 并重启`)
  const data = await resp.json()
  return data.message?.content || ''
}

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
      // 去重：避免重复添加
      if (!current.includes(id)) {
        set({ selectedAIIds: [...current, id] })
      }
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

    // 添加"正在思考"占位消息（不提前显示用户消息，等服务端返回）
    const thinkingMsg: ChatMessage = {
      id: `thinking-${Date.now()}`,
      session_id: currentSession.id,
      sender_type: 'system',
      sender_name: 'system',
      content: '...',
      metadata: { thinking: true },
      created_at: new Date().toISOString(),
    }
    set((state) => ({ messages: [...state.messages, thinkingMsg], isSending: true }))

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

      // 替换占位消息，加入服务端 AI 回复
      set((state) => ({
        messages: [
          ...state.messages.filter((m) => !m.metadata?.thinking),
          ...data.messages,
        ],
        isSending: false,
      }))

      // 如果有本地 AI 需要前端直接调用
      if (data.local_ai_calls && data.local_ai_calls.length > 0) {
        const sessionMessages = get().messages
          .filter((m) => m.sender_type !== 'system' && !m.metadata?.thinking)
          .map((m) => ({ role: m.sender_type === 'user' ? 'user' : 'assistant', content: m.content }))

        for (const localAI of data.local_ai_calls) {
          // 添加思考中占位
          const thinkingId = `thinking-local-${localAI.id}`
          set((state) => ({
            messages: [...state.messages, {
              id: thinkingId, session_id: currentSession!.id,
              sender_type: 'ai' as const, sender_name: localAI.name,
              sender_avatar: localAI.avatar, content: '...',
              metadata: { thinking: true }, created_at: new Date().toISOString(),
            }]
          }))

          try {
            const reply = await callOllamaLocal({
              name: localAI.name, avatar: localAI.avatar,
              model: localAI.model, base_url: localAI.base_url,
              system_prompt: localAI.system_prompt,
              messages: sessionMessages,
            })
            // 保存到数据库
            let savedMsg: ChatMessage | null = null
            try {
              const saveRes = await apiRequest('/chat/save_local', {
                method: 'POST',
                body: JSON.stringify({
                  session_id: currentSession!.id,
                  sender_id: localAI.id,
                  sender_name: localAI.name,
                  sender_avatar: localAI.avatar,
                  content: reply,
                  model: localAI.model,
                }),
              })
              if (saveRes.ok) {
                const saveData = await saveRes.json()
                savedMsg = saveData.message
              }
            } catch { /* 保存失败不影响显示 */ }

            const localMsg: ChatMessage = savedMsg || {
              id: `local-${localAI.id}-${Date.now()}`,
              session_id: currentSession!.id,
              sender_type: 'ai', sender_id: localAI.id,
              sender_name: localAI.name, sender_avatar: localAI.avatar,
              content: reply, metadata: { model: localAI.model },
              created_at: new Date().toISOString(),
            }
            set((state) => ({
              messages: [...state.messages.filter((m) => m.id !== thinkingId), localMsg]
            }))
          } catch (err) {
            const errMsg: ChatMessage = {
              id: `local-err-${localAI.id}-${Date.now()}`,
              session_id: currentSession!.id,
              sender_type: 'ai', sender_name: localAI.name,
              sender_avatar: localAI.avatar,
              content: `❌ 本地模型调用失败: ${(err as Error).message}`,
              created_at: new Date().toISOString(),
            }
            set((state) => ({
              messages: [...state.messages.filter((m) => m.id !== thinkingId), errMsg]
            }))
          }
        }
      }

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
