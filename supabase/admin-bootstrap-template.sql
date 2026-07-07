-- MK Fraud Readiness Score V1 - Admin bootstrap template
-- Use only after creating the MK admin user in Supabase Auth.
-- Replace the placeholders before running. Do not commit real admin IDs in source control.

insert into public.admin_profiles (id, email, full_name, role, status, mfa_required)
values (
  '00000000-0000-0000-0000-000000000000', -- replace with auth.users.id for the MK admin user
  'admin@mkfraud.co.za',                  -- replace with the MK admin email created in Supabase Auth
  'MK Platform Admin',
  'platform_admin',
  'active',
  true
)
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  status = excluded.status,
  mfa_required = excluded.mfa_required,
  updated_at = now();
