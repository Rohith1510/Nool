alter table public.voice_sessions add column tool_state jsonb not null default '{}';
alter table public.voice_sessions add column evaluation jsonb;
alter table public.voice_sessions add column proposal_id uuid;
alter table public.voice_sessions add column selected_plan_key text check(selected_plan_key in ('same_date','split','later','overtime'));
alter table public.voice_sessions add column last_error text;
alter table public.voice_sessions add foreign key(organization_id,proposal_id) references public.change_proposals(organization_id,id);
create index voice_proposal_idx on public.voice_sessions(organization_id,proposal_id);
create index voice_expiry_idx on public.voice_sessions(expires_at) where status in ('starting','active','stopping');
