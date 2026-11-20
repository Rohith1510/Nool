-- A single organization row is the lock root. ALL resource mutations lock it first.
-- This conservative serialization prevents write skew across stock and capacity.
create function public.workspace_snapshot(p_org uuid, p_actor uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := coalesce(p_actor,auth.uid()); result jsonb;
begin
  if actor is null or (actor is distinct from auth.uid() and coalesce(auth.role(),'')<>'service_role') or not exists(select 1 from public.memberships where organization_id=p_org and user_id=actor) then raise exception 'Unauthorized workspace' using errcode='42501'; end if;
  select jsonb_build_object(
    'organization',(select to_jsonb(o) from public.organizations o where id=p_org),
    'membership',(select to_jsonb(m) from public.memberships m where organization_id=p_org and user_id=actor),
    'buyers',coalesce((select jsonb_agg(b) from public.buyers b where organization_id=p_org),'[]'),
    'orders',coalesce((select jsonb_agg(o order by reference) from public.orders o where organization_id=p_org),'[]'),
    'order_items',coalesce((select jsonb_agg(i) from public.order_items i where organization_id=p_org),'[]'),
    'fabrics',coalesce((select jsonb_agg(f order by code) from public.fabrics f where organization_id=p_org),'[]'),
    'material_reservations',coalesce((select jsonb_agg(r) from public.material_reservations r where organization_id=p_org),'[]'),
    'production_lines',coalesce((select jsonb_agg(l order by name) from public.production_lines l where organization_id=p_org),'[]'),
    'capacity_slots',coalesce((select jsonb_agg(s order by work_date) from public.capacity_slots s where organization_id=p_org),'[]'),
    'production_allocations',coalesce((select jsonb_agg(a) from public.production_allocations a where organization_id=p_org),'[]'),
    'change_proposals',coalesce((select jsonb_agg(p order by created_at desc) from public.change_proposals p where organization_id=p_org),'[]'),
    'production_tasks',coalesce((select jsonb_agg(t order by due_date) from public.production_tasks t where organization_id=p_org),'[]'),
    'audit_events',coalesce((select jsonb_agg(e order by created_at desc) from (select * from public.audit_events where organization_id=p_org order by created_at desc limit 150) e),'[]')
  ) into result;
  return result;
end $$;

-- Only the authenticated application server can seal deterministic evaluations.
-- A browser/LLM cannot post arbitrary allocations directly into a trusted proposal.
create function public.seal_proposal(p_org uuid,p_actor uuid,p_order uuid,p_evaluation jsonb,p_plan jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org public.organizations; ord public.orders; proposal public.change_proposals; seq integer;
begin
  if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor) then raise exception 'Unauthorized'; end if;
  select * into org from public.organizations where id=p_org for update;
  select * into proposal from public.change_proposals where organization_id=p_org and idempotency_key=p_key;
  if found then
    if proposal.order_id<>p_order or proposal.created_by<>p_actor then raise exception 'Idempotency key belongs to another request'; end if;
    return to_jsonb(proposal);
  end if;
  select * into ord from public.orders where id=p_order and organization_id=p_org for update;
  if ord.id is null then raise exception 'Order not found'; end if;
  if ord.version<>(p_evaluation->>'order_version')::integer or org.resource_version<>(p_evaluation->>'resource_version')::integer then raise exception 'Resources changed. Recalculate before submitting.'; end if;
  if not (p_evaluation->'plans' @> jsonb_build_array(p_plan)) then raise exception 'Plan does not belong to evaluation'; end if;
  select coalesce(max(sequence),0)+1 into seq from public.change_proposals where order_id=p_order;
  insert into public.change_proposals(organization_id,order_id,created_by,sequence,order_version,resource_version,requested_ship_date,target_quantity,plan,evaluation,idempotency_key)
  values(p_org,p_order,p_actor,seq,ord.version,org.resource_version,(p_evaluation->>'requested_ship_date')::date,(p_evaluation->>'target_quantity')::integer,p_plan,p_evaluation,p_key) returning * into proposal;
  insert into public.audit_events(organization_id,order_id,actor_id,event_type,details) values(p_org,p_order,p_actor,'proposal_submitted',jsonb_build_object('proposal_id',proposal.id,'sequence',seq,'quantity',proposal.target_quantity));
  return to_jsonb(proposal);
end $$;

create function public.review_proposal(p_id uuid,p_decision text,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.change_proposals; org public.organizations; ord public.orders; slot public.capacity_slots;
  entry jsonb; needed numeric(14,3); other_reserved numeric; standard_used integer; overtime_used integer;
  assigned integer:=0; q integer; ot integer; final_ship date; message text; buyer_name text; org_id uuid;
begin
  select organization_id into org_id from public.change_proposals where id=p_id;
  if org_id is null then raise exception 'Proposal not found'; end if;
  perform private.authorize(org_id,true);
  select * into org from public.organizations where id=org_id for update;
  select * into p from public.change_proposals where id=p_id for update;
  -- Repeated approvals return the same persisted result, without duplicating tasks or events.
  if p.status='approved' and p_decision='approve' then return to_jsonb(p); end if;
  if p.status='rejected' and p_decision='reject' then return to_jsonb(p); end if;
  if p.status<>'pending' then raise exception 'This proposal is %. Recalculate or open its recorded decision.',p.status; end if;
  if p_decision='reject' then
    if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a rejection reason (at least 3 characters).'; end if;
    update public.change_proposals set status='rejected',rejection_reason=trim(p_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=p.id returning * into p;
    insert into public.audit_events(organization_id,order_id,actor_id,event_type,details) values(org_id,p.order_id,auth.uid(),'proposal_rejected',jsonb_build_object('proposal_id',p.id,'reason',p_reason));
    return to_jsonb(p);
  elsif p_decision<>'approve' then raise exception 'Unknown review decision'; end if;
  select * into ord from public.orders where id=p.order_id and organization_id=org_id for update;
  if ord.version<>p.order_version or org.resource_version<>p.resource_version or (p.evaluation->>'as_of')::date<>coalesce(org.reference_date,(now() at time zone 'Asia/Kolkata')::date) then
    update public.change_proposals set status='stale',rejection_reason=format('Order version %s to %s; resource version %s to %s. Planning date may also have advanced. Recalculate against current records.',p.order_version,ord.version,p.resource_version,org.resource_version) where id=p.id returning * into p;
    insert into public.audit_events(organization_id,order_id,actor_id,event_type,details) values(org_id,p.order_id,auth.uid(),'proposal_stale',jsonb_build_object('proposal_id',p.id,'reason',p.rejection_reason));
    return to_jsonb(p);
  end if;
  if p.target_quantity<ord.completed_quantity or (p.plan->>'completed_quantity')::integer<>ord.completed_quantity then raise exception 'Completed quantities changed'; end if;
  needed:=ceil((p.target_quantity-ord.completed_quantity)*ord.consumption_kg*(10000+ord.wastage_bps)/10000*1000)/1000;
  if needed<>(p.plan->>'material_required_kg')::numeric then raise exception 'Material requirement does not match calculation'; end if;
  perform 1 from public.fabrics where id=ord.fabric_id and organization_id=org_id for update;
  select coalesce(sum(reserved_kg),0) into other_reserved from public.material_reservations where organization_id=org_id and fabric_id=ord.fabric_id and order_id<>ord.id;
  if needed+other_reserved>(select stock_kg from public.fabrics where id=ord.fabric_id) then raise exception 'Fabric availability changed. Recalculate.'; end if;
  for entry in select value from jsonb_array_elements(p.plan->'allocations') loop
    select * into slot from public.capacity_slots where id=(entry->>'slot_id')::uuid and organization_id=org_id for update;
    if slot.id is null or slot.work_date<(p.evaluation->>'as_of')::date then raise exception 'Invalid production slot'; end if;
    if not exists(select 1 from public.production_lines where id=slot.line_id and organization_id=org_id and ord.garment_type=any(compatible_types)) then raise exception 'Incompatible production line'; end if;
    q:=(entry->>'quantity')::integer; ot:=(entry->>'overtime_quantity')::integer;
    if q<=0 or ot<0 or ot>q then raise exception 'Invalid allocation quantity'; end if;
    select coalesce(sum(case when order_id=ord.id then least(completed_quantity,quantity-overtime_quantity) else quantity-overtime_quantity end),0),coalesce(sum(case when order_id=ord.id then greatest(0,completed_quantity-(quantity-overtime_quantity)) else overtime_quantity end),0) into standard_used,overtime_used from public.production_allocations where slot_id=slot.id;
    if standard_used+q-ot>slot.capacity or overtime_used+ot>slot.overtime_capacity then raise exception 'Production capacity changed. Recalculate.'; end if;
    assigned:=assigned+q;
  end loop;
  if assigned<>p.target_quantity-ord.completed_quantity then raise exception 'Plan does not cover remaining production'; end if;
  if (select coalesce(sum((value->>'quantity')::integer),0) from jsonb_array_elements(p.plan->'shipments'))<>p.target_quantity then raise exception 'Shipment quantities do not match'; end if;
  for entry in select value from jsonb_array_elements(p.plan->'shipments') order by value->>'ship_date' loop
    if (entry->>'ship_date')::date<(p.evaluation->>'as_of')::date+ord.finishing_days then raise exception 'Finishing time is not available'; end if;
    if (select sum((s.value->>'quantity')::integer) from jsonb_array_elements(p.plan->'shipments') s where (s.value->>'ship_date')::date<=(entry->>'ship_date')::date)>ord.completed_quantity+(select coalesce(sum((a.value->>'quantity')::integer),0) from jsonb_array_elements(p.plan->'allocations') a join public.capacity_slots c on c.id=(a.value->>'slot_id')::uuid where c.work_date+ord.finishing_days<=(entry->>'ship_date')::date) then raise exception 'Shipment precedes production and finishing'; end if;
  end loop;
  if exists(select 1 from public.order_items i where i.order_id=ord.id and (not (p.plan->'size_split' ? i.size) or (p.plan->'size_split'->>i.size)::integer<i.completed_quantity)) or (select sum(value::integer) from jsonb_each_text(p.plan->'size_split'))<>p.target_quantity then raise exception 'Invalid size split'; end if;
  -- Preserve completed rows; replace only this order's uncompleted work.
  delete from public.production_tasks where order_id=ord.id and status<>'done';
  delete from public.production_allocations where order_id=ord.id and completed_quantity=0;
  update public.production_allocations set quantity=completed_quantity,overtime_quantity=greatest(0,completed_quantity-(quantity-overtime_quantity)) where order_id=ord.id;
  for entry in select value from jsonb_array_elements(p.plan->'allocations') loop
    insert into public.production_allocations(organization_id,order_id,slot_id,quantity,overtime_quantity) values(org_id,ord.id,(entry->>'slot_id')::uuid,(entry->>'quantity')::integer,(entry->>'overtime_quantity')::integer)
    on conflict(order_id,slot_id) do update set quantity=public.production_allocations.completed_quantity+excluded.quantity,overtime_quantity=public.production_allocations.overtime_quantity+excluded.overtime_quantity;
    insert into public.production_tasks(organization_id,order_id,proposal_id,slot_id,title,quantity,due_date) select org_id,ord.id,p.id,id,'Produce '||(entry->>'quantity')||' pieces for #'||ord.reference,(entry->>'quantity')::integer,work_date from public.capacity_slots where id=(entry->>'slot_id')::uuid;
  end loop;
  insert into public.material_reservations(organization_id,order_id,fabric_id,reserved_kg) values(org_id,ord.id,ord.fabric_id,needed) on conflict(order_id,fabric_id) do update set reserved_kg=excluded.reserved_kg;
  update public.order_items set quantity=(p.plan->'size_split'->>size)::integer where order_id=ord.id;
  select max((value->>'ship_date')::date) into final_ship from jsonb_array_elements(p.plan->'shipments');
  update public.orders set quantity=p.target_quantity,committed_ship_date=final_ship,shipment_plan=p.plan->'shipments',version=version+1 where id=ord.id;
  update public.organizations set resource_version=resource_version+1 where id=org_id;
  select name into buyer_name from public.buyers where id=ord.buyer_id;
  select 'Hello '||buyer_name||', We have approved the revised order #'||ord.reference||' for '||p.target_quantity||' pieces. Shipment plan: '||string_agg((value->>'quantity')||' pieces on '||(value->>'ship_date'),'; ' order by value->>'ship_date')||'. Please confirm acceptance of the revised shipment plan. Thank you.' into message from jsonb_array_elements(p.plan->'shipments');
  update public.change_proposals set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),buyer_message=message where id=p.id returning * into p;
  insert into public.audit_events(organization_id,order_id,actor_id,event_type,details) values(org_id,ord.id,auth.uid(),'proposal_approved',jsonb_build_object('proposal_id',p.id,'from_quantity',ord.quantity,'to_quantity',p.target_quantity,'shipments',p.plan->'shipments','reservation_kg',needed));
  return to_jsonb(p);
end $$;

create function public.adjust_resources(p_org uuid,p_kind text,p_id uuid,p_values jsonb,p_reason text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare slot public.capacity_slots; used integer; ot_used integer; stock numeric; reserved numeric; ord public.orders; task public.production_tasks; used_kg numeric; old_kg numeric; s text;
begin
  perform private.authorize(p_org,true);
  perform 1 from public.organizations where id=p_org for update;
  if exists(select 1 from public.audit_events where organization_id=p_org and details->>'request_key'=p_key::text) then return jsonb_build_object('ok',true,'repeated',true); end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'A reason is required (3–1000 characters).'; end if;
  if p_kind='capacity' then
    select * into slot from public.capacity_slots where id=p_id and organization_id=p_org for update;
    if slot.id is null then raise exception 'Capacity slot not found'; end if;
    select coalesce(sum(quantity-overtime_quantity),0),coalesce(sum(overtime_quantity),0) into used,ot_used from public.production_allocations where slot_id=p_id;
    if (p_values->>'capacity')::integer<used or (p_values->>'overtime_capacity')::integer<ot_used then raise exception 'Capacity cannot be reduced below existing allocations.'; end if;
    update public.capacity_slots set capacity=(p_values->>'capacity')::integer,overtime_capacity=(p_values->>'overtime_capacity')::integer,version=version+1 where id=p_id;
  elsif p_kind='stock' then
    select stock_kg into stock from public.fabrics where id=p_id and organization_id=p_org for update;
    if stock is null then raise exception 'Fabric not found'; end if;
    select coalesce(sum(reserved_kg),0) into reserved from public.material_reservations where fabric_id=p_id;
    if stock+(p_values->>'delta_kg')::numeric<reserved then raise exception 'Stock cannot fall below reserved material (% kg).',reserved; end if;
    update public.fabrics set stock_kg=stock_kg+(p_values->>'delta_kg')::numeric,version=version+1 where id=p_id;
  elsif p_kind='task' then
    select * into task from public.production_tasks where id=p_id and organization_id=p_org for update;
    if task.id is null then raise exception 'Task not found'; end if;
    s:=p_values->>'status';
    if s not in ('todo','in_progress','done') then raise exception 'Invalid task status'; end if;
    if task.status='done' and s<>'done' then raise exception 'Completed production cannot be undone.'; end if;
    if s='done' and task.status<>'done' then
      select * into ord from public.orders where id=task.order_id for update;
      select reserved_kg into old_kg from public.material_reservations where order_id=ord.id and fabric_id=ord.fabric_id for update;
      used_kg:=old_kg-ceil((ord.quantity-ord.completed_quantity-task.quantity)*ord.consumption_kg*(10000+ord.wastage_bps)/10000*1000)/1000;
      update public.material_reservations set reserved_kg=reserved_kg-used_kg,consumed_kg=consumed_kg+used_kg where order_id=ord.id and fabric_id=ord.fabric_id;
      update public.fabrics set stock_kg=stock_kg-used_kg,version=version+1 where id=ord.fabric_id;
      update public.production_allocations set completed_quantity=completed_quantity+task.quantity where order_id=ord.id and slot_id=task.slot_id;
      -- Sewing completion is not a finishing/shipment readiness certification.
      update public.orders set completed_quantity=completed_quantity+task.quantity,version=version+1 where id=ord.id;
      -- Attribute completed sizes deterministically, never exceeding their approved quantities.
      used:=task.quantity;
      for s in select size from public.order_items where order_id=ord.id order by size loop
        select least(used,quantity-completed_quantity) into ot_used from public.order_items where order_id=ord.id and size=s;
        update public.order_items set completed_quantity=completed_quantity+ot_used where order_id=ord.id and size=s;
        used:=used-ot_used;
      end loop;
    end if;
    update public.production_tasks set status=p_values->>'status' where id=p_id;
  else raise exception 'Unknown adjustment type'; end if;
  update public.organizations set resource_version=resource_version+1 where id=p_org;
  insert into public.audit_events(organization_id,order_id,actor_id,event_type,details) values(p_org,task.order_id,auth.uid(),p_kind||'_adjusted',jsonb_build_object('id',p_id,'values',p_values,'reason',trim(p_reason),'request_key',p_key));
  return jsonb_build_object('ok',true,'reference',p_key);
end $$;

create function public.save_buyer_message(p_id uuid,p_message text) returns void language plpgsql security definer set search_path='' as $$
declare p public.change_proposals;
begin
  select * into p from public.change_proposals where id=p_id;
  if p.id is null then raise exception 'Proposal not found'; end if;
  perform private.authorize(p.organization_id);
  if p.status<>'approved' or length(trim(p_message))<10 or length(p_message)>8000 then raise exception 'Enter a message for an approved proposal (10–8000 characters).'; end if;
  update public.change_proposals set buyer_message=p_message where id=p_id;
  insert into public.audit_events(organization_id,order_id,actor_id,event_type,details) values(p.organization_id,p.order_id,auth.uid(),'buyer_message_saved',jsonb_build_object('proposal_id',p_id));
end $$;

revoke all on function public.seal_proposal(uuid,uuid,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.seal_proposal(uuid,uuid,uuid,jsonb,jsonb,uuid) to service_role;
revoke all on function public.workspace_snapshot(uuid,uuid),public.review_proposal(uuid,text,text),public.adjust_resources(uuid,text,uuid,jsonb,text,uuid),public.save_buyer_message(uuid,text) from public,anon;
grant execute on function public.workspace_snapshot(uuid,uuid) to authenticated,service_role;
grant execute on function public.review_proposal(uuid,text,text),public.adjust_resources(uuid,text,uuid,jsonb,text,uuid),public.save_buyer_message(uuid,text) to authenticated;

-- Publish only tables protected by organization RLS. Session credentials stay private.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['organizations','orders','fabrics','capacity_slots','production_allocations','material_reservations','change_proposals','production_tasks','audit_events'] loop
   execute format('alter publication supabase_realtime add table public.%I',t);
  end loop;
 end if;
end $$;
