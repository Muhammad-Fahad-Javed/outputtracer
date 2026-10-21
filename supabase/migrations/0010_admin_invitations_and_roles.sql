-- ==============================================================================
-- OutputTracer: Phase 6 — Advanced Admin Management & Role Invitations
-- (0010_admin_invitations_and_roles.sql)
-- ==============================================================================

-- 1. ADMIN INVITATIONS TABLE
-- Secure, expiring tokens for inviting new administrators by authorized admins.
create table if not exists public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  invitee_email text not null check (char_length(trim(invitee_email)) between 5 and 254),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  role text not null default 'admin' check (role in ('admin', 'staff')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  accepted_by uuid references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '3 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_invitations_token
  on public.admin_invitations(token) where status = 'pending';

create index if not exists idx_admin_invitations_email
  on public.admin_invitations(invitee_email, status);

alter table public.admin_invitations enable row level security;

-- Admins can view all admin invitations
create policy "Admins can view admin invitations"
  on public.admin_invitations for select
  using (public.is_admin());

-- Only admins can issue admin invitations
create policy "Admins can insert admin invitations"
  on public.admin_invitations for insert
  with check (public.is_admin());

-- Only admins can revoke or update admin invitations
create policy "Admins can update admin invitations"
  on public.admin_invitations for update
  using (public.is_admin());
