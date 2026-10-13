export type Role = 'system' | 'user' | 'assistant'
export type ChatMessage = { role: Role; content: string }

export type Chat = { id: string; title: string; model: string; created_at: string; updated_at: string }

export type Message = ChatMessage & {
  id: string
  chat_id: string
  model: string | null
  status: 'complete' | 'incomplete' | 'error'
  prompt_tokens: number | null
  completion_tokens: number | null
  created_at: string
}

export type ModelInfo = {
  id: string
  name: string
  context_length: number
  pricing: { prompt: string; completion: string }
  input_modalities: string[]
}

export type Profile = {
  user_id: string
  default_model: string | null
  system_prompt: string | null
  theme: 'system' | 'light' | 'dark'
}

export type SSEEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; prompt_tokens: number; completion_tokens: number }
  | { type: 'error'; message: string }
