-- Corporate insider open-market transaction signals derived from SEC Form 4 filings.
-- buy_count / sell_count are open-market purchases / sales by officers & directors
-- over the trailing 90 days. Option exercises and RSU releases are excluded.
create table insider_signals (
  symbol     text primary key,
  buy_count  int  not null default 0,
  sell_count int  not null default 0,
  net_shares bigint not null default 0,
  signal     text,    -- 'buying' | 'selling' | 'neutral'
  updated_at timestamp with time zone not null default now()
);

create index idx_insider_signals_signal on insider_signals (signal);
