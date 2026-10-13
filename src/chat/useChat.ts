import { useCallback, useEffect, useRef, useState } from 'react'
import * as db from '../api/db'
import { streamChat } from '../api/functions'
import { trimContext } from '../lib/context'
import { ApiError, errorMessage } from '../lib/errors'
import type { Chat, ChatMessage, Message } from '../lib/types'

export type UiMessage = Message & { localId: string; saveFailed?: boolean }

type Opts = {
  chatId: string | null
  model: string
  contextLength: number
  systemPrompt: string | null
  onChatCreated(chat: Chat): void
  onReplyComplete?(): void
}

type NewMessage = Omit<Message, 'id' | 'created_at'>

const TITLE_PROMPT = 'Title this conversation in 6 words or fewer. Reply with the title only.\n\n'
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

export function useChat(opts: Opts) {
  const [messages, setMessagesState] = useState<UiMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trimmed, setTrimmed] = useState(false)
  const [restoredDraft, setRestoredDraft] = useState<string | null>(null)

  // Refs keep async flows reading current values instead of stale closures.
  const messagesRef = useRef<UiMessage[]>([])
  const optsRef = useRef(opts)
  optsRef.current = opts
  const chatIdRef = useRef(opts.chatId)
  const createdIdRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const setMessages = (next: UiMessage[]) => {
    messagesRef.current = next
    setMessagesState(next)
  }

  useEffect(() => {
    chatIdRef.current = opts.chatId
    setError(null)
    setTrimmed(false)
    if (opts.chatId && opts.chatId === createdIdRef.current) return // we just created it; state is already current
    setMessages([])
    if (!opts.chatId) return
    let live = true
    db.listMessages(opts.chatId).then((rows) => {
      if (live) setMessages(rows.map((m) => ({ ...m, localId: m.id })))
    }).catch((e) => live && setError(errorMessage(e)))
    return () => {
      live = false
    }
  }, [opts.chatId])

  const save = async (m: NewMessage): Promise<UiMessage> => {
    try {
      const row = await db.insertMessage(m)
      return { ...row, localId: row.id }
    } catch {
      const localId = crypto.randomUUID()
      return { ...m, id: localId, localId, created_at: new Date().toISOString(), saveFailed: true }
    }
  }

  const remove = async (m: UiMessage) => {
    if (!m.saveFailed) await db.deleteMessage(m.id)
  }

  // Streams a reply to `history`; saves whatever text arrived. Returns the error, if any.
  const respond = async (chatId: string, history: UiMessage[]): Promise<unknown> => {
    const { model, contextLength, systemPrompt } = optsRef.current
    const ctx: ChatMessage[] = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...history.map(({ role, content }) => ({ role, content })),
    ]
    const trim = trimContext(ctx, contextLength)
    setTrimmed(trim.trimmed)

    const controller = new AbortController()
    abortRef.current = controller
    let text = ''
    let usage = { prompt_tokens: null as number | null, completion_tokens: null as number | null }
    let failure: unknown = null
    let aborted = false
    try {
      for await (const ev of streamChat(model, trim.messages, controller.signal)) {
        if (ev.type === 'delta') {
          text += ev.text
          setStreamingText(text)
        } else if (ev.type === 'usage') {
          usage = { prompt_tokens: ev.prompt_tokens, completion_tokens: ev.completion_tokens }
        } else {
          failure = new Error(ev.message)
          break
        }
      }
    } catch (e) {
      if (isAbort(e)) aborted = true
      else failure = e
    } finally {
      abortRef.current = null
      setStreamingText('')
    }

    if (text) {
      const status = failure || aborted ? 'incomplete' : 'complete'
      const reply = await save({ chat_id: chatId, role: 'assistant', content: text, model, status, ...usage })
      setMessages([...messagesRef.current, reply])
    }
    if (failure) setError(errorMessage(failure))
    return failure ?? (text ? null : aborted ? 'aborted' : null)
  }

  const autoTitle = async (chatId: string, firstUserText: string) => {
    try {
      let title = ''
      for await (const ev of streamChat(optsRef.current.model, [{ role: 'user', content: TITLE_PROMPT + firstUserText }])) {
        if (ev.type === 'delta') title += ev.text
      }
      title = title.trim().replace(/^["']|["']$/g, '')
      if (title) await db.renameChat(chatId, title)
    } catch {
      /* keep "New chat" */
    }
    optsRef.current.onReplyComplete?.()
  }

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setStreaming(true)
    setError(null)
    try {
      await work()
    } finally {
      busyRef.current = false
      setStreaming(false)
    }
  }

  const sendNow = async (text: string) => {
    setRestoredDraft(null)
    let chatId = chatIdRef.current
    if (!chatId) {
      try {
        const chat = await db.createChat(optsRef.current.model)
        chatId = chat.id
        chatIdRef.current = chat.id
        createdIdRef.current = chat.id
        optsRef.current.onChatCreated(chat)
      } catch (e) {
        setRestoredDraft(text)
        setError(errorMessage(e))
        return
      }
    }
    const isFirst = messagesRef.current.length === 0
    const user = await save({ chat_id: chatId, role: 'user', content: text, model: optsRef.current.model, status: 'complete', prompt_tokens: null, completion_tokens: null })
    setMessages([...messagesRef.current, user])

    const failure = await respond(chatId, messagesRef.current)
    if (failure instanceof ApiError && failure.status === 429) {
      await remove(user).catch(() => {})
      setMessages(messagesRef.current.filter((m) => m.localId !== user.localId))
      setRestoredDraft(text)
      return
    }
    if (failure) return
    if (isFirst) void autoTitle(chatId, text)
    else optsRef.current.onReplyComplete?.()
  }

  const send = useCallback((text: string) => run(() => sendNow(text)), [])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const regenerate = useCallback(
    () =>
      run(async () => {
        const chatId = chatIdRef.current
        if (!chatId) return
        const last = messagesRef.current.at(-1)
        if (last?.role === 'assistant') {
          await remove(last)
          setMessages(messagesRef.current.slice(0, -1))
        }
        if (!messagesRef.current.length) return
        if (!(await respond(chatId, messagesRef.current))) optsRef.current.onReplyComplete?.()
      }),
    [],
  )

  const editLast = useCallback(
    (text: string) =>
      run(async () => {
        const all = messagesRef.current
        const i = all.map((m) => m.role).lastIndexOf('user')
        if (i === -1) return
        for (const m of all.slice(i)) await remove(m)
        setMessages(all.slice(0, i))
        await sendNow(text)
      }),
    [],
  )

  const retrySave = useCallback(async (localId: string) => {
    const m = messagesRef.current.find((x) => x.localId === localId)
    if (!m?.saveFailed) return
    const { id: _id, created_at: _c, localId: _l, saveFailed: _s, ...fields } = m
    const row = await db.insertMessage(fields)
    setMessages(messagesRef.current.map((x) => (x.localId === localId ? { ...row, localId } : x)))
  }, [])

  return { messages, streamingText, streaming, error, trimmed, restoredDraft, send, stop, regenerate, editLast, retrySave }
}
