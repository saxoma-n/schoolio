# Schoolio — AI Chat Website Design

**Date:** 2026-10-13
**Status:** Draft for review

## 1. Purpose

A personal ChatGPT/Claude-style chat website backed by OpenRouter, used by the owner and a few invited friends, all sharing the owner's OpenRouter API key and its free-model quota.

**Hard constraints**
- **Cloud only.** Nothing may depend on a machine the owner runs. The owner works from a restricted school laptop (iBoss cloud filter) with only a browser; `github.com`/Codespaces and `supabase.com`/`*.supabase.co` are reachable, `openrouter.ai` is **not**.
- **Free.** GitHub Pages + Supabase free tier + OpenRouter free models.
- **Key secrecy.** The OpenRouter key never reaches the browser or the repo.

**Consequence of the iBoss block:** the browser must never call `openrouter.ai` directly — not for chat, not for the model list. Every OpenRouter call goes through a Supabase Edge Function.

**Success criteria (Stage 1)**
- An allowlisted user can sign up, log in, pick a free model, have a multi-turn streamed conversation, close the tab, and find the chat again on any device.
- A non-allowlisted email cannot create an account.
- No user can read or modify another user's chats.
- The OpenRouter key appears nowhere in the repo, the built site, or any response body.

## 2. Architecture

```
Browser — React SPA on GitHub Pages (https://<user>.github.io/schoolio/)
  ├── Supabase Auth ............ email + password sessions
  ├── Supabase Postgres ........ chats, messages, profiles (Row Level Security)
  └── Supabase Edge Functions
        ├── models ............. GET  → proxies OpenRouter /api/v1/models
        └── chat ............... POST → adds OPENROUTER_API_KEY, streams completion
                                   └── https://openrouter.ai/api/v1/chat/completions
```

- **Frontend:** Vite + React + TypeScript. Plain CSS with CSS variables for theming. `HashRouter` (GitHub Pages has no SPA fallback). Vite `base: '/schoolio/'`.
- **Libraries:** `@supabase/supabase-js`, `react-router-dom`, `react-markdown` + `remark-gfm` + `rehype-highlight`. No others without a reason.
- **Browser holds only** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public by design; RLS is the protection).
- **Repo must be public** (free GitHub Pages requirement on personal accounts). Nothing secret is committed.

## 3. Data model

All tables have RLS enabled. Migrations live in `supabase/migrations/`.

| Table | Columns | RLS |
|---|---|---|
| `allowed_emails` | `email text primary key` (stored lower-case) | No client access at all; owner edits via Supabase dashboard |
| `profiles` | `user_id uuid pk → auth.users`, `default_model text`, `system_prompt text`, `theme text check in ('system','light','dark') default 'system'` | owner-only select/update; row created by trigger on signup |
| `chats` | `id uuid pk`, `user_id uuid → auth.users`, `title text`, `model text`, `created_at`, `updated_at` | `user_id = auth.uid()` for all ops |
| `messages` | `id uuid pk`, `chat_id uuid → chats on delete cascade`, `role text check in ('user','assistant','system')`, `content text`, `model text`, `status text check in ('complete','incomplete','error') default 'complete'`, `prompt_tokens int`, `completion_tokens int`, `created_at` | allowed iff the parent chat's `user_id = auth.uid()` |

- **Allowlist enforcement:** a `BEFORE INSERT` trigger on `auth.users` raises an exception when `lower(new.email)` is not in `allowed_emails`. The client maps the resulting signup error to "This email isn't invited."
- `chats.updated_at` is bumped by trigger when a message is inserted, so the sidebar sorts by last activity.
- Token columns exist in Stage 1 so the Stage 2 usage dashboard has history.
- **Future BYOK (not built):** add `profiles.openrouter_key` (encrypted); `chat` would prefer it over the shared key.

## 4. Edge Functions

Both run on Supabase (Deno), require a valid user JWT (Supabase `verify_jwt`, default on), and read config from function secrets:
`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`; overridden in tests to a mock), `ALLOW_PAID_MODELS` (default `false`).

### `models` — GET
- Fetches `${OPENROUTER_BASE_URL}/models`, returns `{ allowPaid: boolean, models: [{ id, name, context_length, pricing, input_modalities }] }` (`allowPaid` mirrors `ALLOW_PAID_MODELS` so the UI knows whether to offer paid models).
- Response `Cache-Control: max-age=3600`.

### `chat` — POST
Request: `{ model: string, messages: [{ role, content }] }`
- Rejects (400) a model that is not free (id ends with `:free` or prompt+completion pricing are `"0"`) unless `ALLOW_PAID_MODELS=true` — protects the owner's credit.
- Calls `/chat/completions` with `stream: true`, the key in `Authorization`, and `HTTP-Referer`/`X-Title` headers.
- Streams the SSE body back unchanged. Upstream errors are returned as JSON `{ error: { code, message } }` with the upstream status (e.g. 429).
- Never echoes the key or upstream request headers.

The function is stateless; it does not write to the database.

## 5. Frontend behaviour

### Auth
- Sign up, log in, log out, password reset pages.
- **Email confirmation is turned off** in Supabase settings — the allowlist already gates signup, and Supabase's built-in email sender only delivers to project team members.
- **Password reset** works only after a custom SMTP provider (e.g. Resend free tier) is configured in Supabase. Until then the owner resets passwords in the dashboard. The reset page is built in Stage 1 regardless.

### Chat flow (one turn)
1. Insert the user `message` row (creating the `chats` row first if new).
2. Build context: optional system prompt (from profile) + full chat history, trimmed (below).
3. POST to `chat`; render tokens as they stream. Stop button aborts the fetch.
4. On stream end, insert the assistant row with content, model, and token usage from the final SSE chunk (`status='complete'`).
5. Aborted or cut-off stream → save partial content with `status='incomplete'`; UI shows a Regenerate button.

### Context trimming
- Token estimate: `ceil(chars / 4)` per message.
- Budget: `context_length − min(4096, 25% of context_length)` (reserve for the reply).
- Drop oldest non-system messages until under budget; system prompt is always kept; the newest user message is always kept.
- If anything was dropped, show "Older messages were trimmed to fit this model's context."

### Features
- Markdown rendering, syntax-highlighted code blocks with a copy button.
- Regenerate last reply (replaces the last assistant message). Edit last user message and resend (deletes the following assistant reply).
- Sidebar: chats by `updated_at` desc; new, rename, delete, title search. Collapses to a drawer below 768 px.
- Auto-title: after the first assistant reply, call `chat` with the chat's model and a "title this in ≤6 words" prompt; on failure keep "New chat".
- Model picker: searchable; free models only unless the server allows paid (UI shows a "show paid" toggle only then); shows context length. Each chat stores its model; switching mid-chat is allowed and each message records its model.
- Settings: default model, system prompt, theme (system/light/dark).

## 6. Error handling

| Situation | User sees | Data |
|---|---|---|
| 429 from OpenRouter | "Free-tier limit reached — try again in a minute or switch model." | Draft input kept |
| Other upstream error / model unavailable | Inline error with Retry and Switch model | User message kept |
| Stream cut off | Partial reply marked incomplete + Regenerate | Saved `status='incomplete'` |
| Session expired | Silent refresh; else redirect to login keeping the draft | Draft kept |
| DB insert fails | Message shown with "Not saved — retry" | Retry re-inserts |
| Non-allowlisted signup | "This email isn't invited." | No account created |
| Paid model requested while disabled | "Only free models are enabled." | — |

## 7. Development, testing, and deployment (all cloud)

| Job | Where |
|---|---|
| Live site | GitHub Pages |
| Auth, DB, functions | One hosted Supabase free project |
| Editing code | GitHub Codespaces in the browser |
| Tests | GitHub Actions on every push and PR |
| Deploy | GitHub Actions on push to `main` |

- **No local Supabase on the owner's machine.** Codespaces development points at the hosted project.
- **Tests (`.github/workflows/test.yml`):**
  - Unit (Vitest): context trimming, SSE parsing, error mapping, model filtering.
  - Component (React Testing Library): chat view, sidebar, model picker with Supabase/fetch mocked.
  - Database (pgTAP via `supabase test db` on a throwaway local Supabase inside the Actions runner): RLS isolation between two users; allowlist trigger blocks unlisted emails; profile created on signup.
  - Edge functions (`deno test`, OpenRouter mocked via `OPENROUTER_BASE_URL`): no JWT → 401; paid model rejected; stream passed through; 429 passed through; key absent from responses.
  - E2E smoke (Playwright, same runner, function pointed at a mock OpenRouter): sign up allowlisted user → send message → see streamed reply → reload → chat persists.
  - No test needs a real OpenRouter key.
- **Deploy (`.github/workflows/deploy.yml`):** build and publish to Pages; `supabase db push`; `supabase functions deploy`.
- **Configuration (all via web UIs):**
  - GitHub secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
  - GitHub variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  - Supabase function secrets: `OPENROUTER_API_KEY` (added later by the owner), `ALLOW_PAID_MODELS`.
  - Supabase Auth: email confirmation off; site URL and redirect URL set to the Pages URL.
- **Before the key exists:** the site deploys and works except chat and the model list, which show "Model service unavailable."

## 8. Stage 2 (planned, not in Stage 1)

Each is additive; none changes the Stage 1 schema except by adding tables/columns.
- **Image and file uploads:** Supabase Storage bucket with per-user RLS. Images only offered for models whose `input_modalities` include `image`. Text/PDF content extracted in the browser and inlined into the message.
- **Sharing chats:** `shares (token, chat_id, created_at, revoked_at)` + a public read-only route showing a snapshot; revocable.
- **Folders:** `folders (id, user_id, name)` + nullable `chats.folder_id`; sidebar grouping and drag-and-drop.
- **Voice:** browser Web Speech API for dictation (`SpeechRecognition`) and read-aloud (`speechSynthesis`). No server cost.
- **Usage dashboard:** per-model requests and tokens over time from `messages` token columns.

## 9. Out of scope

Open signup, billing, admin UI (allowlist is edited in the Supabase dashboard), OAuth providers, BYOK (designed for, not built).
