-- Track which actions were taken when each alert fired.
alter table alert_log
  add column if not exists email_sent  boolean not null default true,
  add column if not exists order_placed boolean not null default false,
  add column if not exists order_id     text;
