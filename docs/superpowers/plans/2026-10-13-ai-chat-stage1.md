# Schoolio Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Stage 1 of the Schoolio AI chat site: allowlisted accounts, streamed multi-turn chat with free OpenRouter models via Supabase Edge Functions, saved chats, settings, all deployed from GitHub Actions to GitHub Pages + Supabase.

**Architecture:** React SPA (Vite, HashRouter) on GitHub Pages talks to Supabase Auth and Postgres (RLS) directly, and to two Edge Functions (`models`, `chat`) that proxy OpenRouter with the server-held key. Edge Function logic lives in pure `handler.ts` modules using only web-standard APIs, so Vitest tests them without Deno; `index.ts` is a one-line `Deno.serve` wrapper.

**Tech Stack:** Node 24, Vite + React + TypeScript, Vitest + React Testing Library + jsdom, `@supabase/supabase-js`, `react-router-dom`, `react-markdown` + `remark-gfm` + `rehype-highlight`, Supabase CLI (npm package `supabase`, run via `npx supabase`), pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-ai-chat-design.md`

## Global Constraints

- Browser never calls `openrouter.ai`; all OpenRouter traffic goes through Edge Functions.
- `OPENROUTER_API_KEY` never appears in repo, built site, or any response body.
- Browser env holds only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Vite `base: '/schoolio/'`; router is `HashRouter`.
- Function secrets: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`), `ALLOW_PAID_MODELS` (default `false`).
- Free model = id ends with `:free`, or `pricing.prompt === "0"` and `pricing.completion === "0"`.
- No libraries beyond the Tech Stack line without a ledgered ruling.
- Plain CSS with CSS variables; no CSS framework.
- No test needs a real OpenRouter key.
- Exact user-facing copy (spec §6, use verbatim):
  - `Free-tier limit reached — try again in a minute or switch model.`
  - `This email isn't invited.`
  - `Only free models are enabled.`
  - `Model service unavailable.`
  - `Not saved — retry`
  - `Older messages were trimmed to fit this model's context.`
- Every Edge Function response (including errors and `OPTIONS` preflight) carries CORS headers, because the site's origin is `github.io`.

## Review Focus

1. **SSE frames split across network reads** (a `data:` line cut mid-JSON) — parser must buffer and still yield every delta. Test in Task 4.
2. **OpenRouter error mid-stream** (`data: {"error":{...}}` after some deltas) — reply saved as `incomplete` with partial text, error shown. Tests in Tasks 4 and 6.
3. **Newest user message alone exceeds the context budget** — it is still sent (never an empty request), `trimmed` is true. Test in Task 4.
4. **Allowlist email with different case/whitespace** (`" Friend@X.com "` vs `friend@x.com`) — signup succeeds. Test in Task 2.
5. **Send pressed twice / while streaming** — only one request; composer send disabled while streaming. Tests in Tasks 6 and 7.

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, index.html, playwright.config.ts
src/
  main.tsx                     mounts <App/>
  App.tsx                      HashRouter, routes, auth gate, layout
  styles.css                   CSS variables, light/dark, layout, drawer
  lib/supabase.ts              supabase client singleton
  lib/types.ts                 shared TS types (ChatMessage, Chat, Message, ModelInfo, SSEEvent)
  lib/context.ts               trimContext
  lib/sse.ts                   parseSSE
  lib/errors.ts                ApiError, errorMessage
  api/functions.ts             fetchModels, streamChat
  api/db.ts                    chats/messages/profiles CRUD
  auth/AuthProvider.tsx        session context + useAuth
  auth/AuthPages.tsx           Login, Signup, ResetPassword, UpdatePassword
  chat/useChat.ts              one-chat turn orchestration
  chat/ChatView.tsx            message list + composer + notices
  chat/MessageItem.tsx         markdown, code copy, status badges
  chat/Composer.tsx            textarea, send/stop, draft persistence
  chat/ModelPicker.tsx         searchable model list
  sidebar/Sidebar.tsx          chat list, search, rename, delete, new
  settings/Settings.tsx        default model, system prompt, theme
supabase/
  config.toml                  (from `supabase init`, edited)
  seed.sql                     local-only allowlist seed
  migrations/<ts>_init.sql
  tests/database/schema.test.sql
  functions/_shared/{env.ts,cors.ts,free.ts}
  functions/models/{handler.ts,index.ts}
  functions/chat/{handler.ts,index.ts}
tests/ (Vitest, mirrors src/ and supabase/functions/)
e2e/{mock-openrouter.mjs,chat.spec.ts}
.github/workflows/{test.yml,deploy.yml}
README.md                      owner setup via web UIs
```

---

### Task 1: Project scaffold and CI test workflow

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/lib/supabase.ts`, `.gitignore`, `.env.example`, `supabase/config.toml`, `.github/workflows/test.yml`
- Test: `tests/App.test.tsx`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (= `vitest run`), `test:db` (= `supabase test db`), `e2e` (= `playwright test`). `src/lib/supabase.ts` exports `supabase` (created from `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). `App` default export.

- [ ] **Step 1:** `npm create vite@latest . -- --template react-ts` (accept non-empty dir), then `npm i @supabase/supabase-js react-router-dom react-markdown remark-gfm rehype-highlight` and `npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom supabase @playwright/test`. Delete Vite demo assets/CSS.
- [ ] **Step 2:** `vite.config.ts`: `base: '/schoolio/'`; `test: { environment: 'jsdom', setupFiles: ['tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'] }`. `tests/setup.ts` imports `@testing-library/jest-dom/vitest`. tsconfig: `"allowImportingTsExtensions": true, "noEmit": true` and include `supabase/functions` (Deno-style `.ts` imports must type-check).
- [ ] **Step 3: Write failing test** `tests/App.test.tsx`: mock `../src/lib/supabase` so `auth.getSession` resolves `{ data: { session: null } }` and `onAuthStateChange` returns `{ data: { subscription: { unsubscribe() {} } } }`; render `<App/>`; `expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()`.
- [ ] **Step 4:** Run `npm test`. Expected: FAIL (no heading).
- [ ] **Step 5:** Minimal `App.tsx`: `HashRouter` with a route rendering `<h1>Log in</h1>` when no session (Task 5 replaces it). `npx supabase init`; in `supabase/config.toml` set `[auth] site_url = "http://localhost:5173/schoolio/"`, `[auth.email] enable_confirmations = false`.
- [ ] **Step 6:** Run `npm test`. Expected: PASS 1/1. Run `npm run build`. Expected: exit 0.
- [ ] **Step 7:** `.github/workflows/test.yml` on `push` and `pull_request`: job `unit` (checkout, setup-node 24, `npm ci`, `npm test`, `npm run build` with dummy `VITE_*` env). Tasks 2 and 9 add jobs.
- [ ] **Step 8: Commit** `feat: scaffold vite react app with supabase and CI`.

---

### Task 2: Database schema, RLS, allowlist

**Files:**
- Create: `supabase/migrations/<timestamp>_init.sql` (via `npx supabase migration new init`), `supabase/seed.sql`, `supabase/tests/database/schema.test.sql`
- Modify: `.github/workflows/test.yml` (add `db` job)

**Interfaces:**
- Produces: tables exactly as spec §3 (`allowed_emails`, `profiles`, `chats`, `messages` with every listed column, check, default). Functions: `public.enforce_allowlist()` (trigger `before insert on auth.users`), `public.handle_new_user()` (trigger `after insert on auth.users`, inserts `profiles(user_id)`), `public.bump_chat_updated_at()` (trigger `after insert on messages`). Defaults: `chats.title default 'New chat'`, `created_at/updated_at default now()`, ids `default gen_random_uuid()`, `chats.user_id default auth.uid()`.
- Seed: `insert into allowed_emails values ('e2e@example.com'), ('a@example.com'), ('b@example.com');`

- [ ] **Step 1: Write failing pgTAP test** `schema.test.sql` (`begin; select plan(N); ... select * from finish(); rollback;`). Create users by inserting into `auth.users (id, email)` as `postgres`, impersonate with `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}';`. Assertions:
  - `throws_ok` inserting `auth.users` with `stranger@example.com`.
  - insert of `' A@Example.com '` (allowlist row `a@example.com`) succeeds — `lives_ok` (Review Focus 4; trigger compares `lower(trim(new.email))`).
  - after creating user A, `profiles` has one row for A.
  - as A: insert a chat and a message → `lives_ok`.
  - as B: `select count(*) from chats` = 0; `select count(*) from messages` = 0; `update chats set title='x'` affects 0 rows; inserting a message into A's chat → `throws_ok`.
  - as B: `select count(*) from allowed_emails` throws or returns 0 (no client access).
  - inserting a message bumps the parent chat's `updated_at` (set it to `now() - interval '1 day'` first, then compare).
- [ ] **Step 2:** `npx supabase start` then `npm run test:db`. Expected: FAIL (relations do not exist).
- [ ] **Step 3:** Write the migration. Trigger functions on `auth.users` are `security definer set search_path = ''`. RLS policies: `chats` all ops `using/with check (user_id = auth.uid())`; `messages` all ops `exists (select 1 from chats c where c.id = chat_id and c.user_id = auth.uid())`; `profiles` select/update `user_id = auth.uid()`; `allowed_emails` RLS on, no policies. Grant table privileges to `authenticated` only for `profiles`, `chats`, `messages`.
- [ ] **Step 4:** `npx supabase db reset && npm run test:db`. Expected: PASS all.
- [ ] **Step 5:** Add `db` job to `test.yml`: checkout, setup-node, `npm ci`, `npx supabase start`, `npm run test:db`.
- [ ] **Step 6: Commit** `feat: add schema with RLS and signup allowlist`.

---

### Task 3: Edge Functions `models` and `chat`

**Files:**
- Create: `supabase/functions/_shared/env.ts`, `_shared/cors.ts`, `_shared/free.ts`, `models/handler.ts`, `models/index.ts`, `chat/handler.ts`, `chat/index.ts`
- Test: `tests/functions/free.test.ts`, `tests/functions/models.test.ts`, `tests/functions/chat.test.ts`

**Interfaces:**
- Produces:
  - `type Env = { OPENROUTER_API_KEY?: string; OPENROUTER_BASE_URL?: string; ALLOW_PAID_MODELS?: string }`
  - `corsHeaders: Record<string,string>` (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`)
  - `isFreeModel(m: { id: string; pricing?: { prompt: string; completion: string } }): boolean`
  - `handleModels(req: Request, env: Env, fetchFn?: typeof fetch): Promise<Response>` → 200 `{ allowPaid: boolean, models: ModelInfo[] }`, `ModelInfo = { id, name, context_length, pricing: { prompt, completion }, input_modalities: string[] }` (from upstream `architecture.input_modalities`, default `['text']`), header `Cache-Control: max-age=3600`.
  - `handleChat(req: Request, env: Env, fetchFn?: typeof fetch): Promise<Response>`; body `{ model: string; messages: { role: 'system'|'user'|'assistant'; content: string }[] }`.
  - Error body everywhere: `{ error: { code: string, message: string } }`. Codes: `unavailable` (503, no key or upstream unreachable, message `Model service unavailable.`), `paid_model` (400, `Only free models are enabled.`), `bad_request` (400), upstream status passed through with code `upstream`.
  - `index.ts`: `Deno.serve((req) => handleX(req, Deno.env.toObject()))`.

- [ ] **Step 1: Write failing tests.** Use a `fetchFn` stub recording calls.
  - free: `isFreeModel({id:'x/y:free'})` true; `{id:'x/y', pricing:{prompt:'0',completion:'0'}}` true; `{id:'x/y', pricing:{prompt:'0.000001',completion:'0'}}` false.
  - both handlers: `OPTIONS` → 200 with `Access-Control-Allow-Origin: *`.
  - models: maps upstream `{data:[{id,name,context_length,pricing,architecture:{input_modalities:['text','image']}}]}` to spec shape; `allowPaid` false by default, true when `ALLOW_PAID_MODELS='true'`; no key → 503 `unavailable`.
  - chat: no key → 503 `Model service unavailable.`; missing `model`/`messages` → 400 `bad_request`; model `a/b` with upstream models pricing non-zero → 400 `paid_model`; same with `ALLOW_PAID_MODELS='true'` → forwards; `:free` model forwards to `${OPENROUTER_BASE_URL}/chat/completions` with `Authorization: Bearer <key>`, body containing `stream: true` and `usage: { include: true }`; upstream SSE body bytes returned unchanged with `Content-Type: text/event-stream`; upstream 429 → 429 `{error:{code:'upstream',...}}`; the key string never appears in any response body or header across all cases (assert on `await res.text()` and `[...res.headers]`).
- [ ] **Step 2:** `npm test -- tests/functions`. Expected: FAIL (modules not found).
- [ ] **Step 3:** Implement. Base URL `env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'`. Chat sends `HTTP-Referer: https://github.com/schoolio` and `X-Title: Schoolio`. For non-`:free` ids, chat fetches `/models` and checks `isFreeModel` on the matching entry (unknown id → `paid_model`). Wrap upstream fetch in try/catch → 503 `unavailable`.
- [ ] **Step 4:** `npm test -- tests/functions`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add models and chat edge functions`.

---

### Task 4: Client libs — types, context trimming, SSE parsing, errors, function API

**Files:**
- Create: `src/lib/types.ts`, `src/lib/context.ts`, `src/lib/sse.ts`, `src/lib/errors.ts`, `src/api/functions.ts`
- Test: `tests/lib/context.test.ts`, `tests/lib/sse.test.ts`, `tests/lib/errors.test.ts`, `tests/api/functions.test.ts`

**Interfaces:**
- Consumes: `ModelInfo` shape and error body from Task 3; `supabase` from Task 1.
- Produces:
  - `type Role = 'system'|'user'|'assistant'`; `type ChatMessage = { role: Role; content: string }`
  - `type Chat = { id: string; title: string; model: string; created_at: string; updated_at: string }`
  - `type Message = ChatMessage & { id: string; chat_id: string; model: string|null; status: 'complete'|'incomplete'|'error'; prompt_tokens: number|null; completion_tokens: number|null; created_at: string }`
  - `type ModelInfo` (re-declare Task 3 shape), `type Profile = { user_id: string; default_model: string|null; system_prompt: string|null; theme: 'system'|'light'|'dark' }`
  - `type SSEEvent = { type: 'delta'; text: string } | { type: 'usage'; prompt_tokens: number; completion_tokens: number } | { type: 'error'; message: string }`
  - `trimContext(messages: ChatMessage[], contextLength: number): { messages: ChatMessage[]; trimmed: boolean }`
  - `parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent>`
  - `class ApiError extends Error { status: number; code: string }`; `errorMessage(err: unknown): string`
  - `fetchModels(): Promise<{ allowPaid: boolean; models: ModelInfo[] }>`; `streamChat(model: string, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<SSEEvent>` — both POST/GET `${VITE_SUPABASE_URL}/functions/v1/<name>` with `Authorization: Bearer <session access_token>` and `apikey: <anon key>`; non-2xx → throw `ApiError` from the error body.

- [ ] **Step 1: Write failing tests.**
  - context: tokens = `ceil(chars/4)`; budget = `contextLength - min(4096, floor(contextLength*0.25))`. With `contextLength=1000` (budget 750 tokens = 3000 chars): system(400 chars) + three 1200-char user/assistant msgs + newest user(100 chars) → oldest dropped first, system kept, newest kept, `trimmed: true`; everything fits → same array, `trimmed: false`; newest user message of 10 000 chars alone → result is `[system, newest]`, `trimmed: true` (Review Focus 3).
  - sse: stream built from chunks `['data: {"choices":[{"delta":{"content":"He', 'l"}}]}\n\n: OPENROUTER PROCESSING\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\n', 'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n']` → events `delta 'Hel'`, `delta 'lo'`, `usage 5/2` (Review Focus 1); `data: {"error":{"message":"boom"}}` → `{type:'error', message:'boom'}` (Review Focus 2).
  - errors: `ApiError(429,'upstream')` → `Free-tier limit reached — try again in a minute or switch model.`; `code 'paid_model'` → `Only free models are enabled.`; `code 'unavailable'` → `Model service unavailable.`; other `ApiError` → its message; `TypeError` (network) → `Model service unavailable.`
  - functions: with `fetch` stubbed and `supabase.auth.getSession` mocked, `streamChat` sends bearer token and yields parsed events; 429 response throws `ApiError` with `status 429`.
- [ ] **Step 2:** `npm test -- tests/lib tests/api`. Expected: FAIL.
- [ ] **Step 3:** Implement. `parseSSE` buffers text across chunks with `TextDecoderStream`, splits on `\n\n`, ignores `:` comment lines and `[DONE]`.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add context trimming, SSE parsing, error mapping, function client`.

---

### Task 5: Auth — provider and pages

**Files:**
- Create: `src/auth/AuthProvider.tsx`, `src/auth/AuthPages.tsx`
- Modify: `src/App.tsx` (routes `/login`, `/signup`, `/reset`, `/update-password`; everything else requires session)
- Test: `tests/auth/AuthPages.test.tsx`, `tests/App.test.tsx`

**Interfaces:**
- Consumes: `supabase`.
- Produces: `<AuthProvider>`; `useAuth(): { session: Session|null; loading: boolean; signOut(): Promise<void> }`. Pages export `Login`, `Signup`, `ResetPassword`, `UpdatePassword`. Reset email `redirectTo = location.origin + import.meta.env.BASE_URL + '#/update-password'`.

- [ ] **Step 1: Write failing tests** (mock `supabase.auth`):
  - Signup: `signUp` resolving `{ error: { message: 'Database error saving new user' } }` → shows `This email isn't invited.`; email passed to `signUp` is trimmed + lower-cased.
  - Login: wrong password error message rendered; success calls `signInWithPassword` with entered values.
  - ResetPassword calls `resetPasswordForEmail(email, { redirectTo })` with the value above and shows a "check your email" confirmation.
  - App: unauthenticated visit to `#/` redirects to Login; `onAuthStateChange('SIGNED_OUT')` while on a chat route redirects to Login.
- [ ] **Step 2:** `npm test -- tests/auth tests/App.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Map any signup error whose message contains `Database error` to `This email isn't invited.`; otherwise show the message.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add auth provider and auth pages`.

---

### Task 6: Data layer and `useChat`

**Files:**
- Create: `src/api/db.ts`, `src/chat/useChat.ts`
- Test: `tests/chat/useChat.test.ts`

**Interfaces:**
- Consumes: types, `trimContext`, `streamChat`, `ApiError`, `errorMessage` (Task 4); `supabase`.
- Produces:
  - db: `listChats(): Promise<Chat[]>` (order `updated_at desc`), `createChat(model: string): Promise<Chat>`, `renameChat(id, title): Promise<void>`, `setChatModel(id, model): Promise<void>`, `deleteChat(id): Promise<void>`, `listMessages(chatId): Promise<Message[]>` (order `created_at asc`), `insertMessage(m: Omit<Message,'id'|'created_at'>): Promise<Message>`, `deleteMessage(id): Promise<void>`, `getProfile(): Promise<Profile>`, `updateProfile(patch: Partial<Omit<Profile,'user_id'>>): Promise<void>`. Each throws on supabase `error`.
  - `useChat(opts: { chatId: string|null; model: string; contextLength: number; systemPrompt: string|null; onChatCreated(chat: Chat): void }): { messages: UiMessage[]; streamingText: string; streaming: boolean; error: string|null; trimmed: boolean; restoredDraft: string|null; send(text: string): Promise<void>; stop(): void; regenerate(): Promise<void>; editLast(text: string): Promise<void>; retrySave(localId: string): Promise<void> }` where `UiMessage = Message & { localId: string; saveFailed?: boolean }`.

**Behaviour (spec §5–6; tests pin each):**
- `send`: no-op if `streaming` (Review Focus 5). Create chat if `chatId` null (call `onChatCreated`). Insert user message. Build context `[system?] + history + new`, `trimContext`, stream. On end insert assistant `{status:'complete', model, prompt_tokens, completion_tokens}`. After the first assistant reply in a chat titled `New chat`, call `streamChat(model, [{role:'user', content:'Title this conversation in 6 words or fewer. Reply with the title only.\n\n' + firstUserText}])`, collect text, `renameChat` (ignore failures).
- `stop()` aborts; partial text saved with `status:'incomplete'`.
- `error` SSE event or thrown non-429 error after deltas → save partial as `incomplete` (if any text), set `error = errorMessage(e)`.
- 429 `ApiError` → delete the just-inserted user message, set `restoredDraft` to its text, set `error`.
- `insertMessage` failure → keep message in `messages` with `saveFailed: true`; `retrySave(localId)` re-inserts and clears the flag.
- `regenerate`: delete last assistant message, re-stream from history. `editLast(text)`: delete last user message and any reply after it, then `send(text)`.

- [ ] **Step 1: Write failing tests** with `vi.mock` of `../src/api/db` and `../src/api/functions` (`streamChat` returns a scripted async generator) using `renderHook`:
  - happy path inserts user then assistant with usage 5/2 and status `complete`; auto-title calls `renameChat(chatId, 'Greeting')` when title stream yields `Greeting`.
  - second `send` while first is streaming → `streamChat` called once.
  - stream yields `delta 'par'` then `error 'boom'` → assistant inserted `{content:'par', status:'incomplete'}`, `error === 'boom'`.
  - `streamChat` throws `ApiError(429,'upstream')` → `deleteMessage` called on the user message, `restoredDraft === 'hi'`, `error` equals the 429 copy.
  - `insertMessage` rejects → message has `saveFailed: true`; `retrySave` → `insertMessage` called again, flag cleared.
  - `trimmed` true when `contextLength` tiny.
  - `regenerate` deletes last assistant row then streams again.
- [ ] **Step 2:** `npm test -- tests/chat/useChat.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add data layer and chat turn orchestration`.

---

### Task 7: Chat UI — ChatView, MessageItem, Composer, ModelPicker

**Files:**
- Create: `src/chat/ChatView.tsx`, `src/chat/MessageItem.tsx`, `src/chat/Composer.tsx`, `src/chat/ModelPicker.tsx`
- Modify: `src/styles.css`
- Test: `tests/chat/MessageItem.test.tsx`, `tests/chat/Composer.test.tsx`, `tests/chat/ModelPicker.test.tsx`, `tests/chat/ChatView.test.tsx`

**Interfaces:**
- Consumes: `useChat`, `fetchModels`, types.
- Produces:
  - `<MessageItem message={UiMessage} onRetrySave?={() => void} />` — markdown via `react-markdown` + `remark-gfm` + `rehype-highlight`; each `pre` gets a "Copy" button using `navigator.clipboard.writeText`; `status==='incomplete'` shows "Incomplete"; `saveFailed` shows button `Not saved — retry`.
  - `<Composer chatKey={string} disabled={boolean} streaming={boolean} restoredDraft={string|null} onSend(text) onStop() />` — Enter sends, Shift+Enter newline; send disabled while `streaming` or empty; shows Stop while streaming; draft persisted in `sessionStorage` key `draft:<chatKey>` (wrapped in try/catch) and restored on mount; `restoredDraft` overwrites the textarea when it changes.
  - `<ModelPicker value={string} onChange(id) models={ModelInfo[]} allowPaid={boolean} />` — search input filters by id/name (case-insensitive); lists free models only unless `allowPaid`, then a "Show paid" checkbox appears; each row shows `context_length`; a `value` absent from `models` still renders as the current selection.
  - `<ChatView chatId={string|null} onChatCreated(chat) profile={Profile} />` — loads models once via `fetchModels` (on failure shows `Model service unavailable.` and disables composer); model defaults to chat's model, else `profile.default_model`, else first free model; changing the picker on an existing chat calls `setChatModel`; shows `error` with Retry (calls `regenerate`) and a focus-the-picker "Switch model" button; shows `Older messages were trimmed to fit this model's context.` when `trimmed`; Regenerate button under last assistant message; Edit button on last user message.

- [ ] **Step 1: Write failing tests:**
  - MessageItem: renders `**bold**` as `<strong>`; code block has Copy button that calls `clipboard.writeText` with the code; `saveFailed` button calls `onRetrySave`; incomplete badge shown.
  - Composer: Enter calls `onSend('hi')` and clears; while `streaming`, send button disabled and Enter does not call `onSend` (Review Focus 5), Stop calls `onStop`; draft survives unmount/remount via sessionStorage; `restoredDraft='hi'` fills textarea.
  - ModelPicker: typing `llama` filters; paid model hidden when `allowPaid=false`, visible after ticking Show paid when `allowPaid=true`.
  - ChatView (mock `useChat` and `fetchModels`): `fetchModels` rejecting → `Model service unavailable.` visible and textarea disabled; `trimmed` → notice visible; `error` → Retry calls `regenerate`.
- [ ] **Step 2:** `npm test -- tests/chat`. Expected: FAIL (new files missing; Task 6 tests still pass).
- [ ] **Step 3:** Implement. Styles: centered message column max 48rem, user messages right-aligned bubbles, code blocks scroll horizontally.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add chat UI with markdown, composer and model picker`.

---

### Task 8: Sidebar, settings, theme, layout

**Files:**
- Create: `src/sidebar/Sidebar.tsx`, `src/settings/Settings.tsx`
- Modify: `src/App.tsx` (authenticated layout: Sidebar + routes `#/` new chat, `#/c/:id`, `#/settings`), `src/styles.css`
- Test: `tests/sidebar/Sidebar.test.tsx`, `tests/settings/Settings.test.tsx`

**Interfaces:**
- Consumes: db functions (Task 6), `ChatView` (Task 7), `ModelPicker`, `useAuth`.
- Produces:
  - `<Sidebar chats={Chat[]} activeId={string|null} onNew() onSelect(id) onRename(id, title) onDelete(id) onSignOut() />` — search box filters by title (case-insensitive); rename inline (Enter saves, Escape cancels, empty title rejected); delete asks `window.confirm`.
  - `<Settings profile={Profile} models={ModelInfo[]} allowPaid={boolean} onSave(patch) />` — default model (ModelPicker), system prompt textarea, theme select `system|light|dark`.
  - Theme applied as `document.documentElement.dataset.theme` (`light`/`dark`, removed for `system`); CSS uses `prefers-color-scheme` when no `data-theme`.
  - Below 768px the sidebar is an off-canvas drawer opened by a menu button and closed on chat select.
  - App refetches `listChats()` after `onChatCreated`, rename, delete, and after each completed reply (so ordering follows `updated_at`).

- [ ] **Step 1: Write failing tests:**
  - Sidebar: search `math` shows only matching titles; rename `Enter` calls `onRename(id,'New')`; empty rename does not call; delete with `confirm` → true calls `onDelete`, false does not.
  - Settings: changing system prompt and theme then Save calls `onSave({ system_prompt: 'be concise', theme: 'dark', default_model: <id> })`.
- [ ] **Step 2:** `npm test -- tests/sidebar tests/settings`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire App.
- [ ] **Step 4:** `npm test`. Expected: PASS all suites. `npm run build` exit 0.
- [ ] **Step 5: Commit** `feat: add sidebar, settings and theme`.

---

### Task 9: End-to-end smoke test

**Files:**
- Create: `e2e/mock-openrouter.mjs`, `e2e/chat.spec.ts`, `playwright.config.ts`, `supabase/functions/.env.test`
- Modify: `.github/workflows/test.yml` (add `e2e` job), `.gitignore`

**Interfaces:**
- Consumes: whole app; seed user `e2e@example.com` (Task 2).
- Produces: `mock-openrouter.mjs` — Node `http` server on port `4010`: `GET /api/v1/models` → one model `{id:'mock/model:free', name:'Mock', context_length: 8192, pricing:{prompt:'0',completion:'0'}, architecture:{input_modalities:['text']}}`; `POST /api/v1/chat/completions` → SSE `Hello` `from mock` deltas, usage chunk, `[DONE]`.
- `.env.test`: `OPENROUTER_API_KEY=test-key`, `OPENROUTER_BASE_URL=http://host.docker.internal:4010/api/v1`.

- [ ] **Step 1: Write the test** `e2e/chat.spec.ts`:
  - `request.post('<SUPABASE_URL>/functions/v1/chat')` with no Authorization → status 401.
  - UI: go to `/schoolio/#/signup`, sign up `e2e@example.com` / `password123`; send `hi`; expect text `Hello from mock`; reload; click the chat in the sidebar; expect `hi` and `Hello from mock` still visible.
- [ ] **Step 2:** `playwright.config.ts`: `webServer` = [`node e2e/mock-openrouter.mjs` (port 4010), `npm run dev` (port 5173, env `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from `npx supabase status -o env`)], `baseURL: 'http://localhost:5173'`. Start `npx supabase start`, `npx supabase db reset`, background `npx supabase functions serve --env-file supabase/functions/.env.test`, `npx playwright install --with-deps chromium`, then `npm run e2e`. Expected: PASS. If it fails, confirm the failure is in app code, not wiring, before changing anything. If the edge runtime cannot reach `host.docker.internal`, use the Docker bridge gateway IP (`172.17.0.1`) and ledger it.
- [ ] **Step 3:** Add `e2e` job to `test.yml` running the Step 2 sequence.
- [ ] **Step 4: Commit** `test: add end-to-end smoke test with mock OpenRouter`.

---

### Task 10: Deploy workflow and owner README

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`; variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

- [ ] **Step 1:** `deploy.yml` on push to `main` (and `workflow_dispatch`), `permissions: { contents: read, pages: write, id-token: write }`:
  - job `supabase`: `npx supabase link --project-ref $SUPABASE_PROJECT_REF -p $SUPABASE_DB_PASSWORD`, `npx supabase db push`, `npx supabase functions deploy chat models --project-ref $SUPABASE_PROJECT_REF` (only these two; never seed, never `.env.test`).
  - job `pages` (needs `supabase`): `npm ci`, `npm run build` with `VITE_*` from `vars`, `actions/upload-pages-artifact` (`dist`), `actions/deploy-pages`.
- [ ] **Step 2:** Verify: `npx --yes @action-validator/cli .github/workflows/deploy.yml .github/workflows/test.yml` (or `actionlint` if available). Expected: no errors. `git grep -n -i 'sk-or-'` Expected: no matches.
- [ ] **Step 3:** `README.md` — owner setup, browser only, numbered: create Supabase project; Auth → disable email confirmation, set Site URL and Redirect URL to `https://<user>.github.io/schoolio/`; create access token; add GitHub secrets/variables (names above); repo Settings → Pages → Source "GitHub Actions"; push to `main`; add allowlist rows in Table Editor → `allowed_emails` (lower-case); later: Edge Functions → Secrets → add `OPENROUTER_API_KEY`; optional custom SMTP (Resend) for password reset; how to reset a friend's password from the dashboard until then.
- [ ] **Step 4: Commit** `ci: add deploy workflow and owner setup guide`.
