-- Server-only sample insertion, atomic and non-destructive. Auth users are provisioned by scripts/seed.ts.
create function public.seed_sample(p_workspace jsonb,p_members jsonb) returns void language plpgsql security definer set search_path='' as $$
declare org public.organizations;
begin
  org:=jsonb_populate_record(null::public.organizations,p_workspace->'organization');
  if not org.is_sample then raise exception 'Only explicitly labelled sample data may use this function'; end if;
  insert into public.organizations(id,name,resource_version,reference_date,is_sample) values(org.id,org.name,org.resource_version,org.reference_date,true);
  insert into public.memberships select * from jsonb_populate_recordset(null::public.memberships,p_members);
  insert into public.buyers select * from jsonb_populate_recordset(null::public.buyers,p_workspace->'buyers');
  insert into public.fabrics select * from jsonb_populate_recordset(null::public.fabrics,p_workspace->'fabrics');
  insert into public.orders select * from jsonb_populate_recordset(null::public.orders,p_workspace->'orders');
  insert into public.order_items select * from jsonb_populate_recordset(null::public.order_items,p_workspace->'order_items');
  insert into public.material_reservations select * from jsonb_populate_recordset(null::public.material_reservations,p_workspace->'material_reservations');
  insert into public.production_lines select * from jsonb_populate_recordset(null::public.production_lines,p_workspace->'production_lines');
  insert into public.capacity_slots select * from jsonb_populate_recordset(null::public.capacity_slots,p_workspace->'capacity_slots');
  insert into public.production_allocations select * from jsonb_populate_recordset(null::public.production_allocations,p_workspace->'production_allocations');
end $$;
revoke all on function public.seed_sample(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.seed_sample(jsonb,jsonb) to service_role;

create function public.import_stock(p_org uuid,p_rows jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare row jsonb; fabric_id uuid; n integer:=0; rowkey uuid;
begin
  perform private.authorize(p_org,true);
  perform 1 from public.organizations where id=p_org for update;
  if jsonb_array_length(p_rows) not between 1 and 100 then raise exception 'Import 1–100 rows at a time'; end if;
  if exists(select 1 from public.audit_events where organization_id=p_org and details->>'import_key'=p_key::text) then return jsonb_build_object('ok',true,'repeated',true); end if;
  for row in select value from jsonb_array_elements(p_rows) loop
    n:=n+1;
    select id into fabric_id from public.fabrics where organization_id=p_org and code=row->>'code';
    if fabric_id is null then raise exception 'Row %: unknown fabric code',n; end if;
    if abs((row->>'delta_kg')::numeric)>1000000 or (row->>'delta_kg')::numeric<>round((row->>'delta_kg')::numeric,3) then raise exception 'Row %: invalid kg adjustment',n; end if;
    rowkey:=gen_random_uuid();
    begin
      perform public.adjust_resources(p_org,'stock',fabric_id,jsonb_build_object('delta_kg',row->'delta_kg'),row->>'reason',rowkey);
    exception when others then
      raise exception 'CSV row %: %',n+1,sqlerrm;
    end;
  end loop;
  insert into public.audit_events(organization_id,actor_id,event_type,details) values(p_org,auth.uid(),'stock_imported',jsonb_build_object('rows',n,'import_key',p_key));
  return jsonb_build_object('ok',true,'rows',n,'reference',p_key);
end $$;
revoke all on function public.import_stock(uuid,jsonb,uuid) from public,anon;
grant execute on function public.import_stock(uuid,jsonb,uuid) to authenticated;
