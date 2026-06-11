import { create } from 'zustand'

const saved = localStorage.getItem('theme') || 'dark'
document.documentElement.setAttribute('data-theme', saved)

export const useThemeStore = create((set) => ({
  theme: saved,
  toggle: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
    return { theme: next }
  }),
}))
