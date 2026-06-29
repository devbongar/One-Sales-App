-- Backfill: fix rounding drift in breakdown columns (principal, vat, other_charges, hic)
-- on receivables_database so that column sums match the contract values from reservations.
--
-- Root cause: breakdown() used Math.round() per line which caused cumulative drift.
-- Fix: adjust the last non-RF, non-Retention active line per reservation to absorb the delta.
--
-- Run the SELECT block first to preview, then run the UPDATE block.

-- ── Preview ────────────────────────────────────────────────────────────────────
SELECT
  lb.reservation_id,
  lb.id                                          AS last_line_id,
  lb.type_of_payment,
  rt.target_principal - ls.sum_principal         AS principal_adj,
  rt.target_vat       - ls.sum_vat               AS vat_adj,
  rt.target_oc        - ls.sum_oc                AS oc_adj,
  CASE WHEN rt.target_hic > 0
    THEN rt.target_hic - ls.sum_hic ELSE 0 END   AS hic_adj
FROM (
  -- Last active breakdown line per reservation (highest due_date, then id as tiebreaker)
  SELECT DISTINCT ON (reservation_id)
    id, reservation_id, type_of_payment, principal, vat, other_charges, hic
  FROM receivables_database
  WHERE payment_status <> 'Superseded'
    AND type_of_payment NOT IN ('Reservation Fee', 'Retention Fee')
  ORDER BY reservation_id, due_date DESC, id DESC
) lb
JOIN (
  SELECT
    reservation_id,
    COALESCE(net_list_price, 0)  AS target_principal,
    COALESCE(vat, 0)             AS target_vat,
    COALESCE(other_charges, 0)   AS target_oc,
    COALESCE(hic_discount, 0)    AS target_hic
  FROM reservations
) rt ON rt.reservation_id = lb.reservation_id
JOIN (
  SELECT
    reservation_id,
    SUM(COALESCE(principal, 0))     AS sum_principal,
    SUM(COALESCE(vat, 0))           AS sum_vat,
    SUM(COALESCE(other_charges, 0)) AS sum_oc,
    SUM(COALESCE(hic, 0))           AS sum_hic
  FROM receivables_database
  WHERE payment_status <> 'Superseded'
  GROUP BY reservation_id
) ls ON ls.reservation_id = lb.reservation_id
WHERE
  ABS(rt.target_principal - ls.sum_principal) > 0
  OR ABS(rt.target_vat    - ls.sum_vat)       > 0
  OR ABS(rt.target_oc     - ls.sum_oc)        > 0
  OR (rt.target_hic > 0 AND ABS(rt.target_hic - ls.sum_hic) > 0)
ORDER BY lb.reservation_id;

-- ── Update ─────────────────────────────────────────────────────────────────────
UPDATE receivables_database rd
SET
  principal     = lb.principal     + (rt.target_principal - ls.sum_principal),
  vat           = lb.vat           + (rt.target_vat       - ls.sum_vat),
  other_charges = lb.other_charges + (rt.target_oc        - ls.sum_oc),
  hic           = CASE
    WHEN rt.target_hic > 0
      THEN COALESCE(lb.hic, 0) + (rt.target_hic - ls.sum_hic)
    ELSE lb.hic
  END
FROM (
  SELECT DISTINCT ON (reservation_id)
    id, reservation_id, type_of_payment, principal, vat, other_charges, hic
  FROM receivables_database
  WHERE payment_status <> 'Superseded'
    AND type_of_payment NOT IN ('Reservation Fee', 'Retention Fee')
  ORDER BY reservation_id, due_date DESC, id DESC
) lb
JOIN (
  SELECT
    reservation_id,
    COALESCE(net_list_price, 0)  AS target_principal,
    COALESCE(vat, 0)             AS target_vat,
    COALESCE(other_charges, 0)   AS target_oc,
    COALESCE(hic_discount, 0)    AS target_hic
  FROM reservations
) rt ON rt.reservation_id = lb.reservation_id
JOIN (
  SELECT
    reservation_id,
    SUM(COALESCE(principal, 0))     AS sum_principal,
    SUM(COALESCE(vat, 0))           AS sum_vat,
    SUM(COALESCE(other_charges, 0)) AS sum_oc,
    SUM(COALESCE(hic, 0))           AS sum_hic
  FROM receivables_database
  WHERE payment_status <> 'Superseded'
  GROUP BY reservation_id
) ls ON ls.reservation_id = lb.reservation_id
WHERE rd.id = lb.id
  AND (
    ABS(rt.target_principal - ls.sum_principal) > 0
    OR ABS(rt.target_vat    - ls.sum_vat)       > 0
    OR ABS(rt.target_oc     - ls.sum_oc)        > 0
    OR (rt.target_hic > 0 AND ABS(rt.target_hic - ls.sum_hic) > 0)
  );
