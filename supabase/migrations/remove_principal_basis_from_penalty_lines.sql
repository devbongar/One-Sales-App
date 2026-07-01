-- Drop principal_basis column; ensure total_amount_due exists; rewrite RPC without principal_basis.

alter table public.penalty_lines
  drop column if exists principal_basis;

alter table public.penalty_lines
  add column if not exists total_amount_due numeric(14,2);

-- Drop all overloads then recreate clean
drop function if exists public.generate_penalty_lines();
drop function if exists public.generate_penalty_lines(date);

create function public.generate_penalty_lines(
  p_as_of_date date default current_date
)
returns json
language plpgsql
security definer
as $$
declare
  v_rate    numeric(10,6);
  v_total   int := 0;
  r         record;
  v_days    int;
  v_penalty numeric(14,2);
begin
  select coalesce(nullif(trim(value), '')::numeric, 0.001)
  into   v_rate
  from   public.app_settings
  where  key = 'penalty_daily_rate';

  if v_rate is null then v_rate := 0.001; end if;

  for r in
    select
      rd.id                                           as line_id,
      rd.reservation_id,
      res.client_id,
      rd.client_name,
      rd.inventory_code,
      rd.due_date,
      rd.total_amount_due,
      coalesce(rd.principal, rd.total_amount_due, 0) as principal
    from public.receivables_database rd
    left join public.reservations res on res.reservation_id = rd.reservation_id
    where rd.due_date < p_as_of_date
      and rd.payment_status in ('Unpaid', 'Partial')
      and lower(rd.type_of_payment) not like '%penalty%'
  loop
    v_days    := (p_as_of_date - r.due_date);
    v_penalty := round(r.principal * v_days * v_rate, 2);

    insert into public.penalty_lines (
      reservation_id, client_id, receivable_line_id, client_name, inventory_code,
      original_due_date, days_overdue, daily_rate, total_amount_due,
      penalty_amount, payment_status, generated_at
    )
    values (
      r.reservation_id, r.client_id, r.line_id, r.client_name, r.inventory_code,
      r.due_date, v_days, v_rate, r.total_amount_due,
      v_penalty, 'Unpaid', now()
    )
    on conflict (receivable_line_id) do update
      set
        client_id        = excluded.client_id,
        days_overdue     = excluded.days_overdue,
        daily_rate       = excluded.daily_rate,
        total_amount_due = excluded.total_amount_due,
        penalty_amount   = excluded.penalty_amount,
        generated_at     = now()
      where penalty_lines.payment_status in ('Unpaid', 'Partial');

    v_total := v_total + 1;
  end loop;

  return json_build_object('processed', v_total, 'rate', v_rate, 'as_of', p_as_of_date);
end;
$$;

grant execute on function public.generate_penalty_lines(date) to authenticated;
grant execute on function public.generate_penalty_lines(date) to anon;

notify pgrst, 'reload schema';
