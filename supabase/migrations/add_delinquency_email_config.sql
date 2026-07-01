-- Add run_hour and notice_email_config to penalty_policy.
-- run_hour: UTC hour (0-23) the automation fires on configured run days.
-- notice_email_config: per-notice-type email settings (recipients, subject, body).

alter table public.penalty_policy
  add column if not exists run_hour            int  not null default 2,
  add column if not exists notice_email_config jsonb not null default '{}'::jsonb;

-- Seed default email config on the existing row
update public.penalty_policy
set notice_email_config = '{
  "1st_notice": {
    "to": ["client"],
    "cc": [],
    "subject": "1st Delinquency Notice — {project} Unit {unit}",
    "body": "Dear {client_name},\n\nThis is your 1st Delinquency Notice for {project} Unit {unit} ({reservation_id}).\n\nYour account is currently {months_behind} month(s) past due.\n\nOutstanding Balance: {outstanding_balance}\nAccrued Penalties: {penalty_balance}\n\nPlease settle your outstanding balance immediately to avoid further penalties.\n\nIf you believe this notice was sent in error or have already settled, please contact your property specialist.\n\nThank you."
  },
  "2nd_notice": {
    "to": ["client"],
    "cc": [],
    "subject": "2nd Delinquency Notice — {project} Unit {unit}",
    "body": "Dear {client_name},\n\nThis is your 2nd Delinquency Notice for {project} Unit {unit} ({reservation_id}).\n\nYour account is currently {months_behind} month(s) past due.\n\nOutstanding Balance: {outstanding_balance}\nAccrued Penalties: {penalty_balance}\n\nImmediate settlement is required. Further non-payment may result in escalation.\n\nPlease contact your property specialist immediately.\n\nThank you."
  },
  "final_notice": {
    "to": ["client"],
    "cc": [],
    "subject": "Final Delinquency Notice — {project} Unit {unit}",
    "body": "Dear {client_name},\n\nThis is your Final Delinquency Notice for {project} Unit {unit} ({reservation_id}).\n\nYour account is currently {months_behind} month(s) past due.\n\nOutstanding Balance: {outstanding_balance}\nAccrued Penalties: {penalty_balance}\n\nFailure to settle your outstanding balance may result in cancellation of your unit reservation. Please act immediately.\n\nContact your property specialist as soon as possible.\n\nThank you."
  }
}'::jsonb
where id = 1;

notify pgrst, 'reload schema';
