-- Generic key/value store for app-level settings.
-- rebalance_enabled: gates the daily automated portfolio rebalance.
create table settings (
  key        text primary key,
  value      text not null,
  updated_at timestamp with time zone not null default now()
);

-- Default: auto-rebalancing is OFF until the user explicitly enables it.
insert into settings (key, value) values ('rebalance_enabled', 'false');
