-- Schoolio Stage 1 schema: allowlisted signup, per-user chats/messages/profiles under RLS.

create table public.allowed_emails (
  email text primary key check (email = lower(trim(email)))
);

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  default_model text,
  system_prompt text,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark'))
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default 'New chat',
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chats_user_updated on public.chats (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  status text not null default 'complete' check (status in ('complete', 'incomplete', 'error')),
  prompt_tokens int,
  completion_tokens int,
  created_at timestamptz not null default now()
);
create index messages_chat_created on public.messages (chat_id, created_at);

-- Signup gate: only allowlisted emails may create an auth user.
create function public.enforce_allowlist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(trim(new.email))) then
    raise exception 'email not invited';
  end if;
  return new;
end $$;

create trigger enforce_allowlist before insert on auth.users
  for each row execute function public.enforce_allowlist();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sidebar sorts by last activity.
create function public.bump_chat_updated_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.chats set updated_at = now() where id = new.chat_id;
  return new;
end $$;

create trigger bump_chat_updated_at after insert on public.messages
  for each row execute function public.bump_chat_updated_at();

-- Row Level Security
alter table public.allowed_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;

-- Allowlist is edited only from the Supabase dashboard.
revoke all on public.allowed_emails from anon, authenticated;

revoke all on public.profiles, public.chats, public.messages from anon;

create policy "own profile read" on public.profiles for select to authenticated
  using (user_id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own chats" on public.chats for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "messages in own chats" on public.messages for all to authenticated
  using (exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid()));

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.chats, public.messages to authenticated;
