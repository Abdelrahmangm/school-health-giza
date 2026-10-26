-- Core baseline for Supabase/PostgreSQL; apply only to a TEST project first.
create extension if not exists pgcrypto;

create table if not exists public.administrations (
 id uuid primary key default gen_random_uuid(),
 name_ar text not null unique,
 created_at timestamptz not null default now()
);
create table if not exists public.user_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('directorate_admin','directorate_viewer','administration_data_entry')),
 administration_id uuid references public.administrations(id),
 display_name text,
 check ((role='administration_data_entry' and administration_id is not null) or (role <> 'administration_data_entry' and administration_id is null))
);
create table if not exists public.school_years (
 id uuid primary key default gen_random_uuid(),
 label text unique not null,
 starts_on date not null,
 ends_on date not null,
 check (ends_on > starts_on)
);
create table if not exists public.programs (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 name_ar text not null
);
create table if not exists public.program_year_versions (
 id uuid primary key default gen_random_uuid(),
 program_id uuid not null references public.programs(id),
 school_year_id uuid not null references public.school_years(id),
 version integer not null default 1,
 enabled boolean not null default true,
 config jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(program_id,school_year_id,version)
);
create table if not exists public.indicators (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 name_ar text not null,
 unit text not null default 'count'
);
create table if not exists public.weekly_submissions (
 id uuid primary key default gen_random_uuid(),
 administration_id uuid not null references public.administrations(id),
 school_year_id uuid not null references public.school_years(id),
 week_start date not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 reopened_until timestamptz,
 reopen_reason text,
 unique(administration_id,school_year_id,week_start),
 check (extract(dow from week_start) = 0)
);
create table if not exists public.submission_revisions (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null references public.weekly_submissions(id),
 revision_number integer not null,
 status text not null check(status in ('draft','provisional','approved','needs_correction')),
 submitted_at timestamptz,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 review_comment text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(submission_id,revision_number)
);
create unique index if not exists one_approved_revision_per_submission on public.submission_revisions(submission_id) where status='approved';
create table if not exists public.report_facts (
 revision_id uuid not null references public.submission_revisions(id) on delete cascade,
 program_id uuid not null references public.programs(id),
 sector text not null check(sector in ('general','azhar')),
 grade_code text not null,
 indicator_id uuid not null references public.indicators(id),
 count_value integer not null check(count_value >= 0),
 primary key(revision_id,program_id,sector,grade_code,indicator_id)
);
create table if not exists public.target_versions (
 id uuid primary key default gen_random_uuid(),
 administration_id uuid not null references public.administrations(id),
 school_year_id uuid not null references public.school_years(id),
 program_id uuid not null references public.programs(id),
 sector text not null check(sector in ('general','azhar')),
 grade_code text not null,
 version integer not null,
 target_count integer not null check(target_count>=0),
 status text not null check(status in ('proposed','approved','rejected')),
 proposed_by uuid not null references auth.users(id),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(administration_id,school_year_id,program_id,sector,grade_code,version)
);
create table if not exists public.audit_log (
 id bigserial primary key,
 actor_id uuid references auth.users(id),
 action text not null,
 entity_type text not null,
 entity_id uuid,
 old_value jsonb,
 new_value jsonb,
 at timestamptz not null default now()
);

-- Default-deny RLS. Policies should be implemented using hardened SECURITY DEFINER
-- functions with fixed search_path, tests, and no user-editable privilege escalation.
alter table public.administrations enable row level security;
alter table public.user_profiles enable row level security;
alter table public.school_years enable row level security;
alter table public.programs enable row level security;
alter table public.program_year_versions enable row level security;
alter table public.indicators enable row level security;
alter table public.weekly_submissions enable row level security;
alter table public.submission_revisions enable row level security;
alter table public.report_facts enable row level security;
alter table public.target_versions enable row level security;
alter table public.audit_log enable row level security;
-- No open client policies intentionally: deny access until role-scope design implemented and verified.
