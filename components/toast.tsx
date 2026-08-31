'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { X, Bell } from 'lucide-react'
import Link from 'next/link'

type Toast = { id: string; title: string; message: string; href?: string }
type ToastCtx = { addToast: (t: Omit<Toast, 'id'>) => void }

const Ctx = createContext<ToastCtx>({ addToast: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now().toString()
    setToasts((p) => [...p, { ...t, id }])
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 7000)
  }, [])

  const remove = (id: string) => setToasts((p) => p.filter((x) => x.id !== id))

  return (
    <Ctx.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-4 left-4 right-4 z-[200] space-y-2 pointer-events-none">
        {toasts.map((t) => {
          const content = (
            <div className="pointer-events-auto flex items-center gap-3 bg-white border border-[#d5a538]/50 rounded-2xl px-4 py-3 shadow-2xl toast-enter">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538)' }}
              >
                <Bell size={15} className="text-[#020813]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-semibold text-sm leading-tight">{t.title}</p>
                <p className="text-gray-500 text-xs mt-0.5 truncate">{t.message}</p>
              </div>
              <button
                onClick={(e) => { e.preventDefault(); remove(t.id) }}
                className="text-gray-400 hover:text-gray-500 flex-shrink-0 p-1"
              >
                <X size={15} />
              </button>
            </div>
          )
          return t.href ? (
            <Link key={t.id} href={t.href}>{content}</Link>
          ) : (
            <div key={t.id}>{content}</div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
