# Live data source map

Which site to use for what, with URL patterns and fallbacks. Fetch with
WebFetch where a direct URL exists; use WebSearch when you need discovery
(news, concall highlights, "X company NSE symbol"). All prices/levels in INR.

Rule of thumb: screener.in is the fundamentals workhorse, Trendlyne is the
technicals workhorse, NSE/BSE are the source of truth for anything official.

## Company resolution

| Need | How |
|---|---|
| Name → NSE symbol | WebSearch `"<name>" NSE screener.in` — the screener URL slug is the symbol |
| Verify symbol | `https://www.screener.in/company/<SYMBOL>/consolidated/` loads → symbol is right |
| BSE-only small caps | WebSearch `"<name>" BSE scrip code`, then bseindia.com stock page |

## Fundamentals

| Data | Primary | Fallback |
|---|---|---|
| 10-yr P&L, BS, CF, ratios, quarterly | `screener.in/company/<SYMBOL>/consolidated/` (drop `consolidated` for standalone-only cos) | moneycontrol.com financials tab, tickertape.in |
| Shareholding pattern + trend | screener.in (bottom of page) | trendlyne.com shareholding page, BSE shareholding filing |
| Promoter pledge | trendlyne.com `/equity/<id>/<SYMBOL>/` or WebSearch `<SYMBOL> promoter pledge trendlyne` | NSE/BSE SAST disclosures |
| Concall transcripts / presentations | screener.in "Documents" section links to BSE PDFs | WebSearch `<company> concall transcript <quarter>` |
| Annual report highlights | screener.in Documents → AR PDF | company website investor page |
| Credit rating actions | WebSearch `<company> CRISIL OR ICRA OR CARE rating 2026` | rating-agency site |
| Peer comparison | screener.in peer table on company page | tickertape.in peers tab |

## Price, quote, technicals

| Data | Primary | Fallback |
|---|---|---|
| Live quote, 52w H/L, volumes | `nseindia.com/get-quotes/equity?symbol=<SYMBOL>` (needs headers; if blocked use fallback) | moneycontrol / Google Finance `NSE:<SYMBOL>` |
| Delivery % | NSE quote page → trade info | moneycontrol, trendlyne |
| DMAs (20/50/100/200), RSI, MACD | trendlyne SMA/technicals page: WebSearch `<SYMBOL> trendlyne technicals` | tickertape, investing.com technical page, topstockresearch |
| Support/resistance, pivots | investing.com `<company> technical` page | topstockresearch, munafasutra |
| Relative performance vs index | trendlyne / tickertape return comparisons | compute from 1m/3m/1y returns of stock vs index |

## Sector & macro

| Data | Primary |
|---|---|
| NIFTY sectoral index levels & returns | WebSearch `NIFTY <sector> index performance` → nseindia / moneycontrol indices |
| Sector news & policy | WebSearch `<sector> India outlook 2026`, ET/Mint/Moneycontrol/BusinessLine |
| AMFI cap classification (large/mid/small) | WebSearch `<company> AMFI market cap classification` or infer: mcap > ~₹1L cr ≈ large, ₹35k–1L cr ≈ mid (verify against current AMFI cutoffs — they move every half year) |

## Exchange filings (source of truth)

- NSE announcements: `nseindia.com/companies-listing/corporate-filings-announcements`
- BSE announcements: `bseindia.com/corporates/ann.html`
- Use these to verify anything market-moving found in news (orders, resignations, pledges, raids, defaults).

## Fetching notes

- nseindia.com blocks bare fetches sometimes; don't burn retries — go straight
  to Moneycontrol/Google Finance for quotes.
- screener.in pages are big; you need the numbers tables and the
  Documents/shareholding sections.
- Always capture the fetch timestamp — the report must state when the data
  was pulled (IST). Market hours are 09:15–15:30 IST Mon–Fri; say whether the
  quote is live or last close.
