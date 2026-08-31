# Historical Backfill Proposal

**Status:** `VENDOR CONFIRMATION PENDING — NOT ACCEPTED`. This is research and a
recommendation, not an owner decision, vendor permission, purchase authorization,
or backfill approval. No historical provider request or database write is authorized
by this document.

On 2026-08-31 the owner explicitly authorized sending the no-secret Navasan inquiry
below through `@navasan_contact_bot`. Telegram displayed the message as an outgoing,
read message. That is evidence of transmission only; it is not a vendor answer or
permission. No API key, portfolio value, holding, or other personal financial data
was included. A written vendor response remains pending.

## Plain-Language Decision

Before the application downloads historical Iranian market prices, the project
needs written answers to three questions:

1. May it keep the provider's historical API output privately and long-term for
   internal analysis?
2. Which dates, instruments, request limits, retention period, and product uses are
   covered?
3. Which separately licensed Iranian source will verify important values before any
   real financial analysis uses them?

This matters because an API key proves technical access, not necessarily permission
to retain or reuse the returned history. It also prevents one provider or one unit
error from silently controlling every later calculation.

## Evidence Recorded on 2026-08-31

- Navasan's official documentation describes `dailyCurrency`, `ohlcSearch`, date
  parameters, usage checks, and its public free-plan allowance. The reviewed public
  pages did not provide an explicit right to retain historical output long-term or
  redistribute it. Written confirmation is therefore still required.
- TGJU exposes an official web-service inquiry/order route. Its published API
  specification says copying site content or products requires written consent.
  The project must use a contracted API or another licensed source, not scrape public
  pages or reuse a browser session.

Official references:

- Navasan API overview: <https://www.navasan.tech/api/>
- Navasan web-service guide: <https://www.navasan.tech/webserviceguide/>
- TGJU web-service inquiry: <https://www.tgju.org/form/api>
- TGJU published API specification: <https://www.tgju.org/economics/api/swaggerui/swagger.json>

## Options

| Option | Meaning | Benefit | Cost / risk |
|---|---|---|---|
| **1 — Recommended** | Obtain written Navasan permission for a defined private OHLC range and long-term internal storage; record gaps without interpolation; obtain a licensed TGJU or equivalent cross-check before analytical use. | Legally clearer, auditable, and resilient enough for later validation. | May require vendor correspondence, a paid plan, and waiting for written terms. |
| 2 — Conservative fallback | Make no historical backfill and accumulate newly observed, licensed values prospectively. | Lowest licensing and quota risk. | Real analysis and backtesting will take much longer to become possible. |
| 3 — Rejected | Assume an API key permits permanent reuse, scrape TGJU pages, or fill missing dates with invented/interpolated prices. | Appears faster. | Creates legal, provenance, and financial-model risk; the project will not implement it. |

## Recommendation

Choose option 1 only after both vendors answer in writing and the owner approves any
price. Store permitted data privately in append-only PostgreSQL for the life of the
project, unless the written contract requires a shorter period. Record missing dates
as explicit gaps; do not interpolate or silently manufacture observations. Keep all
history out of public Git, public Sites, and redistribution.

Choosing an unclear scope could force deletion and re-collection later, invalidate
backtests, expose the owner to contract risk, or make apparently precise financial
results depend on data the project was not entitled to keep.

## Navasan Message Sent on 2026-08-31

The owner authorized and sent this unchanged through Navasan's official support bot.
The API key was not included.

> سلام. برای یک پروژه شخصی و خصوصی تحلیل بازار ایران، آیا مجاز هستم خروجی OHLC
> وب‌سرویس نوسان را برای طلای ۱۸ عیار، مثقال طلا، دلار آزاد و انواع سکه، برای
> بیشترین بازه تاریخی‌ای که پلن شما اجازه می‌دهد، در PostgreSQL محلی به‌صورت
> بلندمدت نگهداری و فقط
> برای تحلیل داخلی استفاده کنم؟ هیچ بازنشر یا فروش عمومی انجام نمی‌شود. لطفاً
> محدوده زمانی مجاز، سقف و روش بازیابی، حق نگهداری، مدت نگهداری، شرایط پلن/تمدید و
> هر محدودیت قراردادی را کتبی اعلام کنید.

## Ready-to-Send TGJU Inquiry

This inquiry requests a separate licensed cross-check. It does not authorize a
purchase, account creation, token transfer, or scraping.

> سلام. برای یک پروژه شخصی و خصوصی تحلیل بازار ایران، وب‌سرویس رسمی و مستقل برای
> تطبیق قیمت طلای ۱۸ عیار، مثقال طلا، دلار آزاد و انواع سکه نیاز دارم. داده بازنشر
> عمومی نمی‌شود و فقط برای تحلیل داخلی نگهداری خواهد شد. لطفاً هزینه، امکان ارائه
> خدمت به حساب ایرانی، پوشش زنده و تاریخی، واحد هر نماد (ریال/تومان)، منطقه زمانی و
> مهر زمانی، شرایط ذخیره‌سازی و مدت نگهداری، دوره آزمایشی و مجوز کتبی استفاده داخلی
> را اعلام کنید.

## Exact Acceptance Gate

Backfill remains disabled until all of the following evidence is recorded:

- written Navasan confirmation covering the selected instruments, exact date range,
  private storage, retention, and internal analytical use;
- written terms and quote for TGJU or an equivalent independent Iranian source;
- owner approval of any cost and the final date range;
- an engineering verification plan for units, timestamps, gaps, divergence,
  quarantine, and restore before financial use.

After those conditions are satisfied, the existing local planner can calculate the
exact quota cost before the owner authorizes the first real request.
