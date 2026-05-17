// src/lib/chat.ts
import { create } from 'zustand'
import type { ChatState, ChatSession, ChatMessage, ChatMode } from '@/types'
import { apiRequest, useAuthStore } from './auth'

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
  if (!resp.ok) throw new Error(`Ollama ${resp.status}`)
  const data = await resp.json()
  return data.message?.content || ''
}

// 讨论模式状态（全局，跨组件共享）
export const discussionState = {
  isRunning: false,
  shouldStop: false,
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
      if (!current.includes(id)) set({ selectedAIIds: [...current, id] })
    }
  },

  loadSessions: async () => {
    set({ isLoading: true })
    try {
      const res = await apiRequest('/chat/sessions')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      set({ sessions: data.sessions, isLoading: false })
    } catch { set({ isLoading: false }) }
  },

  loadMessages: async (sessionId) => {
    set({ isLoading: true })
    try {
      const res = await apiRequest(`/chat/messages?session_id=${sessionId}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      set({ messages: data.messages, isLoading: false })
    } catch { set({ isLoading: false }) }
  },

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
    await apiRequest('/chat/sessions', { method: 'PUT', body: JSON.stringify({ id, title }) })
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
      currentSession: state.currentSession?.id === id ? { ...state.currentSession, title } : state.currentSession,
    }))
  },

  deleteSession: async (id) => {
    await apiRequest('/chat/sessions', { method: 'DELETE', body: JSON.stringify({ id }) })
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      currentSession: state.currentSession?.id === id ? null : state.currentSession,
      messages: state.currentSession?.id === id ? [] : state.messages,
    }))
  },

  archiveSession: async (id) => {
    await apiRequest('/chat/sessions', { method: 'PUT', body: JSON.stringify({ id, is_archived: true }) })
    set((state) => ({
      sessions: state.sessions.map((s) => s.id === id ? { ...s, is_archived: true } : s),
    }))
  },
}))

// ---- SSE 发送处理 ----
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

  if (!response.ok) { set({ isSending: false }); throw new Error('发送失败') }

  const reader = response.body?.getReader()
  if (!reader) { set({ isSending: false }); throw new Error('不支持流式响应') }

  const decoder = new TextDecoder()
  let buffer = ''
  const thinkingIds: Record<string, string> = {}
  let discussionConfig: any = null

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
            const thinkingId = `thinking-${data.ai_id}-${Date.now()}`
            thinkingIds[data.ai_id] = thinkingId
            const thinkingMsg: ChatMessage = {
              id: thinkingId, session_id: currentSession.id,
              sender_type: 'ai', sender_name: data.ai_name, sender_avatar: data.ai_avatar,
              content: '...', metadata: { thinking: true }, created_at: new Date().toISOString(),
            }
            set((state: any) => ({ messages: [...state.messages, thinkingMsg] }))

          } else if (eventType === 'message') {
            const thinkingId = data.sender_id ? thinkingIds[data.sender_id] : null
            if (thinkingId) delete thinkingIds[data.sender_id]
            set((state: any) => {
              const filtered = thinkingId
                ? state.messages.filter((m: ChatMessage) => m.id !== thinkingId)
                : state.messages
              return { messages: [...filtered, data] }
            })

          } else if (eventType === 'discussion_start') {
            // 收到讨论配置，保存起来，等 done 之后开始轮询
            discussionConfig = data

          } else if (eventType === 'local_ai_calls') {
            const localAICalls = Array.isArray(data) ? data : []
            if (localAICalls.length > 0) {
              handleLocalAIs(localAICalls, currentSession, set, get).catch(console.error)
            }

          } else if (eventType === 'done') {
            // 清理残留思考气泡
            const remainingIds = Object.values(thinkingIds)
            if (remainingIds.length > 0) {
              set((state: any) => ({
                messages: state.messages.filter((m: ChatMessage) => !remainingIds.includes(m.id as string)),
              }))
            }
            if (!discussionConfig) {
              set({ isSending: false })
              get().loadSessions()
            }
          }
        } catch { }
      }
    }
  } catch (e) {
    console.error('SSE read error:', e)
  } finally {
    reader.releaseLock()
    if (!discussionConfig) {
      set((state: any) => ({
        isSending: false,
        messages: state.messages.filter((m: ChatMessage) => !m.metadata?.thinking),
      }))
    }
  }

  // 如果是讨论模式，启动前端轮询
  if (discussionConfig) {
    await runDiscussionPolling(discussionConfig, currentSession, set, get)
  }
}

// ---- 讨论模式前端轮询 ----
async function runDiscussionPolling(
  config: any,
  currentSession: ChatSession,
  set: any,
  get: any
) {
  const {
    session_id, topic, ai_ids, total_rounds,
    enable_summary, summary_ai_id,
    discussion_prompt, summary_prompt, max_tokens, temperature,
  } = config

  discussionState.isRunning = true
  discussionState.shouldStop = false

  const token = useAuthStore.getState().token
  const speeches: Array<{ name: string; content: string }> = []
  let currentAiIndex = 0
  let currentRound = 1

  // 显示第一轮标记
  set((state: any) => ({
    messages: [...state.messages, {
      id: `round-1-${Date.now()}`,
      session_id: currentSession.id,
      sender_type: 'system',
      sender_name: 'system',
      content: '── 第 1 轮 ──',
      created_at: new Date().toISOString(),
    }]
  }))

  try {
    while (currentRound <= total_rounds && !discussionState.shouldStop) {
      // 显示思考中气泡
      const ai_id = ai_ids[currentAiIndex]
      const thinkingId = `thinking-discussion-${ai_id}-${Date.now()}`

      // 先获取AI名字用于显示（从现有消息或临时显示）
      set((state: any) => ({
        messages: [...state.messages, {
          id: thinkingId,
          session_id: currentSession.id,
          sender_type: 'ai',
          sender_name: '...',
          sender_avatar: '🤔',
          content: '...',
          metadata: { thinking: true },
          created_at: new Date().toISOString(),
        }]
      }))

      try {
        const resp = await fetch('/api/chat/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            session_id,
            content: topic,
            mode: 'discussion',
            selected_ai_ids: [],
            discussion_step: {
              ai_index: currentAiIndex,
              round: currentRound,
              total_rounds,
              speeches,
              topic,
              ai_ids,
              discussion_prompt,
              summary_prompt,
              max_tokens,
              temperature,
            },
          }),
        })

        const data = await resp.json()

        // 替换思考气泡
        set((state: any) => {
          const filtered = state.messages.filter((m: ChatMessage) => m.id !== thinkingId)
          if (data.message) {
            // 把发言加入记录
            speeches.push({ name: data.message.sender_name, content: data.message.content })
            return { messages: [...filtered, data.message] }
          }
          return { messages: filtered }
        })

        // 移动到下一步
        if (data.next) {
          const wasRoundEnd = data.next.is_round_start
          currentAiIndex = data.next.ai_index
          const newRound = data.next.round

          // 如果进入新一轮，显示轮次标记
          if (wasRoundEnd && newRound <= total_rounds && !discussionState.shouldStop) {
            set((state: any) => ({
              messages: [...state.messages, {
                id: `round-${newRound}-${Date.now()}`,
                session_id: currentSession.id,
                sender_type: 'system',
                sender_name: 'system',
                content: `── 第 ${newRound} 轮 ──`,
                created_at: new Date().toISOString(),
              }]
            }))
          }
          currentRound = newRound
        } else {
          // 没有 next 说明讨论结束
          break
        }

        if (data.is_last_step) break

      } catch (err) {
        // 某个AI出错，移除思考气泡继续
        set((state: any) => ({
          messages: state.messages.filter((m: ChatMessage) => m.id !== thinkingId)
        }))
        // 跳到下一个AI
        currentAiIndex = (currentAiIndex + 1) % ai_ids.length
        if (currentAiIndex === 0) currentRound++
      }
    }

    // 生成总结
    if (enable_summary && !discussionState.shouldStop && speeches.length > 0) {
      const summaryAiId = summary_ai_id || ai_ids[0]
      const thinkingId = `thinking-summary-${Date.now()}`
      set((state: any) => ({
        messages: [...state.messages, {
          id: thinkingId,
          session_id: currentSession.id,
          sender_type: 'ai', sender_name: '总结中...', sender_avatar: '📝',
          content: '...', metadata: { thinking: true },
          created_at: new Date().toISOString(),
        }]
      }))

      try {
        const resp = await fetch('/api/chat/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            session_id,
            content: topic,
            mode: 'discussion',
            selected_ai_ids: [],
            discussion_summary: {
              summary_ai_id: summaryAiId,
              ai_ids,
              speeches,
              topic,
              summary_prompt,
              max_tokens: (max_tokens || 600) * 1.5,
            },
          }),
        })
        const data = await resp.json()
        set((state: any) => {
          const filtered = state.messages.filter((m: ChatMessage) => m.id !== thinkingId)
          return { messages: data.message ? [...filtered, data.message] : filtered }
        })
      } catch {
        set((state: any) => ({
          messages: state.messages.filter((m: ChatMessage) => m.id !== thinkingId)
        }))
      }
    }

  } finally {
    discussionState.isRunning = false
    discussionState.shouldStop = false

    // 讨论结束提示
    const endMsg: ChatMessage = {
      id: `discussion-end-${Date.now()}`,
      session_id: currentSession.id,
      sender_type: 'system', sender_name: 'system',
      content: discussionState.shouldStop ? '⏹ 讨论已停止' : '✅ 讨论结束',
      created_at: new Date().toISOString(),
    }
    set((state: any) => ({
      isSending: false,
      messages: [
        ...state.messages.filter((m: ChatMessage) => !m.metadata?.thinking),
        endMsg,
      ],
    }))
    get().loadSessions()
  }
}

// ---- 处理本地 Ollama AI ----
async function handleLocalAIs(localAICalls: any[], currentSession: ChatSession, set: any, get: any) {
  const sessionMessages = get().messages
    .filter((m: ChatMessage) => m.sender_type !== 'system' && !m.metadata?.thinking)
    .map((m: ChatMessage) => ({ role: m.sender_type === 'user' ? 'user' : 'assistant', content: m.content }))

  for (const localAI of localAICalls) {
    const thinkingId = `thinking-local-${localAI.id}-${Date.now()}`
    set((state: any) => ({
      messages: [...state.messages, {
        id: thinkingId, session_id: currentSession.id,
        sender_type: 'ai' as const, sender_name: localAI.name, sender_avatar: localAI.avatar,
        content: '...', metadata: { thinking: true }, created_at: new Date().toISOString(),
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
      } catch { }

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
