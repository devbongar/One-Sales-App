-- Fix: use update_inventory_status() RPC instead of direct table update.
-- "Inventory" raw table has capitalized column names ("Status", "Inventory Code").
-- Calling the existing RPC avoids the column-name mismatch entirely.

create or replace function public.cancel_expired_reservations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deadline timestamptz := now() - interval '24 hours';
  r record;
begin
  -- AMD-rejected expirations
  for r in
    select reservation_id, inventory_code
    from reservations
    where booking_review_status = 'amd-rejected'
      and status in ('Reserved', 'Pending Proof')
      and amd_rejected_at < deadline
  loop
    update reservations
    set
      status              = 'Cancelled',
      cancelled_at        = now(),
      cancelled_by        = 'system',
      cancellation_reason = 'amd-rejected-expired'
    where reservation_id = r.reservation_id
      and status in ('Reserved', 'Pending Proof');

    if not found then continue; end if;

    if r.inventory_code is not null then
      perform public.update_inventory_status(r.inventory_code, 'Available');
    end if;

    update receivables_database
    set payment_status = 'Cancelled'
    where reservation_id = r.reservation_id
      and payment_status = 'Unpaid';

    update commission_schedule
    set status = 'Cancelled'
    where reservation_id = r.reservation_id
      and status = 'Pending';
  end loop;

  -- RF-rejected expirations (only when RF was never verified)
  for r in
    select reservation_id, inventory_code
    from reservations
    where finance_status = 'rf-rejected'
      and status in ('Reserved', 'Pending Proof')
      and finance_verified_at is null
      and rf_rejected_at < deadline
  loop
    update reservations
    set
      status              = 'Cancelled',
      cancelled_at        = now(),
      cancelled_by        = 'system',
      cancellation_reason = 'rf-rejected-expired'
    where reservation_id = r.reservation_id
      and status in ('Reserved', 'Pending Proof');

    if not found then continue; end if;

    if r.inventory_code is not null then
      perform public.update_inventory_status(r.inventory_code, 'Available');
    end if;

    update receivables_database
    set payment_status = 'Cancelled'
    where reservation_id = r.reservation_id
      and payment_status = 'Unpaid';

    update commission_schedule
    set status = 'Cancelled'
    where reservation_id = r.reservation_id
      and status = 'Pending';
  end loop;
end;
$$;

grant execute on function public.cancel_expired_reservations() to authenticated;
