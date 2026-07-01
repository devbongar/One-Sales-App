-- Add client_id to penalty_lines and update generate_penalty_lines RPC
-- to populate it from the reservations table.

alter table public.penalty_lines
  add column if not exists client_id text;

-- Update RPC: join reservations to pull client_id
create or replace function public.generate_penalty_lines()
returns json
language plpgsql
security definer
as $$
declare
  v_rate      numeric(10,6);
  v_today     date := current_date;
  v_total     int  := 0;
  r           record;
  v_days      int;
  v_penalty   numeric(14,2);
begin
  select coalesce(nullif(trim(value), '')::numeric, 0.001)
  into   v_rate
  from   public.app_settings
  where  key = 'penalty_daily_rate';

  if v_rate is null then v_rate := 0.001; end if;

  for r in
    select
      rd.id                                             as line_id,
      rd.reservation_id,
      res.client_id,
      rd.client_name,
      rd.inventory_code,
      rd.due_date,
      coalesce(rd.principal, rd.total_amount_due, 0)   as principal
    from public.receivables_database rd
    left join public.reservations res on res.reservation_id = rd.reservation_id
    where rd.due_date < v_today
      and rd.payment_status in ('Unpaid', 'Partial')
      and lower(rd.type_of_payment) not like '%penalty%'
  loop
    v_days    := (v_today - r.due_date);
    v_penalty := round(r.principal * v_days * v_rate, 2);

    insert into public.penalty_lines (
      reservation_id, client_id, receivable_line_id, client_name, inventory_code,
      original_due_date, days_overdue, daily_rate, principal_basis,
      penalty_amount, payment_status, generated_at
    )
    values (
      r.reservation_id, r.client_id, r.line_id, r.client_name, r.inventory_code,
      r.due_date, v_days, v_rate, r.principal,
      v_penalty, 'Unpaid', now()
    )
    on conflict (receivable_line_id) do update
      set
        client_id       = excluded.client_id,
        days_overdue    = excluded.days_overdue,
        daily_rate      = excluded.daily_rate,
        principal_basis = excluded.principal_basis,
        penalty_amount  = excluded.penalty_amount,
        generated_at    = now()
      where penalty_lines.payment_status in ('Unpaid', 'Partial');

    v_total := v_total + 1;
  end loop;

  return json_build_object('processed', v_total, 'rate', v_rate, 'as_of', v_today);
end;
$$;
