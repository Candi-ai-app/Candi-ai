# CANDI Current Infrastructure Costs (Free/Starter Tiers)

**Status**: Pre-revenue MVP phase  
**Updated**: June 9, 2026  
**Monthly Spend**: ~$20-50/month (mostly free tiers)

---

## Current Cost Breakdown

| Service | Tier | Cost/Month | Usage | Notes |
|---------|------|-----------|-------|-------|
| **Vercel** | Pro | $20 | Production deployment, unlimited builds | Flat fee, includes analytics |
| **Supabase** | Free | $0 | 18,925 voters + full auth + RLS | Limits: 500MB DB, 2GB bandwidth, rate limits |
| **Mapbox** | Free | $0 | Turf mapping, live tracking | Limits: 50k free map loads/month, 600 tiles/sec |
| **Anthropic API** | Pay-as-you-go | $0-30 | Ask Candi (~10-50 queries/week) | Token-based: $3/$15 per 1M in/out tokens |
| **Sentry** | Free | $0 | Error tracking | Limited to 5k errors/month, 30-day retention |
| **PostHog** | Free | $0 | Product analytics (optional) | Self-hosted or free tier |
| **Twilio** | Free | $0 | SMS disabled (greyed out) | When enabled: $0.0075/SMS |
| **Email/Auth** | Supabase | $0 | User authentication, email via Supabase | Included in Supabase free tier |

---

## Total Current Monthly Cost

```
MINIMUM:    $0/month   (all free tiers, pay-as-you-go API only)
REALISTIC:  $20/month  (Vercel Pro only, minimal API usage)
PEAK:       $50/month  (if Anthropic API usage spikes)
```

---

## Runway Before Tier Upgrades Needed

| Metric | Current Limit | Current Usage | Time to Upgrade |
|--------|---------------|----------------|-----------------|
| **Supabase Database** | 500MB | ~50MB (18k voters) | 6-12 months |
| **Supabase Bandwidth** | 2GB/month | ~100MB/month | 12+ months |
| **Mapbox Map Loads** | 50k/month | ~2-5k/month | 6-12 months |
| **Anthropic API** | None (pay-as-you-go) | ~$10-20/month | N/A |
| **Vercel Bandwidth** | 100GB/month free | ~1-2GB/month | 12+ months |

---

## Upgrade Path (When to Migrate)

### Phase 1: Current (Free MVP)
- **When**: Now - Next 3 months
- **Cost**: $20/month
- **Action**: Keep free tiers, monitor usage
- **Risk**: API rate limits during peak field activity

### Phase 2: Minimum Production (Next 3-6 months)
- **When**: After first 2-3 paying customers
- **Cost**: $100-150/month
- **Changes**:
  - Supabase Pro ($25/month) - 2GB DB, higher rate limits
  - Mapbox Pay-as-you-go ($0-50/month estimated)
  - Anthropic API scales to $50-100/month with customer usage

### Phase 3: Scaled Production (6-12 months)
- **When**: 5+ paying customers, heavy field use
- **Cost**: $300-500/month
- **Changes**:
  - Supabase Pro + overage ($50-150/month)
  - Mapbox Pro subscription ($50-100/month)
  - Anthropic API ($100-200/month)
  - Add error tracking (Sentry): $29+/month

### Phase 4: Enterprise (12+ months)
- **When**: 10+ customers, state-level operations
- **Cost**: $800-1500/month
- **Changes**:
  - Supabase dedicated ($1000+)
  - Mapbox Enterprise ($500+)
  - Anthropic API with volume discount ($300+)
  - Full observability stack (Sentry, PostHog)

---

## Key Assumptions for Scaling

**Per Customer Costs**:
- Database growth: ~2-5MB per 10k voters
- API calls: 5-20 Ask Candi queries/user/month
- Map loads: 50-200 per canvasser/month during active season
- Bandwidth: 50-200MB per canvasser/month

**Cost Doesn't Scale Linearly**:
- Supabase: Step function at 500MB, 2GB, 5GB thresholds
- Mapbox: Step function at 50k, 250k, 1M map loads
- Anthropic: Linear token usage, but volume discounts available

---

## Optimization Opportunities

### Without Spending Money
1. ✅ **Implement aggressive caching** on Mapbox tiles (reduce API calls 50%)
2. ✅ **Batch Anthropic API calls** (Ask Candi uses bulk operations)
3. ✅ **Compress voter data** (reduce Supabase storage 30%)
4. ✅ **Rate-limit GPS polling** (currently 15s intervals, could be 30s)

### With Minimal Spend ($50-100/month)
1. **Upgrade Supabase to Pro** ($25) — removes rate limits entirely
2. **Mapbox geocoding API** ($25-50) — for address enrichment
3. **Keep everything else free** — still profitable at $1k+/month pricing

---

## Revenue Threshold for Infrastructure Upgrade

**When to move off free tiers:**
- **Revenue**: First $2,500 MRR (one Professional customer)
- **Action**: Upgrade Supabase Pro immediately
- **Impact**: Removes scaling bottleneck, maintains 65%+ margins

**When to add paid monitoring:**
- **Revenue**: $10,000+ MRR (4+ customers)
- **Action**: Add Sentry ($29/month), PostHog ($29/month)
- **Impact**: Better debugging, product insights, maintains 50%+ margins

---

## Decision: Launch Pricing with Current Infrastructure

| Tier | Price | Infrastructure Cost | Margin |
|------|-------|-------------------|--------|
| Starter ($1k) | $1,000 | $5-10 | **99%** ✅ |
| Professional ($2.5k) | $2,500 | $10-15 | **99%** ✅ |
| Enterprise ($4.5k) | $4,500 | $15-20 | **99%** ✅ |

**The gap before first upgrade**: You can serve 5-10 paying customers on current free/cheap tiers with virtually no variable cost. Once you hit $5k MRR, upgrade Supabase ($25/mo) and you're still at 99% margins. Perfect for MVP phase.

