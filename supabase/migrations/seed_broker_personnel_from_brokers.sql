-- Migration: seed broker_personnel from existing Brokers table
-- Run AFTER create_broker_personnel_table.sql
--
-- Pass 1: BNOs first (BNAs will reference them by name)
-- Pass 2: BNAs, referencing their BNO
-- Pass 3: assign personnel_id (BKP-XXXXXX) from the auto-increment id

insert into public.broker_personnel (
  full_name, position_code, position_rank, personnel_status,
  sales_director, sales_director_id,
  sales_division_head, sales_division_head_id,
  sales_head, sales_head_id
)
select distinct on ("Broker Network Officer")
  "Broker Network Officer"      as full_name,
  'Broker Network Officer'      as position_code,
  'BNO'                         as position_rank,
  'Active'                      as personnel_status,
  "Sales Director"              as sales_director,
  "Sales Director ID"           as sales_director_id,
  "Sales Director Head"         as sales_division_head,
  "Sales Director Head ID"      as sales_division_head_id,
  "Sales Head"                  as sales_head,
  "Sales Head ID"               as sales_head_id
from public."Brokers"
where "Broker Network Officer" is not null
order by "Broker Network Officer", "Sales Director";

insert into public.broker_personnel (
  full_name, position_code, position_rank, personnel_status,
  bno_name,
  sales_director, sales_director_id,
  sales_division_head, sales_division_head_id,
  sales_head, sales_head_id
)
select distinct on ("Broker Network Associate")
  "Broker Network Associate"    as full_name,
  'Broker Network Associate'    as position_code,
  'BNA'                         as position_rank,
  'Active'                      as personnel_status,
  "Broker Network Officer"      as bno_name,
  "Sales Director"              as sales_director,
  "Sales Director ID"           as sales_director_id,
  "Sales Director Head"         as sales_division_head,
  "Sales Director Head ID"      as sales_division_head_id,
  "Sales Head"                  as sales_head,
  "Sales Head ID"               as sales_head_id
from public."Brokers"
where "Broker Network Associate" is not null
order by "Broker Network Associate", "Broker Network Officer";

update public.broker_personnel
set personnel_id = 'BKP-' || lpad(id::text, 6, '0')
where personnel_id is null;
