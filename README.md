# Schoolio

A personal AI chat site (like ChatGPT/Claude) for you and invited friends, using free models from OpenRouter.

- **Site:** GitHub Pages — `https://<your-github-username>.github.io/schoolio/`
- **Accounts, saved chats, AI proxy:** Supabase (free tier)
- **AI:** OpenRouter free models, called only from Supabase — your browser never talks to openrouter.ai, so it works on networks that block it.

Everything below is done in a web browser. Nothing needs to run on your own computer.

## One-time setup

### 1. Create the Supabase project
1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any name and region, and **save the database password** somewhere safe.
2. When it's ready, open **Project Settings → General** and copy the **Project ID** (looks like `abcdefghijklmnop`).
3. Open **Project Settings → API Keys** and copy:
   - the **Project URL** (`https://<project-id>.supabase.co`)
   - the **anon / publishable** key (this one is safe to be public)

### 2. Configure Supabase Auth
In **Authentication → Sign In / Providers → Email**:
- turn **Confirm email** **off** (the invite list already controls who can join)

In **Authentication → URL Configuration**:
- **Site URL:** `https://<your-github-username>.github.io/schoolio/`
- **Redirect URLs:** add the same URL

### 3. Create a Supabase access token
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → **Generate new token**. Copy it.

### 4. Add secrets and variables to GitHub
In this repo: **Settings → Secrets and variables → Actions**.

**Secrets** tab → **New repository secret**:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the token from step 3 |
| `SUPABASE_PROJECT_REF` | the Project ID from step 1 |
| `SUPABASE_DB_PASSWORD` | the database password from step 1 |

**Variables** tab → **New repository variable**:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Project URL |
| `VITE_SUPABASE_ANON_KEY` | the anon / publishable key |

### 5. Turn on GitHub Pages
**Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.

The repo must be **public** for free GitHub Pages. Nothing secret is stored in it.

### 6. Deploy
Push (or merge) to `main`. The **deploy** workflow (Actions tab) sets up the database, deploys the AI functions and publishes the site. Re-run it any time from **Actions → deploy → Run workflow**.

### 7. Invite people (including yourself)
Supabase → **Table Editor → `allowed_emails`** → **Insert row** → enter the email in **lower case**. Only listed emails can sign up. Then open the site and **Sign up**.

### 8. Add your OpenRouter key (when you can reach openrouter.ai)
1. On a network where openrouter.ai isn't blocked, sign in at [openrouter.ai](https://openrouter.ai) → **Keys** → **Create key**.
2. Supabase → **Edge Functions → Secrets** → add `OPENROUTER_API_KEY` with that key.

Until then the site works, but chat shows **"Model service unavailable."**

## Everyday admin

- **Invite someone:** add their email to `allowed_emails` (step 7).
- **Reset someone's password:** Supabase → **Authentication → Users** → the user's **⋯** menu → send a recovery email or set a new password. Supabase's built-in email only reaches members of your Supabase team, so for friends to get reset emails, add a free SMTP provider (e.g. [Resend](https://resend.com)) under **Authentication → Emails → SMTP Settings**.
- **Allow paid models (costs your OpenRouter credit):** add the Edge Function secret `ALLOW_PAID_MODELS` = `true`. The model picker then shows a "Show paid" option.

## Development (in GitHub Codespaces)

```bash
npm ci
npm test          # unit + component tests
npm run build
```

Database and end-to-end tests need Docker and run automatically in GitHub Actions (`.github/workflows/test.yml`). To run them in a Codespace:

```bash
npx supabase start
npm run test:db
```
