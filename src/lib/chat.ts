// src/lib/chat.ts
import { create } from 'zustand'
import type { ChatState, ChatSession, ChatMessage, ChatMode } from '@/types'
import { apiRequest, useAuthStore } from './auth'

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

  // 所有模式统一走 SSE
  sendMessage: async (content) => {
    const { currentSession, activeMode, selectedAIIds } = get()
    if (!currentSession || !content.trim()) return

    set({ isSending: true })
    await handleSSESend(content, currentSession, activeMode, selectedAIIds, set, get)
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

// ---- 统一 SSE 发送处理 ----
async function handleSSESend(
  content: string,
  currentSession: ChatSession,
  activeMode: string,
  selectedAIIds: string[],
  set: any,
  get: any
) {
  const token = useAuthStore.getState().token

  let response: Response
  try {
    response = await fetch('/api/chat/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        session_id: currentSession.id,
        content,
        mode: activeMode,
        selected_ai_ids: selectedAIIds,
      }),
    })
  } catch (e) {
    set({ isSending: false })
    throw e
  }

  if (!response.ok) {
    set({ isSending: false })
    throw new Error('发送失败')
  }

  const reader = response.body?.getReader()
  if (!reader) {
    set({ isSending: false })
    throw new Error('不支持流式响应')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  // 记录每个 AI 的思考中气泡 id，收到真实消息时替换
  const thinkingIds: Record<string, string> = {}

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        const lines = part.trim().split('\n')
        let eventType = 'message'
        let dataStr = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          if (line.startsWith('data: ')) dataStr = line.slice(6).trim()
        }

        if (!dataStr) continue

        try {
          const data = JSON.parse(dataStr)

          if (eventType === 'thinking') {
            // 显示某个 AI 的思考中气泡
            const thinkingId = `thinking-${data.ai_id}-${Date.now()}`
            thinkingIds[data.ai_id] = thinkingId
            const thinkingMsg: ChatMessage = {
              id: thinkingId,
              session_id: currentSession.id,
              sender_type: 'ai',
              sender_name: data.ai_name,
              sender_avatar: data.ai_avatar,
              content: '...',
              metadata: { thinking: true },
              created_at: new Date().toISOString(),
            }
            set((state: any) => ({ messages: [...state.messages, thinkingMsg] }))

          } else if (eventType === 'message') {
            // 收到真实消息，替换对应的思考中气泡
            // 通过 sender_id 匹配
            const thinkingId = data.sender_id ? thinkingIds[data.sender_id] : null
            if (thinkingId) delete thinkingIds[data.sender_id]

            set((state: any) => {
              const filtered = thinkingId
                ? state.messages.filter((m: ChatMessage) => m.id !== thinkingId)
                : state.messages
              return { messages: [...filtered, data] }
            })

          } else if (eventType === 'local_ai_calls') {
            // 处理本地 Ollama AI
            const localAICalls = Array.isArray(data) ? data : []
            if (localAICalls.length > 0) {
              handleLocalAIs(localAICalls, currentSession, set, get)
            }

          } else if (eventType === 'done') {
            set({ isSending: false })
            get().loadSessions()
          }
        } catch {
          // JSON 解析失败跳过
        }
      }
    }
  } finally {
    reader.releaseLock()
    // 清理残留的思考中气泡，确保状态干净
    set((state: any) => ({
      isSending: false,
      messages: state.messages.filter((m: ChatMessage) => !m.metadata?.thinking),
    }))
    get().loadSessions()
  }
}

// ---- 处理本地 Ollama AI（前端直接调用）----
async function handleLocalAIs(
  localAICalls: any[],
  currentSession: ChatSession,
  set: any,
  get: any
) {
  const sessionMessages = get().messages
    .filter((m: ChatMessage) => m.sender_type !== 'system' && !m.metadata?.thinking)
    .map((m: ChatMessage) => ({ role: m.sender_type === 'user' ? 'user' : 'assistant', content: m.content }))

  for (const localAI of localAICalls) {
    const thinkingId = `thinking-local-${localAI.id}-${Date.now()}`
    set((state: any) => ({
      messages: [...state.messages, {
        id: thinkingId,
        session_id: currentSession.id,
        sender_type: 'ai' as const,
        sender_name: localAI.name,
        sender_avatar: localAI.avatar,
        content: '...',
        metadata: { thinking: true },
        created_at: new Date().toISOString(),
      }]
    }))

    try {
      const reply = await callOllamaLocal({
        name: localAI.name, avatar: localAI.avatar,
        model: localAI.model, base_url: localAI.base_url,
        system_prompt: localAI.system_prompt,
        messages: sessionMessages,
      })

      let savedMsg: ChatMessage | null = null
      try {
        const saveRes = await apiRequest('/chat/save_local', {
          method: 'POST',
          body: JSON.stringify({
            session_id: currentSession.id,
            sender_id: localAI.id, sender_name: localAI.name,
            sender_avatar: localAI.avatar, content: reply, model: localAI.model,
          }),
        })
        if (saveRes.ok) { const d = await saveRes.json(); savedMsg = d.message }
      } catch { /* 保存失败不影响显示 */ }

      const localMsg: ChatMessage = savedMsg || {
        id: `local-${localAI.id}-${Date.now()}`,
        session_id: currentSession.id,
        sender_type: 'ai', sender_id: localAI.id,
        sender_name: localAI.name, sender_avatar: localAI.avatar,
        content: reply, metadata: { model: localAI.model },
        created_at: new Date().toISOString(),
      }
      set((state: any) => ({
        messages: [...state.messages.filter((m: ChatMessage) => m.id !== thinkingId), localMsg]
      }))
    } catch (err) {
      const errMsg: ChatMessage = {
        id: `local-err-${localAI.id}-${Date.now()}`,
        session_id: currentSession.id,
        sender_type: 'ai', sender_name: localAI.name, sender_avatar: localAI.avatar,
        content: `❌ 本地模型调用失败: ${(err as Error).message}`,
        created_at: new Date().toISOString(),
      }
      set((state: any) => ({
        messages: [...state.messages.filter((m: ChatMessage) => m.id !== thinkingId), errMsg]
      }))
    }
  }
}
