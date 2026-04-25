-- Replace time-based cooldown with a crossing-based flag.
-- alert_active = true  → price is below threshold and alert already fired; wait for recovery.
-- alert_active = false → price is above threshold (or never triggered); ready to fire.
alter table watchlist
  add column if not exists alert_active boolean not null default false;

alter table watchlist
  drop column if exists alert_cooldown_until;
