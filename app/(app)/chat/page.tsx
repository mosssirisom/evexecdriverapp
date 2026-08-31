'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Send, MessageSquare, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  body: string
  from_driver: boolean
  created_at: string
  read_at: string | null
}

function formatMsgTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${time}`
}

function isDifferentDay(a: string, b: string): boolean {
  return new Date(a).toDateString() !== new Date(b).toDateString()
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [driverId, setDriverId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const markRead = useCallback(async (uid: string) => {
    await supabase
      .from('driver_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('driver_id', uid)
      .eq('from_driver', false)
      .is('read_at', null)
  }, [supabase])

  const loadMessages = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setDriverId(user.id)

    const { data } = await supabase
      .from('driver_messages')
      .select('id, body, from_driver, created_at, read_at')
      .eq('driver_id', user.id)
      .order('created_at', { ascending: true })

    setMessages(data ?? [])
    setLoading(false)
    markRead(user.id)
  }, [supabase, markRead])

  useEffect(() => { loadMessages() }, [loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channel = supabase
        .channel('chat-live')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'driver_messages',
          filter: `driver_id=eq.${user.id}`,
        }, (payload) => {
          const msg = payload.new as Message
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          if (!msg.from_driver) markRead(user.id)
        })
        .subscribe()
    })
    return () => { if (channel) supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = async () => {
    const body = input.trim()
    if (!body || !driverId || sending) return
    setSending(true)
    setInput('')
    const optimisticId = crypto.randomUUID()
    const optimistic: Message = {
      id: optimisticId,
      body,
      from_driver: true,
      created_at: new Date().toISOString(),
      read_at: null,
    }
    setMessages(prev => [...prev, optimistic])
    const { data } = await supabase
      .from('driver_messages')
      .insert({ driver_id: driverId, body, from_driver: true })
      .select('id')
      .single()
    if (data) {
      setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m))
    }
    setSending(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc]">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-12 pb-4 border-b border-gray-100 bg-[#f8fafc]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#d5a538]/15 border border-[#d5a538]/30 flex items-center justify-center">
            <MessageSquare size={18} className="text-[#d5a538]" />
          </div>
          <div>
            <h1 className="text-gray-900 font-bold text-base">EV Exec Dispatch</h1>
            <p className="text-gray-400 text-xs">Operations team</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-40">
        {messages.length === 0 ? (
          <div className="text-center pt-16">
            <MessageSquare size={36} className="mx-auto mb-3 text-white/15" />
            <p className="text-gray-400 text-sm">No messages yet</p>
            <p className="text-gray-300 text-xs mt-1">Send a message to the operations team</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg, i) => {
              const showDate = i === 0 || isDifferentDay(messages[i - 1].created_at, msg.created_at)
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="text-center my-4">
                      <span className="text-gray-300 text-[10px] bg-gray-100 px-3 py-1 rounded-full">
                        {new Date(msg.created_at).toLocaleDateString('en-GB', {
                          weekday: 'short', day: 'numeric', month: 'short',
                        })}
                      </span>
                    </div>
                  )}
                  <div className={`flex mb-1 ${msg.from_driver ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex flex-col gap-0.5 max-w-[78%] ${msg.from_driver ? 'items-end' : 'items-start'}`}>
                      {!msg.from_driver && i > 0 && !messages[i - 1].from_driver === false && (
                        <span className="text-[10px] text-gray-400 px-1 mb-0.5">EV Exec Ops</span>
                      )}
                      {!msg.from_driver && (i === 0 || messages[i - 1].from_driver) && (
                        <span className="text-[10px] text-gray-400 px-1 mb-0.5">EV Exec Ops</span>
                      )}
                      <div
                        className={`px-4 py-2.5 text-sm leading-relaxed ${
                          msg.from_driver
                            ? 'text-[#020813] font-medium rounded-2xl rounded-br-sm'
                            : 'bg-white border border-gray-200 text-gray-700 rounded-2xl rounded-bl-sm'
                        }`}
                        style={msg.from_driver
                          ? { background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }
                          : undefined}
                      >
                        {msg.body}
                      </div>
                      <span className="text-[10px] text-gray-300 px-1">{formatMsgTime(msg.created_at)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="fixed bottom-[88px] left-0 right-0 px-4 bg-[#f8fafc] pb-3 pt-2 border-t border-gray-100">
        <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Message dispatch..."
            rows={1}
            className="flex-1 bg-transparent text-gray-900 text-sm placeholder:text-gray-400 resize-none outline-none py-1.5 max-h-28"
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-35 active:opacity-70 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
          >
            {sending
              ? <Loader2 size={15} className="text-[#020813] animate-spin" />
              : <Send size={15} className="text-[#020813]" />}
          </button>
        </div>
      </div>
    </div>
  )
}
