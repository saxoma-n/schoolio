import { useEffect, useState } from 'react'
import { setChatModel } from '../api/db'
import { isFreeModel } from '../../supabase/functions/_shared/free.ts'
import type { Chat, Profile } from '../lib/types'
import { Composer } from './Composer'
import { MessageItem } from './MessageItem'
import { ModelPicker } from './ModelPicker'
import { useChat } from './useChat'
import { useModels } from './useModels'

type Props = {
  chatId: string | null
  chatModel: string | null
  profile: Profile
  onChatCreated(chat: Chat): void
  onReplyComplete?(): void
}

const FALLBACK_CONTEXT = 8192

export function ChatView({ chatId, chatModel, profile, onChatCreated, onReplyComplete }: Props) {
  const { data, error: modelsError } = useModels()
  const firstFree = data?.models.find(isFreeModel)?.id ?? ''
  const [picked, setPicked] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => setPicked(null), [chatId])

  const model = picked ?? chatModel ?? profile.default_model ?? firstFree
  const contextLength = data?.models.find((m) => m.id === model)?.context_length ?? FALLBACK_CONTEXT
  const chat = useChat({ chatId, model, contextLength, systemPrompt: profile.system_prompt, onChatCreated, onReplyComplete })

  const choose = (id: string) => {
    setPicked(id)
    if (chatId) setChatModel(chatId, id).catch(() => {})
  }
  const send = (text: string) => {
    if (editing !== null) {
      setEditing(null)
      chat.editLast(text)
    } else chat.send(text)
  }

  const last = chat.messages.at(-1)
  const lastUserIdx = chat.messages.map((m) => m.role).lastIndexOf('user')

  return (
    <section className="chat">
      <header className="chat-header">
        {data && <ModelPicker value={model} onChange={choose} models={data.models} allowPaid={data.allowPaid} />}
      </header>

      <div className="messages">
        {chat.trimmed && <p className="notice">Older messages were trimmed to fit this model's context.</p>}
        {chat.messages.map((m, i) => (
          <div key={m.localId}>
            <MessageItem message={m} onRetrySave={() => chat.retrySave(m.localId)} />
            {!chat.streaming && i === lastUserIdx && (
              <button type="button" className="link" onClick={() => setEditing(m.content)}>Edit</button>
            )}
          </div>
        ))}
        {chat.streaming && chat.streamingText && <MessageItem message={{ role: 'assistant', content: chat.streamingText, status: 'complete' }} />}
        {!chat.streaming && last?.role === 'assistant' && (
          <button type="button" className="link" onClick={() => chat.regenerate()}>Regenerate</button>
        )}
        {(chat.error || modelsError) && (
          <div role="alert" className="error">
            <p>{chat.error ?? modelsError}</p>
            {chat.error && (
              <>
                <button type="button" onClick={() => chat.regenerate()}>Retry</button>
                <button type="button" onClick={() => document.getElementById('model-picker')?.focus()}>Switch model</button>
              </>
            )}
          </div>
        )}
      </div>

      <Composer
        chatKey={chatId ?? 'new'}
        disabled={!data || !model}
        streaming={chat.streaming}
        restoredDraft={editing ?? chat.restoredDraft}
        onSend={send}
        onStop={chat.stop}
      />
    </section>
  )
}
