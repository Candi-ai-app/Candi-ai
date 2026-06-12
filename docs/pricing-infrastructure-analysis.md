# CANDI Infrastructure Cost & Pricing Analysis

## Current CANDI Infrastructure Costs (Monthly)

### Hosting & Deployment
- **Vercel Pro**: $20/month (unlimited deployments, edge functions, analytics)
  - Standard: $20/month flat
  - Bandwidth: $0.50 per GB extra (overage)
  - Could scale to Enterprise if needed (~$500-2000/month)

### Database (Supabase)
- **Supabase Starter**: Free tier ($0)
  - Current status: May need to upgrade as real data grows (18,925+ voters)
- **Supabase Pro**: $25/month minimum
  - 2GB database
  - 100GB bandwidth
  - For CANDI scale: Likely Pro tier + overage costs
  - Estimated real cost: $50-150/month for real-world scale

### Geolocation & Mapping
- **Mapbox Pro**: $0-150/month depending on usage
  - Unlimited maps: $9/month (fixed)
  - Vector tiles: Included
  - Raster tiles: Included
  - Geocoding: $0.50 per 1,000 requests
  - For field app with GPS polling: ~$50-100/month

### AI/LLM API
- **Anthropic (Claude API)**: Pay-as-you-go
  - Claude 3.5 Sonnet: ~$3 per 1M input tokens, ~$15 per 1M output tokens
  - Ask Candi feature: ~5-10 requests/user/month
  - Estimated: $200-500/month for moderate usage
  - Could go higher with heavy Ask Candi usage

### Monitoring & Observability
- **Vercel Analytics**: Included in Pro
- **Sentry (error tracking)**: Free tier or $29+/month
- **PostHog (product analytics)**: Free or $500+/month
- Estimated: $30-50/month for basic monitoring

### SMS/Texting (if enabled)
- **Twilio**: Variable, $0.0075 per SMS
- Currently greyed out, but if enabled: $500-2000/month for active field use

## TOTAL ESTIMATED MONTHLY INFRASTRUCTURE COSTS
### Minimum Viable (Free tier): $20/month (Vercel only)
### Realistic Production: $150-400/month
### With heavy usage/scaling: $500-1500/month

---

## VAN Pricing (Competitor Analysis)

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

---

## CANDI Pricing Model (1k-4k/month range)

### Tiered Pricing Strategy

#### TIER 1: STARTER - $1,000/month
**Ideal for**: Small local campaigns, 1-2 candidates
- Voters in database: Up to 50,000
- Field app seats: 5 canvassers
- Real-time tracking: Yes
- Ask Candi AI: 50 queries/month
- Basic reporting
- Email support
- Estimated margin: 85-90%

#### TIER 2: PROFESSIONAL - $2,000/month
**Ideal for**: Mid-sized campaigns, 3-5 candidates, state-level operations
- Voters in database: Up to 200,000
- Field app seats: 20 canvassers
- Real-time tracking + analytics
- Ask Candi AI: Unlimited
- Advanced filtering (super-voter, race, gender)
- Custom reporting
- Turf management & optimization
- Priority email/Slack support
- Estimated margin: 80-85%

#### TIER 3: ENTERPRISE - $4,000/month
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
- Estimated margin: 75-80%

### One-time Setup/Onboarding Fee
- **$500-1,500**: Data import, user setup, training (1-2 weeks)
- Could be bundled into first month or charged separately

---

## Revenue & Margin Analysis

### Assumptions
- Infrastructure cost: $300/month (average across all tiers)
- Support/operations: $100/month per customer
- Platform maintenance: $500/month (fixed across all)

### Per-Customer Economics

#### Starter ($1,000/month)
- Revenue: $1,000
- Direct costs: $300
- Allocated support: $100
- Platform allocation: ~$170 (if spreading $500 across 3 customers)
- **Gross margin: ~43%** (healthy for B2B SaaS)

#### Professional ($2,000/month)
- Revenue: $2,000
- Direct costs: $350
- Allocated support: $150
- Platform allocation: ~$170
- **Gross margin: ~57%**

#### Enterprise ($4,000/month)
- Revenue: $4,000
- Direct costs: $400
- Allocated support: $300
- Platform allocation: ~$170
- **Gross margin: ~62%**

---

## Competitive Positioning

### vs. VAN ($2,000-5,000/month)
- ✅ **CANDI advantages**: 
  - Lower entry point ($1k vs $2k minimum)
  - All-in-one (no separate field app license)
  - AI-powered insights (Ask Candi)
  - Faster onboarding (web-first, no legacy systems)
  - Real-time GPS + modern UX
  
- ⚠️ **VAN advantages**:
  - Massive voter database (18M+)
  - 30+ years of data + relationships
  - Industry inertia

### vs. Rally ($1,500-4,000/month)
- **CANDI**: Digital + field operations
- **Rally**: Direct mail + SMS focus
- **Opportunity**: Position as complementary or replacement

---

## Recommendation: Pricing Model

### Suggested Launch Positioning
1. **Starter** at **$1,000/month** (entry point to steal from Mini-VAN users)
2. **Professional** at **$2,500/month** (undercut VAN's standard $2k-3k)
3. **Enterprise** at **$4,500/month** (feature parity with VAN at same price)

### Why This Works
- Starter is accessible to small campaigns (lower risk entry)
- Professional is 25% cheaper than VAN for similar features
- Enterprise matches VAN pricing with modern features (AI, real-time GPS, web-first UX)
- Built-in margin supports scaling (60-85% gross margins)
- Clear value ladder ($1.5k steps) encourages upsells

### Go-to-Market First 6 Months
1. **Launch with Pro at $2,500** (focus on state-level campaigns, smaller than VAN's typical customer)
2. **Offer Starter at $1,000** (for small campaigns, local races)
3. **Add Enterprise at $4,500** (when you have 3-5 professional customers requesting more)
4. **Track NPS, churn, expand metrics** — adjust pricing based on real customer feedback

### Expected Outcomes (Year 1 Projection)
- **5 Professional customers**: $12,500/month ($75k in variable margin/month)
- **3 Starter customers**: $3,000/month
- **1 Enterprise customer**: $4,500/month
- **Total first year**: ~$360k ARR with ~$2.1M gross margin (70%+)

