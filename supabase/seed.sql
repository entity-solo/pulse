-- Pulse seed data: index/macro symbols for the ticker bar and snapshot,
-- single-name equities for search and story pages, plus 6 stories with sources.
-- Already applied to the connected Supabase project.

insert into public.tickers (symbol, name, exchange, price, change_pct, direction, sector) values
  ('SPX','S&P 500','INDEX',6412.88,0.42,'up','index'),
  ('NDX','Nasdaq 100','INDEX',23018.45,0.86,'up','index'),
  ('DJI','Dow Jones Industrial Avg','INDEX',44120.10,-0.18,'dn','index'),
  ('VIX','CBOE Volatility Index','INDEX',14.62,-3.11,'dn','index'),
  ('BTC','Bitcoin','CRYPTO',96482.00,2.14,'up','crypto'),
  ('XAU','Gold Spot','COMEX',2718.40,0.63,'up','commodity'),
  ('DXY','US Dollar Index','ICE',104.28,-0.22,'dn','macro'),
  ('US10Y','US 10-Year Treasury Yield','BOND',4.287,1.34,'up','macro'),
  ('EURUSD','Euro / US Dollar','FX',1.0842,0.19,'up','macro'),
  ('WTI','WTI Crude Oil','NYMEX',71.94,-1.87,'dn','commodity'),
  ('NVDA','NVIDIA Corp','NASDAQ',148.72,3.41,'up','tech'),
  ('AAPL','Apple Inc','NASDAQ',232.15,-0.74,'dn','tech'),
  ('MSFT','Microsoft Corp','NASDAQ',441.06,1.12,'up','tech'),
  ('TSLA','Tesla Inc','NASDAQ',352.88,-4.62,'dn','tech'),
  ('AMZN','Amazon.com Inc','NASDAQ',221.44,0.94,'up','tech'),
  ('GOOGL','Alphabet Inc','NASDAQ',191.33,1.68,'up','tech'),
  ('META','Meta Platforms Inc','NASDAQ',612.07,-1.24,'dn','tech'),
  ('JPM','JPMorgan Chase & Co','NYSE',248.91,0.58,'up','finance'),
  ('GS','Goldman Sachs Group','NYSE',589.33,1.47,'up','finance'),
  ('BAC','Bank of America Corp','NYSE',46.12,-0.86,'dn','finance'),
  ('WFC','Wells Fargo & Co','NYSE',74.28,0.31,'up','finance'),
  ('XOM','Exxon Mobil Corp','NYSE',109.66,-2.28,'dn','energy'),
  ('CVX','Chevron Corp','NYSE',158.42,-1.63,'dn','energy'),
  ('COP','ConocoPhillips','NYSE',101.77,-1.09,'dn','energy'),
  ('SLB','SLB (Schlumberger)','NYSE',41.35,-2.94,'dn','energy')
on conflict (symbol) do nothing;

-- Stories are inserted with generated ids, then sources are joined back on ticker.
with s as (
  insert into public.stories (event_key, ticker, is_macro, sentiment, title, summary, published_at) values
  ('seed-nvda-backlog', 'NVDA', false, 'bull',
   'Nvidia''s data-center backlog stretches into late 2026 as hyperscaler orders accelerate',
   'Three of the four largest cloud buyers have pulled forward Blackwell allocations, pushing Nvidia''s committed backlog beyond its own guidance window. Supply, not demand, remains the binding constraint.',
   now() - interval '42 minutes'),
  ('seed-tsla-europe-deliveries', 'TSLA', false, 'bear',
   'Tesla''s European deliveries slide for a fourth straight month as price cuts lose traction',
   'Registrations fell across Germany, France and the Nordics even after another round of discounting, raising questions about whether the demand problem is cyclical or structural.',
   now() - interval '2 hours 15 minutes'),
  ('seed-us10y-cut-odds', 'US10Y', true, 'neut',
   'Ten-year yield pushes back above 4.28% as traders trim March cut odds',
   'A firmer services print and hawkish commentary from two regional Fed presidents nudged the curve higher. Futures now imply fewer than two cuts for the year.',
   now() - interval '3 hours 50 minutes'),
  ('seed-gs-trading-quarter', 'GS', false, 'bull',
   'Goldman''s trading desk posts best quarter since 2021 on rates and credit volatility',
   'Fixed income revenue beat consensus by a wide margin, and management signalled the M&A pipeline is the fullest it has been in eight quarters.',
   now() - interval '5 hours 20 minutes'),
  ('seed-xom-crude-margin', 'XOM', false, 'bear',
   'Exxon slips as crude breaks below $72 and refining margins compress',
   'Weaker Chinese import data and rising non-OPEC supply have knocked Brent lower for a third session, squeezing the downstream spread that carried earnings last quarter.',
   now() - interval '7 hours 5 minutes'),
  ('seed-aapl-services-growth', 'AAPL', false, 'neut',
   'Apple''s services growth offsets a softer iPhone cycle, leaving the bull case intact but unproven',
   'Analysts are split: the installed-base monetisation story keeps compounding, but unit refresh rates in Greater China remain the swing factor nobody can model cleanly.',
   now() - interval '9 hours 40 minutes')
  returning id, ticker
)
insert into public.story_sources (story_id, outlet, headline, excerpt, angle, url, display_order)
select s.id, v.outlet, v.headline, v.excerpt, v.angle, v.url, v.display_order
from s
join (values
  ('NVDA','Reuters','Nvidia backlog extends past 2026 on cloud demand, sources say','Two people familiar with the allocation process said orders now exceed planned output through the fourth quarter of next year.','bull','https://www.reuters.com/technology/',1),
  ('NVDA','Financial Times','The only question left on Nvidia is how fast TSMC can move','Demand is no longer the variable. Packaging capacity at the foundry level is what sets the ceiling on revenue.','bull','https://www.ft.com/companies/technology',2),
  ('NVDA','Bloomberg','Nvidia''s customer concentration is the risk nobody prices','Four buyers account for the majority of data-center revenue. That is leverage, until it is exposure.','neut','https://www.bloomberg.com/technology',3),
  ('TSLA','Reuters','Tesla European registrations fall again in latest monthly data','Declines were steepest in Germany, where incentives for EVs lapsed at the start of the year.','bear','https://www.reuters.com/business/autos-transportation/',1),
  ('TSLA','Wall Street Journal','Discounting is no longer moving Tesla''s metal in Europe','Each successive price cut has bought less volume than the one before it, a pattern that points at saturation rather than pricing.','bear','https://www.wsj.com/business/autos',2),
  ('TSLA','Barron''s','Europe is a rounding error next to Tesla''s energy business','Bulls argue storage deployments and margin recovery matter far more to the 2026 model than one soft region.','bull','https://www.barrons.com/',3),
  ('US10Y','Bloomberg','Treasuries slip as services data undercuts the cut narrative','The move was concentrated in the belly of the curve, with five-year yields leading the selloff.','neut','https://www.bloomberg.com/markets/rates-bonds',1),
  ('US10Y','Financial Times','Bond market quietly reprices the Fed, again','Traders have spent the year oscillating between four cuts and none. This week they moved toward none.','bear','https://www.ft.com/markets',2),
  ('US10Y','Reuters','Fed officials signal patience as inflation path stays bumpy','Two presidents said in separate remarks that they see no urgency to ease at the March meeting.','neut','https://www.reuters.com/markets/',3),
  ('GS','Bloomberg','Goldman FICC revenue tops estimates as volatility returns','Rates and credit desks drove the beat, with equities roughly in line.','bull','https://www.bloomberg.com/markets',1),
  ('GS','Financial Times','Goldman''s advisory pipeline is finally refilling','Management pointed to the strongest announced-deal backlog since 2022, a leading indicator for fee revenue.','bull','https://www.ft.com/companies/financials',2),
  ('GS','Reuters','Goldman warns strong trading quarters are not a run rate','Executives cautioned that the results reflect an unusually active macro tape rather than a new baseline.','neut','https://www.reuters.com/business/finance/',3),
  ('XOM','Reuters','Oil majors retreat as Brent extends losing streak','Refining spreads narrowed sharply, removing the earnings cushion of recent quarters.','bear','https://www.reuters.com/business/energy/',1),
  ('XOM','Bloomberg','Non-OPEC supply growth is doing what OPEC cuts cannot','Output from the Americas continues to offset voluntary reductions, capping any sustained rally.','bear','https://www.bloomberg.com/energy',2),
  ('XOM','Financial Times','Exxon''s balance sheet was built for exactly this tape','Low gearing and Guyana''s cost structure mean the downcycle hurts competitors more than it hurts Exxon.','bull','https://www.ft.com/companies/energy',3),
  ('AAPL','Wall Street Journal','Apple''s services engine keeps humming as hardware plateaus','Gross margin mix continues to shift toward the higher-margin services line.','bull','https://www.wsj.com/tech',1),
  ('AAPL','Reuters','Apple faces another soft quarter in Greater China','Domestic handset makers continue to take share at the premium end of the market.','bear','https://www.reuters.com/technology/',2),
  ('AAPL','Bloomberg','On Apple, the bull and bear cases are both unfalsifiable right now','Neither side can prove its thesis until the next refresh cycle lands. Until then it is a valuation debate.','neut','https://www.bloomberg.com/technology',3)
) as v(ticker, outlet, headline, excerpt, angle, url, display_order)
  on v.ticker = s.ticker;
