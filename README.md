# Pulse — Financial News Feed

A financial news aggregator. Each story groups coverage of the same market event across outlets (Reuters, FT, Bloomberg, WSJ) and labels every outlet's angle bullish, bearish, or neutral, so the disagreement is visible at a glance.

Next.js App Router + Supabase (`@supabase/ssr`), deployed on Vercel.

## Pages

| Route             | Description                                                                            |
| ----------------- | -------------------------------------------------------------------------------------- |
| `/`               | Main feed, sector filter tabs (`?sector=`), sidebar with watchlist, movers and snapshot |
| `/stock/[ticker]` | Price header for the symbol plus all coverage filed on it                               |
| `/watchlist`      | Stories limited to the signed-in user's saved tickers (auth required)                   |
| `/login`          | Email + password sign in / sign up                                                      |

## Behaviors

- **Ticker bar** — SPX, NDX, DJI, VIX, BTC, XAU, DXY, read live from `tickers`.
- **Search (⌘K)** — live suggestions from `tickers` via `/api/search`; index and macro symbols are excluded so results are companies only.
- **Sector filters** — set the `?sector=` URL param, so the server component refetches and filters by joining `tickers` on symbol.
- **Top Movers** — `tickers` ranked by absolute `change_pct`, top 5.
- **Market Snapshot** — includes 10Y, EURUSD and WTI alongside the indices.
- **Story card** — 3px left border colored by sentiment; the source panel expands inline, and clicking the card body navigates to the ticker page.
- `sentiment_label` ("Bullish" / "Bearish" / "Neutral") is derived in `lib/types.ts` and never stored.

## Setup

1. Copy the env template and fill in your Supabase project values:

   ```bash
   cp .env.example .env.local
   ```

   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` come from Project Settings → API.

2. Apply the schema and seed data:

   ```bash
   psql "$POSTGRES_URL" -f supabase/migrations/001_init.sql
   psql "$POSTGRES_URL" -f supabase/seed.sql
   ```

   Both files are idempotent on the ticker table; re-running the seed will insert duplicate stories, so run it once per database.

3. Install and run:

   ```bash
   pnpm install
   pnpm dev
   ```

## Auth notes

Email + password via Supabase Auth. Email confirmation is on by default, so a new account must confirm before watchlist writes succeed — RLS policies key off `auth.uid()`, and there is no session until the address is confirmed.

Create test users through the app's own sign-up form rather than inserting into `auth.users` directly, and use a real mailbox: example/test domains are rejected outright, and the built-in mailer only delivers to addresses inside your Supabase organization.

## Data model

```
tickers       (symbol, name, exchange, price, change_pct, direction, sector, updated_at)
stories       (id, ticker → tickers.symbol, is_macro, sentiment, title, summary, published_at)
story_sources (id, story_id → stories.id, outlet, headline, excerpt, angle, url, display_order)
watchlist     (id, user_id → auth.users.id, ticker → tickers.symbol, added_at)
```

RLS: market content (`tickers`, `stories`, `story_sources`) is public read. `watchlist` rows are readable, insertable, and deletable only by their owner, and inserts additionally verify the referenced ticker exists.

## Security headers

`next.config.mjs` sets `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, and `Permissions-Policy`. CSP ships as **report-only** so a tight rule can't break the live site — validate it against the browser console, then rename the header key to `Content-Security-Policy` to enforce.
