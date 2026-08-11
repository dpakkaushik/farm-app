-- Live patch: total_cost is a GENERATED column (qty × price) on
-- inventory_purchases and inventory_issues, so the opening-stock inserts in
-- go_live_convert must not name it. The first live run failed on exactly this
-- (and rolled back whole, as designed).
--
-- The canonical, corrected function body lives in 0030_go_live_conversion.sql —
-- this file exists only so the applied-migrations list and the repo agree. A
-- fresh database that runs the corrected 0030 needs nothing from this file.

select 1;
