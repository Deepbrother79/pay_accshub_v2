-- Re-run migration idempotently: drop conflicting policies first, then create
create extension if not exists pgcrypto;

-- Products
create table if not exists public.products (
  product_id uuid primary key,
  name text not null,
  value_credits_usd numeric(18,4) not null check (value_credits_usd > 0),
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
-- Policies
drop policy if exists "Products are viewable by everyone" on public.products;
create policy "Products are viewable by everyone" on public.products
for select using (true);

-- Payment history
create table if not exists public.payment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  invoice_id text unique,
  status text not null,
  amount_usd numeric(18,4),
  amount_crypto numeric(28,8),
  currency text,
  created_at timestamptz not null default now(),
  raw jsonb
);
alter table public.payment_history enable row level security;
-- Policies
drop policy if exists "Users can view their own payments" on public.payment_history;
drop policy if exists "Users can insert payment pending records" on public.payment_history;
drop policy if exists "Users can update their own payments" on public.payment_history;
create policy "Users can view their own payments" on public.payment_history
for select using (auth.uid() = user_id);
create policy "Users can insert payment pending records" on public.payment_history
for insert with check (auth.uid() = user_id);
create policy "Users can update their own payments" on public.payment_history
for update using (auth.uid() = user_id);
create index if not exists idx_payment_history_user_id on public.payment_history(user_id);
create index if not exists idx_payment_history_created_at on public.payment_history(created_at);

-- Transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid references public.products(product_id),
  token_type text not null check (token_type in ('product','master')),
  token_string text not null,
  credits numeric(28,8) not null,
  usd_spent numeric(18,4) not null,
  value_credits_usd_label text,
  created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
-- Policies
drop policy if exists "Users can view their own transactions" on public.transactions;
drop policy if exists "Users can insert their own transactions" on public.transactions;
create policy "Users can view their own transactions" on public.transactions
for select using (auth.uid() = user_id);
create policy "Users can insert their own transactions" on public.transactions
for insert with check (auth.uid() = user_id);
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_created_at on public.transactions(created_at);
