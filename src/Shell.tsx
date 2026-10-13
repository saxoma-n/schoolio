import { useCallback, useEffect, useState } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import * as db from './api/db'
import { useAuth } from './auth/AuthProvider'
import { ChatView } from './chat/ChatView'
import { useModels } from './chat/useModels'
import { errorMessage } from './lib/errors'
import type { Chat, Profile } from './lib/types'
import { Settings, applyTheme } from './settings/Settings'
import { Sidebar } from './sidebar/Sidebar'

export default function Shell() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const activeId = useMatch('/c/:id')?.params.id ?? null
  const onSettings = useMatch('/settings') !== null
  const [chats, setChats] = useState<Chat[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const models = useModels()

  const refreshChats = useCallback(() => {
    db.listChats().then(setChats, (e) => setLoadError(errorMessage(e)))
  }, [])

  useEffect(() => {
    refreshChats()
    db.getProfile().then(setProfile, (e) => setLoadError(errorMessage(e)))
  }, [refreshChats])

  useEffect(() => {
    if (profile) applyTheme(profile.theme)
  }, [profile])

  const go = (path: string) => {
    setDrawerOpen(false)
    navigate(path)
  }

  const onChatCreated = (chat: Chat) => {
    setChats((cs) => [chat, ...cs])
    navigate(`/c/${chat.id}`, { replace: true })
  }

  const rename = (id: string, title: string) => db.renameChat(id, title).then(refreshChats, (e) => setLoadError(errorMessage(e)))
  const remove = (id: string) =>
    db.deleteChat(id).then(() => {
      if (id === activeId) navigate('/')
      refreshChats()
    }, (e) => setLoadError(errorMessage(e)))

  const saveProfile = async (patch: Partial<Omit<Profile, 'user_id'>>) => {
    await db.updateProfile(patch)
    setProfile((p) => (p ? { ...p, ...patch } : p))
  }

  const active = chats.find((c) => c.id === activeId)
  const chatView = (id: string | null) =>
    profile && (
      <ChatView
        chatId={id}
        chatModel={active?.model ?? null}
        profile={profile}
        onChatCreated={onChatCreated}
        onReplyComplete={refreshChats}
      />
    )

  return (
    <div className={`shell${drawerOpen ? ' drawer-open' : ''}`}>
      <Sidebar
        chats={chats}
        activeId={activeId}
        onNew={() => go('/')}
        onSelect={(id) => go(`/c/${id}`)}
        onRename={rename}
        onDelete={remove}
        onSignOut={signOut}
      />
      <div className="backdrop" onClick={() => setDrawerOpen(false)} />
      <main className="main">
        <div className="topbar">
          <button type="button" className="ghost" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>☰</button>
          <span>{active?.title ?? 'Schoolio'}</span>
        </div>
        {loadError && <p role="alert" className="error notice">{loadError}</p>}
        {/* One ChatView instance across / and /c/:id so a new chat's first reply keeps streaming after navigation */}
        {onSettings
          ? profile && <Settings profile={profile} models={models.data?.models ?? []} allowPaid={models.data?.allowPaid ?? false} onSave={saveProfile} />
          : chatView(activeId)}
      </main>
    </div>
  )
}
