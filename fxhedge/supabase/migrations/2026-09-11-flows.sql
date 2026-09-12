-- 2026-09-11 — replace `scenarios` with `flows`.
-- Run in: supabase.com/dashboard -> SQL Editor -> New query -> paste -> Run
-- Safe to drop `scenarios`: no application code has ever written to it.

create table public.flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('outgoing','incoming')),
  label text not null default 'Supplier invoice',
  amount numeric not null check (amount > 0),
  currency text not null,
  home_currency text not null,
  invoiced_on date not null,
  -- A date, not a countdown: a stored "days until due" goes stale.
  due_on date not null check (due_on >= invoiced_on),
  created_at timestamptz default now()
);

create index flows_user_created_idx on public.flows (user_id, created_at desc);

alter table public.flows enable row level security;

create policy "flows visible to owner"
  on public.flows for select using (auth.uid() = user_id);
create policy "flows insert by owner"
  on public.flows for insert with check (auth.uid() = user_id);
create policy "flows updateable by owner"
  on public.flows for update using (auth.uid() = user_id);
create policy "flows delete by owner"
  on public.flows for delete using (auth.uid() = user_id);

drop table if exists public.scenarios;
