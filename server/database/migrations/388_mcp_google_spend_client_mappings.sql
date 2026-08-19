BEGIN;

-- Exact Google Ads account IDs verified against the agency's client roster.
-- Dealership sub-accounts map to their contracted parent group unless a
-- dedicated client record exists. Account 8140847721 (We Buy Any Cars
-- Brisbane) is deliberately quarantined because no authoritative client link
-- exists in XeroFlow.
WITH verified(account_id, client_id) AS (
  VALUES
    ('3990667550', 'e62130fa-24e9-40af-8f84-02cbda135026'::uuid), -- Boulevard Motors
    ('9953575658', '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid), -- Brighton LDV -> Brighton Auto Group
    ('3520004446', '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid), -- Brighton Renault
    ('2340710243', '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid), -- Brighton Suzuki
    ('8524338413', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid), -- Frankston Ford -> Frankston Motor Group
    ('7970018382', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid), -- Frankston GMSV
    ('6211138054', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid), -- Frankston Isuzu UTE
    ('3433540049', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid), -- Frankston Kia
    ('8431694041', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid), -- Frankston Nissan
    ('2606571266', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid), -- Frankston Renault
    ('3002525913', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid), -- Frankston SsangYong
    ('7538994003', '44c4b033-d7cf-46b9-896f-462e8d778027'::uuid), -- GWS Kia
    ('9371901592', 'ac457852-29ea-478b-86a7-99b55466867e'::uuid), -- Geelong Kia -> Geelong Motor Group
    ('8619125035', 'ac457852-29ea-478b-86a7-99b55466867e'::uuid), -- Geelong Mazda
    ('5340680223', '17a75bda-9f75-42bf-863b-84eee03bb1e7'::uuid), -- Mornington Ford -> Mornington Motor Group
    ('8234727398', '79516f9c-c327-40da-80df-33be0dfc04df'::uuid), -- Mornington Nissan
    ('7583977544', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid), -- Northern GAC -> Northern Motor Group
    ('8722693500', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid), -- Northern Jeep
    ('9186592325', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid), -- Northern Leapmotor
    ('8969882866', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid), -- Northern MG
    ('5253781131', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid), -- Northern Nissan
    ('6036084349', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid), -- Northern SsangYong
    ('2756573791', '7f5738a0-ea8d-433c-947c-ae9f62112745'::uuid), -- Northern RAM
    ('3843542276', '1548b4d1-1857-46da-8f6a-38ca6c46f808'::uuid), -- South Morang MG -> South Morang Motor Group
    ('6801934411', '1b452a0e-b6d5-498c-a429-1cdf9ff54409'::uuid)  -- South Morang Omoda Jaecoo
)
UPDATE social_connections connection
   SET client_id = verified.client_id,
       updated_at = NOW()
  FROM verified
 WHERE connection.account_id = verified.account_id
   AND connection.platform IN ('google', 'google_ads')
   AND connection.client_id IS NULL;

WITH verified(account_id, client_id) AS (
  VALUES
    ('3990667550', 'e62130fa-24e9-40af-8f84-02cbda135026'::uuid),
    ('9953575658', '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid),
    ('3520004446', '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid),
    ('2340710243', '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid),
    ('8524338413', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid),
    ('7970018382', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid),
    ('6211138054', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid),
    ('3433540049', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid),
    ('8431694041', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid),
    ('2606571266', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid),
    ('3002525913', '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid),
    ('7538994003', '44c4b033-d7cf-46b9-896f-462e8d778027'::uuid),
    ('9371901592', 'ac457852-29ea-478b-86a7-99b55466867e'::uuid),
    ('8619125035', 'ac457852-29ea-478b-86a7-99b55466867e'::uuid),
    ('5340680223', '17a75bda-9f75-42bf-863b-84eee03bb1e7'::uuid),
    ('8234727398', '79516f9c-c327-40da-80df-33be0dfc04df'::uuid),
    ('7583977544', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid),
    ('8722693500', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid),
    ('9186592325', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid),
    ('8969882866', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid),
    ('5253781131', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid),
    ('6036084349', 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid),
    ('2756573791', '7f5738a0-ea8d-433c-947c-ae9f62112745'::uuid),
    ('3843542276', '1548b4d1-1857-46da-8f6a-38ca6c46f808'::uuid),
    ('6801934411', '1b452a0e-b6d5-498c-a429-1cdf9ff54409'::uuid)
)
UPDATE media_spend spend
   SET client_id = verified.client_id,
       updated_at = NOW()
  FROM social_connections connection
  JOIN verified ON verified.account_id = connection.account_id
 WHERE spend.connection_id = connection.id
   AND spend.platform = 'google_ads'
   AND spend.client_id IS NULL;

COMMIT;
