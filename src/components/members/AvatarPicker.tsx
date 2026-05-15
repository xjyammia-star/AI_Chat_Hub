// src/components/members/AvatarPicker.tsx
// emoji 头像选择器

import { useState } from 'react'

const AVATAR_GROUPS = [
  { label: 'AI & 科技', emojis: ['🤖', '✨', '🧠', '⚡', '🔮', '🌊', '🦙', '🫘', '💎', '🚀', '🛸', '💡', '⚙️', '🔬', '🧬'] },
  { label: '动物', emojis: ['🦊', '🐺', '🦁', '🐯', '🐻', '🐼', '🦋', '🦅', '🦉', '🐬', '🦈', '🐉', '🦄', '🐙', '🦑'] },
  { label: '人物', emojis: ['👨‍💻', '👩‍💻', '🧑‍🔬', '👨‍🎨', '🧑‍⚖️', '👨‍🏫', '🧙', '🥷', '🧑‍🚀', '🕵️', '👨‍💼', '🧑‍🎤', '🦸', '🧝', '🤴'] },
  { label: '符号', emojis: ['🌟', '💫', '🔥', '❄️', '🌈', '⚡', '🌀', '💥', '🎯', '🏆', '👑', '🎭', '🎪', '🎲', '♟️'] },
]

interface Props {
  value: string
  onChange: (emoji: string) => void
}

export default function AvatarPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState(0)
  const [custom, setCustom] = useState('')

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            fontSize: 26,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {value || '🤖'}
        </button>
        <input
          className="form-input"
          placeholder="直接输入或粘贴 emoji，如 🦁"
          value={custom}
          onChange={(e) => {
            const val = e.target.value
            setCustom(val)
            // 取第一个字符（支持emoji）
            if (val) {
              const chars = [...val]
              onChange(chars[0])
            }
          }}
          style={{ width: 180, fontSize: 18 }}
        />
      </div>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              width: 280,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 12,
              zIndex: 100,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {/* 分组 tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {AVATAR_GROUPS.map((g, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setGroup(i)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: 'pointer',
                    border: 'none',
                    background: group === i ? 'var(--accent)' : 'var(--bg-input)',
                    color: group === i ? 'white' : 'var(--text-secondary)',
                    fontFamily: 'inherit',
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {/* emoji 网格 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
              {AVATAR_GROUPS[group].emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onChange(emoji); setOpen(false) }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    fontSize: 18,
                    cursor: 'pointer',
                    border: value === emoji ? '2px solid var(--accent)' : '1px solid transparent',
                    background: value === emoji ? 'var(--accent-glow)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
