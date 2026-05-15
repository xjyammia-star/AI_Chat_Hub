// ============================================
// 认证工具 + Zustand Auth Store
// ============================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthState, User } from '@/types'

const API_BASE = '/api'

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        try {
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || '登录失败')
          }
          const data = await res.json()
          set({ user: data.user, token: data.token, isLoading: false })
        } catch (e) {
          set({ isLoading: false })
          throw e
        }
      },

      register: async (email: string, password: string, displayName: string, inviteCode?: string) => {
        set({ isLoading: true })
        try {
          const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, display_name: displayName, invite_code: inviteCode }),
          })
          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || '注册失败')
          }
          const data = await res.json()
          set({ user: data.user, token: data.token, isLoading: false })
        } catch (e) {
          set({ isLoading: false })
          throw e
        }
      },

      logout: () => {
        set({ user: null, token: null })
      },

      checkAuth: async () => {
        const token = get().token
        if (!token) return
        try {
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) {
            set({ user: null, token: null })
            return
          }
          const data = await res.json()
          set({ user: data.user })
        } catch {
          set({ user: null, token: null })
        }
      },
    }),
    {
      name: 'ai-chat-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
)

// HTTP 请求帮助函数（自动带 token）
export function apiRequest(path: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().token
  return fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
}
