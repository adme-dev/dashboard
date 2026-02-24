---
name: meta-ads
description: Manage Meta (Facebook/Instagram) ad campaigns via the Marketing API. Create campaigns, ad sets, ads, read performance insights, and optimize targeting for automotive advertising.
---

# Meta Ads (Facebook Marketing API)

Manage Meta ad campaigns for automotive dealership clients.

## Prerequisites

- `META_ACCESS_TOKEN` environment variable set (long-lived system user token)
- `META_AD_ACCOUNT_ID` environment variable set (format: act_XXXXXXXXX)

## API Base URL

`https://graph.facebook.com/v21.0`

## Common Operations

### Get Ad Account Info
```bash
curl -s "https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}?fields=name,account_status,currency,balance&access_token=${META_ACCESS_TOKEN}"
```

### List Campaigns
```bash
curl -s "https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&access_token=${META_ACCESS_TOKEN}"
```

### Create Campaign
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/campaigns" \
  -d "name=Campaign Name" \
  -d "objective=OUTCOME_TRAFFIC" \
  -d "status=PAUSED" \
  -d "access_token=${META_ACCESS_TOKEN}"
```

### Get Campaign Insights
```bash
curl -s "https://graph.facebook.com/v21.0/CAMPAIGN_ID/insights?fields=impressions,clicks,ctr,cpc,spend,actions,cost_per_action_type&time_range={\"since\":\"2026-01-01\",\"until\":\"2026-01-31\"}&access_token=${META_ACCESS_TOKEN}"
```

### Get Ad Account Insights (Summary)
```bash
curl -s "https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/insights?fields=impressions,clicks,ctr,cpc,spend,actions&date_preset=last_30d&access_token=${META_ACCESS_TOKEN}"
```

### Create Ad Set
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/adsets" \
  -d "name=Ad Set Name" \
  -d "campaign_id=CAMPAIGN_ID" \
  -d "daily_budget=5000" \
  -d "billing_event=IMPRESSIONS" \
  -d "optimization_goal=LINK_CLICKS" \
  -d "targeting={\"geo_locations\":{\"countries\":[\"AU\"]},\"age_min\":25,\"age_max\":65}" \
  -d "status=PAUSED" \
  -d "access_token=${META_ACCESS_TOKEN}"
```

### Create Ad Creative
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/adcreatives" \
  -d "name=Creative Name" \
  -d 'object_story_spec={"page_id":"PAGE_ID","link_data":{"link":"https://dealership.com","message":"Primary text","name":"Headline","description":"Description","call_to_action":{"type":"LEARN_MORE"}}}' \
  -d "access_token=${META_ACCESS_TOKEN}"
```

### Create Ad
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/ads" \
  -d "name=Ad Name" \
  -d "adset_id=ADSET_ID" \
  -d "creative={\"creative_id\":\"CREATIVE_ID\"}" \
  -d "status=PAUSED" \
  -d "access_token=${META_ACCESS_TOKEN}"
```

### Update Campaign Status
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/CAMPAIGN_ID" \
  -d "status=ACTIVE" \
  -d "access_token=${META_ACCESS_TOKEN}"
```

## Automotive Targeting Tips

- Interests: "New cars", "Used cars", "Car dealerships", specific makes/models
- Behaviors: "In-market for a vehicle"
- Demographics: Age 25-65, household income where available
- Location: Radius around dealership (15-50km typical)
- Custom audiences: Website visitors, CRM uploads, lookalike audiences

## Key Metrics for Reporting

| Metric | Description |
|--------|-------------|
| impressions | Total ad views |
| clicks | Link clicks |
| ctr | Click-through rate |
| cpc | Cost per click |
| spend | Total amount spent |
| actions | Conversions by type |
| cost_per_action_type | Cost per conversion |
| frequency | Average times shown per person |
| reach | Unique people who saw the ad |

## Campaign Objectives

- `OUTCOME_TRAFFIC` — Drive website visits
- `OUTCOME_LEADS` — Generate lead form submissions
- `OUTCOME_AWARENESS` — Brand awareness/reach
- `OUTCOME_ENGAGEMENT` — Post engagement
- `OUTCOME_SALES` — Conversions/purchases

## Notes

- All monetary values are in cents (5000 = $50.00)
- Always create campaigns in PAUSED status first, then activate after review
- Replace PAGE_ID, CAMPAIGN_ID, ADSET_ID, CREATIVE_ID with actual values
