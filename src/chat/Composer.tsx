import { useEffect, useState, type KeyboardEvent } from 'react'

const key = (chatKey: string) => `draft:${chatKey}`
const read = (k: string) => {
  try {
    return sessionStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}
const write = (k: string, v: string) => {
  try {
    if (v) sessionStorage.setItem(k, v)
    else sessionStorage.removeItem(k)
  } catch {
    /* storage unavailable; draft just isn't persisted */
  }
}

type Props = { chatKey: string; disabled: boolean; streaming: boolean; restoredDraft: string | null; onSend(text: string): void; onStop(): void }

export function Composer({ chatKey, disabled, streaming, restoredDraft, onSend, onStop }: Props) {
  const [text, setText] = useState(() => read(key(chatKey)))

  useEffect(() => setText(read(key(chatKey))), [chatKey])
  useEffect(() => {
    if (restoredDraft !== null) setText(restoredDraft)
  }, [restoredDraft])
  useEffect(() => write(key(chatKey), text), [chatKey, text])

  const canSend = !disabled && !streaming && text.trim() !== ''
  const submit = () => {
    if (!canSend) return
    onSend(text)
    setText('')
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form className="composer" onSubmit={(e) => (e.preventDefault(), submit())}>
      <textarea aria-label="Message" placeholder="Message" rows={2} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} />
      {streaming ? (
        <button type="button" onClick={onStop}>Stop</button>
      ) : (
        <button type="submit" disabled={!canSend}>Send</button>
      )}
    </form>
  )
}
