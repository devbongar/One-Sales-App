-- Patch existing broker reservations with correct hierarchy IDs.
--
-- Old wrong mapping (before fix):
--   sales_manager_id    = BNA ID  (should be BNO)
--   sales_director_id   = BNO ID  (should be SD)
--   (SDH/SH similarly shifted)
--   broker_network_associate / broker_network_associate_id  = NULL (columns did not exist yet)
--
-- Correct mapping (matches new reservation creation):
--   broker_network_associate     = BNA name
--   broker_network_associate_id  = BNA personnel_id (BKP-XXXXXX)
--   sales_manager_id             = BNO personnel_id (BKP-XXXXXX)
--   sales_director_id            = SD Seller Id (SLS-XXXXXX)
--   sales_division_head_id       = SDH Seller Id (SLS-XXXXXX)
--   sales_head_id                = SH Seller Id (SLS-XXXXXX)
--
-- Run AFTER add_broker_network_associate_to_reservations.sql

update public.reservations r
set
  broker_network_associate     = b."Broker Network Associate",
  broker_network_associate_id  = b."Broker Network Associate ID",
  sales_manager_id             = b."Broker Network Officer ID",
  sales_director_id            = b."Sales Director ID",
  sales_division_head_id       = b."Sales Director Head ID",
  sales_head_id                = b."Sales Head ID"
from public."Brokers" b
where b."Broker ID" = r.seller_id;

notify pgrst, 'reload schema';
