begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- seed may or may not have run; make the allowlist deterministic
insert into public.allowed_emails (email) values ('a@example.com'), ('b@example.com') on conflict do nothing;

select throws_ok(
  $$ insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000f', 'stranger@example.com') $$,
  null, null, 'unlisted email cannot sign up'
);

select lives_ok(
  $$ insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', ' A@Example.com ') $$,
  'allowlisted email with different case/whitespace can sign up'
);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

select is(
  (select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  1, 'profile created on signup'
);

-- act as A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; -- legacy auth.uid() reads this

select lives_ok(
  $$ insert into public.chats (id, model) values ('10000000-0000-0000-0000-000000000001', 'x/y:free') $$,
  'A can create a chat'
);
select lives_ok(
  $$ insert into public.messages (chat_id, role, content) values ('10000000-0000-0000-0000-000000000001', 'user', 'hi') $$,
  'A can add a message'
);
select is((select count(*)::int from public.chats), 1, 'A sees own chat');

-- act as B
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b'; -- legacy auth.uid() reads this

select is((select count(*)::int from public.chats), 0, 'B cannot see A chats');
select is((select count(*)::int from public.messages), 0, 'B cannot see A messages');
select is_empty(
  $$ update public.chats set title = 'x' returning id $$,
  'B cannot update A chat'
);
select throws_ok(
  $$ insert into public.messages (chat_id, role, content) values ('10000000-0000-0000-0000-000000000001', 'user', 'sneaky') $$,
  null, null, 'B cannot insert into A chat'
);
select throws_ok(
  $$ select count(*) from public.allowed_emails $$,
  null, null, 'clients cannot read the allowlist'
);

-- updated_at bump
reset role;
update public.chats set updated_at = now() - interval '1 day' where id = '10000000-0000-0000-0000-000000000001';
select ok(
  (select updated_at < now() - interval '1 hour' from public.chats where id = '10000000-0000-0000-0000-000000000001'),
  'updated_at set back'
);
insert into public.messages (chat_id, role, content) values ('10000000-0000-0000-0000-000000000001', 'assistant', 'hello');
select ok(
  (select updated_at >= now() - interval '1 minute' from public.chats where id = '10000000-0000-0000-0000-000000000001'),
  'new message bumps chat updated_at'
);

select * from finish();
rollback;
