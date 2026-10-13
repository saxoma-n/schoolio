import { supabase } from '../lib/supabase'
import type { Chat, Message, Profile } from '../lib/types'

// Supabase returns { data, error }; data is only null when error is set for these queries.
function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

export const listChats = async (): Promise<Chat[]> =>
  check(await supabase.from('chats').select('*').order('updated_at', { ascending: false }))

export const createChat = async (model: string): Promise<Chat> =>
  check(await supabase.from('chats').insert({ model }).select().single())

export async function renameChat(id: string, title: string): Promise<void> {
  check(await supabase.from('chats').update({ title }).eq('id', id))
}

export async function setChatModel(id: string, model: string): Promise<void> {
  check(await supabase.from('chats').update({ model }).eq('id', id))
}

export async function deleteChat(id: string): Promise<void> {
  check(await supabase.from('chats').delete().eq('id', id))
}

export const listMessages = async (chatId: string): Promise<Message[]> =>
  check(await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true }))

export const insertMessage = async (m: Omit<Message, 'id' | 'created_at'>): Promise<Message> =>
  check(await supabase.from('messages').insert(m).select().single())

export async function deleteMessage(id: string): Promise<void> {
  check(await supabase.from('messages').delete().eq('id', id))
}

export const getProfile = async (): Promise<Profile> => check(await supabase.from('profiles').select('*').single())

export async function updateProfile(patch: Partial<Omit<Profile, 'user_id'>>): Promise<void> {
  const { data } = await supabase.auth.getUser()
  check(await supabase.from('profiles').update(patch).eq('user_id', data.user!.id))
}
