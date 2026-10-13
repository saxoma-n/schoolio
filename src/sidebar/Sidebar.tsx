import { useState, type KeyboardEvent } from 'react'
import type { Chat } from '../lib/types'

type Props = {
  chats: Chat[]
  activeId: string | null
  onNew(): void
  onSelect(id: string): void
  onRename(id: string, title: string): void
  onDelete(id: string): void
  onSignOut(): void
}

export function Sidebar({ chats, activeId, onNew, onSelect, onRename, onDelete, onSignOut }: Props) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null)
  const q = query.trim().toLowerCase()
  const shown = q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats

  const onKey = (e: KeyboardEvent) => {
    if (!editing) return
    if (e.key === 'Escape') setEditing(null)
    if (e.key === 'Enter') {
      const title = editing.title.trim()
      if (!title) return
      onRename(editing.id, title)
      setEditing(null)
    }
  }

  return (
    <nav className="sidebar" aria-label="Chats">
      <button type="button" onClick={onNew}>New chat</button>
      <input type="search" aria-label="Search chats" placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>
        {shown.map((c) => (
          <li key={c.id} className={c.id === activeId ? 'active' : undefined}>
            {editing?.id === c.id ? (
              <input aria-label="Chat title" autoFocus value={editing.title} onChange={(e) => setEditing({ id: c.id, title: e.target.value })} onKeyDown={onKey} onBlur={() => setEditing(null)} />
            ) : (
              <>
                <button type="button" className="title" aria-current={c.id === activeId ? 'page' : undefined} onClick={() => onSelect(c.id)}>{c.title}</button>
                <button type="button" className="ghost" aria-label={`Rename ${c.title}`} onClick={() => setEditing({ id: c.id, title: c.title })}>✎</button>
                <button type="button" className="ghost" aria-label={`Delete ${c.title}`} onClick={() => window.confirm(`Delete "${c.title}"?`) && onDelete(c.id)}>🗑</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <footer>
        <a href="#/settings">Settings</a>
        <button type="button" className="link" onClick={onSignOut}>Sign out</button>
      </footer>
    </nav>
  )
}
