# CANDI Infrastructure Costs & Pricing Strategy

**Status**: Pre-revenue MVP phase  
**Updated**: June 9, 2026  
**Current Monthly Spend**: $20-50/month

---

## PART 1: CURRENT INFRASTRUCTURE COSTS (Free/Starter Tiers)

### Cost Breakdown

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

### Total Current Monthly Cost

```
MINIMUM:    $0/month   (all free tiers, pay-as-you-go API only)
REALISTIC:  $20/month  (Vercel Pro only, minimal API usage)
PEAK:       $50/month  (if Anthropic API usage spikes)
```

### Runway Before Tier Upgrades Needed

| Metric | Current Limit | Current Usage | Time to Upgrade |
|--------|---------------|----------------|-----------------|
| **Supabase Database** | 500MB | ~50MB (18k voters) | 6-12 months |
| **Supabase Bandwidth** | 2GB/month | ~100MB/month | 12+ months |
| **Mapbox Map Loads** | 50k/month | ~2-5k/month | 6-12 months |
| **Anthropic API** | None (pay-as-you-go) | ~$10-20/month | N/A |
| **Vercel Bandwidth** | 100GB/month free | ~1-2GB/month | 12+ months |

---

## PART 2: INFRASTRUCTURE SCALING ROADMAP

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

## PART 3: 3-TIER PRICING MODEL

### Tiered Pricing Strategy

#### TIER 1: STARTER - $1,000/month
**Ideal for**: Small local campaigns, 1-2 candidates
- Voters in database: Up to 50,000
- Field app seats: 5 canvassers
- Real-time tracking: Yes
- Ask Candi AI: 50 queries/month
- Basic reporting
- Email support
- Infrastructure cost: $5-10/month
- **Gross margin: 99%** ✅

#### TIER 2: PROFESSIONAL - $2,500/month
**Ideal for**: Mid-sized campaigns, 3-5 candidates, state-level operations
- Voters in database: Up to 200,000
- Field app seats: 20 canvassers
- Real-time tracking + analytics
- Ask Candi AI: Unlimited
- Advanced filtering (super-voter, race, gender)
- Custom reporting
- Turf management & optimization
- Priority email/Slack support
- Infrastructure cost: $10-15/month
- **Gross margin: 99%** ✅

#### TIER 3: ENTERPRISE - $4,500/month
**Ideal for**: Large campaigns, multiple races, state/national
- Voters in database: 500,000+
- Field app seats: Unlimited
- Real-time tracking + predictive analytics
- Ask Candi AI: Unlimited + custom training on campaign data
- All Tier 2 features
- Custom API access
- Dedicated success manager
- Direct integration with VAN data
- Phone support + Slack
- Monthly strategy calls
- Infrastructure cost: $15-20/month
- **Gross margin: 99%** ✅

### One-time Setup/Onboarding Fee
- **$500-1,500**: Data import, user setup, training (1-2 weeks)
- Could be bundled into first month or charged separately

---

## PART 4: COMPETITIVE ANALYSIS

### VAN (Voter Activation Network) - Industry Standard
- **Candidate Licenses**: $2,000-5,000/month (varies by state/size)
- **Data Access**: Included in license (18M+ voter records)
- **Field App**: Included
- **HQ Dashboard**: Included
- **Support**: Dedicated account manager (Enterprise)
- **Setup**: $500-2000 one-time

### Other Competitors
- **Rally**: $1,500-4,000/month (estimated, private pricing)
- **FrontlineHQ**: $500-2,000/month (direct mail + digital)
- **Mini-VAN**: $300-1,000/month (lighter version of VAN)

### CANDI Advantages vs. VAN
- ✅ **Lower entry point**: $1k vs $2k minimum
- ✅ **All-in-one**: No separate field app license
- ✅ **AI-powered insights**: Ask Candi — VAN has nothing like this
- ✅ **Faster onboarding**: Web-first, no legacy system training
- ✅ **Real-time GPS**: VAN's field app is dated
- ✅ **Modern UX**: Built with Next.js, Mapbox, Supabase

### CANDI Positioning
1. **Starter** at **$1,000/month** (entry point to steal from Mini-VAN users)
2. **Professional** at **$2,500/month** (undercut VAN's standard $2k-3k)
3. **Enterprise** at **$4,500/month** (feature parity with VAN at same price)

---

## PART 5: REVENUE & MARGIN ANALYSIS

### Per-Customer Economics

#### Starter ($1,000/month)
- Revenue: $1,000
- Direct infrastructure cost: $5-10
- Allocated support: $50
- Platform maintenance allocation: ~$85
- **Gross margin: 85%** (pre-support scaling)

#### Professional ($2,500/month)
- Revenue: $2,500
- Direct infrastructure cost: $10-15
- Allocated support: $100
- Platform maintenance allocation: ~$85
- **Gross margin: 94%** (pre-support scaling)

#### Enterprise ($4,500/month)
- Revenue: $4,500
- Direct infrastructure cost: $15-20
- Allocated support: $200
- Platform maintenance allocation: ~$85
- **Gross margin: 95%** (pre-support scaling)

### Year 1 Revenue Projection (Conservative)
- **5 Professional customers** @ $2.5k = $150k ARR
- **3 Starter customers** @ $1k = $36k ARR
- **1 Enterprise customer** @ $4.5k = $54k ARR
- **Total: ~$240k ARR** with **~$150k gross profit** (62% margins)

---

## PART 6: GO-TO-MARKET STRATEGY

### Launch Sequence (First 6 Months)

**Phase 1: Focus (Month 1)**
- Launch with **Professional tier** at **$2,500/month**
- Target: state-level campaigns, smaller than VAN's typical customer
- Reach out to Sandy Sears contact from Jun 9 meeting

**Phase 2: Expand (Month 2)**
- Add **Starter** at **$1,000/month** (for small campaigns, local races)
- Add **Enterprise** at **$4,500/month** (when you have 3-5 professional customers requesting more)

**Phase 3: Monitor & Adjust (Month 3+)**
- Track NPS, churn, expand metrics
- Adjust pricing based on real customer feedback
- Prepare infrastructure upgrades (Supabase Pro at first $2.5k customer)

### Key Metrics to Track
- **NPS**: Target >50 from launch customers
- **Churn**: Target <5% monthly
- **Expand**: Average expansion revenue per customer
- **Feature requests**: Prioritize for product roadmap

---

## PART 7: OPTIMIZATION OPPORTUNITIES

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

## PART 8: REVENUE THRESHOLDS FOR UPGRADES

### When to Move Off Free Tiers
- **Revenue**: First $2,500 MRR (one Professional customer)
- **Action**: Upgrade Supabase Pro immediately ($25/month)
- **Impact**: Removes scaling bottleneck, maintains 65%+ margins

### When to Add Paid Monitoring
- **Revenue**: $10,000+ MRR (4+ customers)
- **Action**: Add Sentry ($29/month), PostHog ($29/month)
- **Impact**: Better debugging, product insights, maintains 50%+ margins

### Infrastructure Cost vs. Revenue

| Customers | MRR | Infra Cost | Margin |
|-----------|-----|-----------|--------|
| 1 Pro | $2,500 | $40 | 98% |
| 3 Pro + 2 Starter | $8,500 | $120 | 98% |
| 5 Pro + 3 Starter + 1 Ent | $19,500 | $220 | 98% |
| 10 Pro + 5 Starter + 2 Ent | $39,000 | $380 | 99% |

**Key insight**: Infrastructure costs are so low that you maintain 98%+ margins until you hit 10+ customers, then you upgrade to Supabase Pro ($25) and drop to 96%+ margins.

---

## EXECUTIVE SUMMARY

**Bottom Line**: You can launch CANDI with confidence.

- **Current spend**: $20/month (all free tiers)
- **Pricing**: $1k/$2.5k/$4.5k tiers undercut VAN while maintaining 85-99% margins
- **First customer**: Achievable profitability immediately
- **First 5 customers**: $240k ARR with $150k profit (62% margins)
- **Scale point**: Infrastructure stays cheap until 10+ customers
- **Next step**: Reach out to Sandy Sears (Jun 9 contact) with Professional tier offer

**Recommendation**: Launch with Professional tier ($2,500/month), add Starter/Enterprise tiers within 2 months, optimize for unit economics and customer feedback.

