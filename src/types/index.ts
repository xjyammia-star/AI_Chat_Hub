// ============================================
// AI Chat Hub — 全局类型定义
// ============================================

export type UserRole = 'admin' | 'user'
export type AIProvider = 'gemini' | 'deepseek' | 'doubao' | 'glm' | 'openai' | 'anthropic' | 'ollama' | 'custom'
export type ChatMode = 'normal' | 'judge' | 'bidding' | 'shadow' | 'rollcall'
export type AIMemberType = 'system' | 'user'
export type SenderType = 'user' | 'ai' | 'system'

// ---- 爵位系统 ----
export type NobleTitle = '男爵' | '子爵' | '伯爵' | '侯爵' | '公爵'

export interface TitleInfo {
  title: NobleTitle
  icon: string
  minScore: number
  color: string
}

export const NOBLE_TITLES: TitleInfo[] = [
  { title: '男爵', icon: '⭐', minScore: 0,   color: '#9ca3af' },
  { title: '子爵', icon: '🌙', minScore: 50,  color: '#818cf8' },
  { title: '伯爵', icon: '☀️', minScore: 150, color: '#fbbf24' },
  { title: '侯爵', icon: '💎', minScore: 300, color: '#34d399' },
  { title: '公爵', icon: '👑', minScore: 500, color: '#f472b6' },
]

export function getTitleInfo(score: number): TitleInfo {
  for (let i = NOBLE_TITLES.length - 1; i >= 0; i--) {
    if (score >= NOBLE_TITLES[i].minScore) return NOBLE_TITLES[i]
  }
  return NOBLE_TITLES[0]
}

// ---- 用户 ----
export interface User {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  is_active: boolean
  created_at: string
}

// ---- AI 成员 ----
export interface AIProvider_Config {
  key: AIProvider
  label: string
  baseUrl?: string
  models: string[]
  requiresKey: boolean
  isLocal?: boolean
}

export interface SystemAIMember {
  id: string
  name: string
  avatar: string
  provider: AIProvider
  model: string
  base_url?: string
  is_public: boolean
  allowed_users?: string[]
  is_enabled: boolean
  sort_order: number
  created_at: string
}

export interface UserAIMember {
  id: string
  user_id: string
  name: string
  avatar: string
  provider: AIProvider
  model: string
  base_url?: string
  is_local: boolean
  is_enabled: boolean
  sort_order: number
  created_at: string
}

// 用于前端展示的统一 AI 成员格式
export interface AIMember {
  id: string
  type: AIMemberType
  name: string
  avatar: string
  provider: AIProvider
  model: string
  base_url?: string
  is_local: boolean
  is_enabled: boolean
  is_available: boolean       // 运行时检测：API 是否可用
  custom_name?: string        // 用户自定义名称
  custom_avatar?: string      // 用户自定义头像
  role_id?: string
  custom_prompt?: string
  sort_order: number
}

// ---- 角色 ----
export interface AIRole {
  id: string
  name: string
  description: string
  system_prompt: string
  category: string
  is_public: boolean
  created_by?: string
  created_at: string
}

// ---- 聊天会话 ----
export interface ChatSession {
  id: string
  user_id: string
  title: string
  category: string | null
  chat_mode: ChatMode
  mode_config?: Record<string, unknown>
  is_archived: boolean
  is_pinned: boolean
  created_at: string
  updated_at: string
  last_message?: string       // 前端展示用
  unread_count?: number
}

// ---- 聊天消息 ----
export interface ChatMessage {
  id: string
  session_id: string
  sender_type: SenderType
  sender_id?: string
  sender_name: string
  sender_avatar?: string
  content: string
  role_in_mode?: string       // judge / expert / shadow / actor 等
  metadata?: {
    model?: string
    display_model?: string
    tokens?: number
    error?: string
    thinking?: boolean        // 是否正在思考中（流式）
    mode_step?: string        // 模式步骤标识
    is_reaction_reply?: boolean  // 是否是点赞/踩触发的回复
  }
  created_at: string
}

// ---- 模式配置 ----
export interface ChatModeConfig {
  id: string
  mode_key: ChatMode
  mode_name: string
  description: string
  config: Record<string, unknown>
  is_enabled: boolean
}

// ---- API 请求/响应 ----
export interface AuthResponse {
  token: string
  user: User
}

export interface SendMessageRequest {
  session_id: string
  content: string
  mode: ChatMode
  mode_config?: Record<string, unknown>
  selected_ai_ids?: string[]   // 指定参与的 AI 成员
}

export interface SendMessageResponse {
  messages: ChatMessage[]      // 可能是多条（多 AI 回复）
  session_id: string
}

// ---- Store 状态 ----
export interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string, inviteCode?: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

export interface ChatState {
  sessions: ChatSession[]
  currentSession: ChatSession | null
  messages: ChatMessage[]
  isLoading: boolean
  isSending: boolean
  activeMode: ChatMode
  selectedAIIds: string[]
  reputationScores: Record<string, number>   // ai_member_id -> score
  setCurrentSession: (session: ChatSession | null) => void
  setActiveMode: (mode: ChatMode) => void
  toggleAIMember: (id: string) => void
  loadSessions: () => Promise<void>
  loadMessages: (sessionId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  createSession: (mode?: ChatMode) => Promise<ChatSession>
  updateSessionTitle: (id: string, title: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  archiveSession: (id: string) => Promise<void>
  loadReputationScores: () => Promise<void>
  reactToMessage: (messageId: string, reaction: 'up' | 'down') => Promise<void>
}
