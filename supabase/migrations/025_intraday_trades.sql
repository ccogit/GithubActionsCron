-- intraday_trades: log of all intraday strategy trades (second paper account)
create table if not exists intraday_trades (
  id               bigserial primary key,
  symbol           text not null,
  strategy         text not null,          -- 'breakout', 'vwap', 'mean_reversion'
  qty              integer not null,
  entry_price      numeric(12, 4),
  exit_price       numeric(12, 4),
  stop_loss        numeric(12, 4),
  take_profit      numeric(12, 4),
  entry_time       timestamptz,
  exit_time        timestamptz,
  pnl              numeric(12, 4),         -- realized P&L in USD
  pnl_pct          numeric(8, 4),          -- P&L as percentage
  status           text not null default 'open',   -- 'open', 'closed', 'stopped', 'eod_closed'
  notes            text,
  alpaca_order_id  text,                   -- entry order ID
  exit_order_id    text,                   -- exit order ID
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists intraday_trades_symbol_status on intraday_trades (symbol, status);
create index if not exists intraday_trades_strategy_time on intraday_trades (strategy, created_at desc);
create index if not exists intraday_trades_status_entry  on intraday_trades (status, entry_time desc);
