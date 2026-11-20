-- Nool: quantities are garments; stock is remaining on-hand kg; money is paise.
create schema if not exists private;
revoke all on schema private from public;

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null,
  resource_version integer not null default 1 check (resource_version > 0),
  reference_date date, is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.memberships (
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('merchandiser','production_lead')),
  display_name text not null, primary key (organization_id,user_id)
);
create index memberships_user_idx on public.memberships(user_id,organization_id);
create table public.buyers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  name text not null, contact_name text not null, unique(organization_id,id)
);
create table public.fabrics (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  code text not null, name text not null, composition text not null, gsm integer not null check(gsm>0), color text not null,
  stock_kg numeric(14,3) not null check(stock_kg>=0), cost_per_kg_paise integer check(cost_per_kg_paise>=0),
  version integer not null default 1, unique(organization_id,id), unique(organization_id,code)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  buyer_id uuid not null, reference text not null, style text not null, garment_type text not null, color text not null,
  quantity integer not null check(quantity>0), completed_quantity integer not null default 0 check(completed_quantity>=0 and completed_quantity<=quantity),
  fabric_id uuid not null, consumption_kg numeric(12,6) not null check(consumption_kg>0),
  wastage_bps integer not null default 500 check(wastage_bps between 0 and 10000),
  finishing_days integer not null check(finishing_days between 0 and 30), transit_days integer check(transit_days between 0 and 365),
  committed_ship_date date not null, shipment_plan jsonb not null default '[]',
  status text not null default 'in_production' check(status in ('confirmed','in_production','ready','shipped')),
  version integer not null default 1 check(version>0), unit_cost_paise integer check(unit_cost_paise>=0),
  unique(organization_id,id), unique(organization_id,reference),
  foreign key(organization_id,buyer_id) references public.buyers(organization_id,id),
  foreign key(organization_id,fabric_id) references public.fabrics(organization_id,id)
);
create index orders_buyer_idx on public.orders(organization_id,buyer_id);
create index orders_fabric_idx on public.orders(organization_id,fabric_id);
create index orders_filter_idx on public.orders(organization_id,status,committed_ship_date);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), order_id uuid not null,
  size text not null, quantity integer not null check(quantity>=0), completed_quantity integer not null default 0 check(completed_quantity>=0 and completed_quantity<=quantity),
  foreign key(organization_id,order_id) references public.orders(organization_id,id), unique(order_id,size)
);
create index order_items_org_order_idx on public.order_items(organization_id,order_id);
create table public.material_reservations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), order_id uuid not null, fabric_id uuid not null,
  reserved_kg numeric(14,3) not null check(reserved_kg>=0), consumed_kg numeric(14,3) not null default 0 check(consumed_kg>=0),
  foreign key(organization_id,order_id) references public.orders(organization_id,id),
  foreign key(organization_id,fabric_id) references public.fabrics(organization_id,id), unique(order_id,fabric_id)
);
create index reservations_fabric_idx on public.material_reservations(organization_id,fabric_id);
create index reservations_order_idx on public.material_reservations(organization_id,order_id);
create table public.production_lines (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  name text not null, compatible_types text[] not null, unique(organization_id,id)
);
create table public.capacity_slots (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), line_id uuid not null,
  work_date date not null, capacity integer not null check(capacity>=0),
  overtime_capacity integer not null default 0 check(overtime_capacity>=0), overtime_cost_paise integer check(overtime_cost_paise>=0),
  version integer not null default 1,
  foreign key(organization_id,line_id) references public.production_lines(organization_id,id),
  unique(organization_id,id), unique(line_id,work_date)
);
create index capacity_slots_org_line_idx on public.capacity_slots(organization_id,line_id,work_date);
create table public.production_allocations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), order_id uuid not null, slot_id uuid not null,
  quantity integer not null check(quantity>=0), completed_quantity integer not null default 0 check(completed_quantity>=0 and completed_quantity<=quantity),
  overtime_quantity integer not null default 0 check(overtime_quantity>=0 and overtime_quantity<=quantity),
  foreign key(organization_id,order_id) references public.orders(organization_id,id),
  foreign key(organization_id,slot_id) references public.capacity_slots(organization_id,id), unique(order_id,slot_id)
);
create index allocations_slot_idx on public.production_allocations(organization_id,slot_id);
create index allocations_order_idx on public.production_allocations(organization_id,order_id);
create table public.change_proposals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), order_id uuid not null,
  created_by uuid not null references auth.users(id), sequence integer not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','stale')),
  order_version integer not null, resource_version integer not null, requested_ship_date date not null,
  target_quantity integer not null check(target_quantity>0), plan jsonb not null, evaluation jsonb not null,
  idempotency_key uuid not null, rejection_reason text, buyer_message text, reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(), reviewed_at timestamptz,
  foreign key(organization_id,order_id) references public.orders(organization_id,id),
  unique(organization_id,id), unique(organization_id,idempotency_key), unique(order_id,sequence)
);
create index proposals_queue_idx on public.change_proposals(organization_id,status,created_at desc);
create index proposals_order_idx on public.change_proposals(organization_id,order_id);
create index proposals_creator_idx on public.change_proposals(created_by);
create index proposals_reviewer_idx on public.change_proposals(reviewed_by);
create table public.production_tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), order_id uuid not null, proposal_id uuid not null, slot_id uuid not null,
  title text not null, quantity integer not null check(quantity>0), due_date date not null,
  status text not null default 'todo' check(status in ('todo','in_progress','done')),
  foreign key(organization_id,order_id) references public.orders(organization_id,id),
  foreign key(organization_id,proposal_id) references public.change_proposals(organization_id,id),
  foreign key(organization_id,slot_id) references public.capacity_slots(organization_id,id), unique(proposal_id,slot_id)
);
create index tasks_queue_idx on public.production_tasks(organization_id,status,due_date);
create index tasks_order_idx on public.production_tasks(organization_id,order_id);
create index tasks_proposal_idx on public.production_tasks(organization_id,proposal_id);
create index tasks_slot_idx on public.production_tasks(organization_id,slot_id);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), order_id uuid,
  actor_id uuid not null references auth.users(id), event_type text not null, details jsonb not null default '{}', created_at timestamptz not null default now(),
  foreign key(organization_id,order_id) references public.orders(organization_id,id)
);
create index audit_history_idx on public.audit_events(organization_id,order_id,created_at desc);
create index audit_actor_idx on public.audit_events(actor_id);
create table public.voice_sessions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id), order_id uuid not null,
  channel text not null unique, agent_id text, status text not null check(status in ('starting','active','stopping','ended','failed')),
  token_hash text not null, expires_at timestamptz not null, created_at timestamptz not null default now(),
  foreign key(organization_id,order_id) references public.orders(organization_id,id)
);
create unique index voice_one_active_idx on public.voice_sessions(user_id) where status in ('starting','active','stopping');
create index voice_org_idx on public.voice_sessions(organization_id,order_id);

create function private.is_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships where organization_id=p_org and user_id=(select auth.uid()));
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
alter table public.organizations enable row level security;
create policy org_read on public.organizations for select to authenticated using(private.is_member(id));
do $$ declare t text; begin
  foreach t in array array['memberships','buyers','orders','order_items','fabrics','material_reservations','production_lines','capacity_slots','production_allocations','change_proposals','production_tasks','audit_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy member_read on public.%I for select to authenticated using(private.is_member(organization_id))',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
  end loop;
end $$;
grant select on public.organizations to authenticated;
revoke insert,update,delete on public.organizations from anon,authenticated;
alter table public.voice_sessions enable row level security;
-- Session credentials are never selected by the browser. Server-only lifecycle operations.
revoke all on public.voice_sessions from anon,authenticated;
grant all on all tables in schema public to service_role;

create function private.authorize(p_org uuid, p_lead boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.memberships where organization_id=p_org and user_id=auth.uid() and (not p_lead or role='production_lead')) then
    raise exception 'You do not have permission for this organization or action.' using errcode='42501';
  end if;
end $$;
revoke all on all functions in schema private from public;
grant execute on function private.is_member(uuid) to authenticated;
