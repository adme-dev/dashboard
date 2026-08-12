<script setup lang="ts">
const props = defineProps<{
  open: boolean
  launchId: string
  config: {
    customerId?: string
    merchantCenterId?: string
    budget?: { currency?: string }
    [key: string]: unknown
  }
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const toast = useToast()
const saving = ref(false)
const reason = ref('Verified against Google administrative surfaces and the client onboarding record.')

const accessOptions = [
  { label: 'Approved', value: 'approved' },
  { label: 'Pending', value: 'pending' },
  { label: 'Not requested', value: 'not_requested' },
  { label: 'Rejected', value: 'rejected' }
]
const developerTokenOptions = [
  { label: 'Standard', value: 'standard' },
  { label: 'Basic', value: 'basic' },
  { label: 'Explorer', value: 'explorer' },
  { label: 'Test', value: 'test' },
  { label: 'Pending', value: 'pending' },
  { label: 'Missing', value: 'missing' }
]
const accountStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Missing', value: 'missing' }
]
const billingOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
  { label: 'Missing', value: 'missing' }
]
const policyOptions = [
  { label: 'Clear', value: 'clear' },
  { label: 'Under review', value: 'under_review' },
  { label: 'Restricted', value: 'restricted' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Unknown', value: 'unknown' }
]
const merchantTermsOptions = [
  { label: 'Accepted', value: 'accepted' },
  { label: 'Not accepted', value: 'not_accepted' },
  { label: 'Unknown', value: 'unknown' }
]
const merchantBusinessOptions = [
  { label: 'Complete', value: 'complete' },
  { label: 'Incomplete', value: 'incomplete' },
  { label: 'Missing', value: 'missing' }
]
const homepageOptions = [
  { label: 'Claimed', value: 'claimed' },
  { label: 'Verified', value: 'verified' },
  { label: 'Unverified', value: 'unverified' },
  { label: 'Conflict', value: 'conflict' },
  { label: 'Missing', value: 'missing' }
]
const profileRoleOptions = [
  { label: 'Owner', value: 'owner' },
  { label: 'Manager', value: 'manager' },
  { label: 'None', value: 'none' }
]
const locationStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Temporarily closed', value: 'temporarily_closed' },
  { label: 'Permanently closed', value: 'permanently_closed' },
  { label: 'Missing', value: 'missing' }
]
const duplicateOptions = [
  { label: 'Clear', value: 'clear' },
  { label: 'Possible duplicate', value: 'possible' },
  { label: 'Duplicate', value: 'duplicate' },
  { label: 'Unknown', value: 'unknown' }
]
const dataSourceStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Missing', value: 'missing' },
  { label: 'Not used', value: 'not_used' }
]
const linkOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
  { label: 'Missing', value: 'missing' }
]
const addonOptions = [
  { label: 'Enabled', value: 'enabled' },
  { label: 'Pending', value: 'pending' },
  { label: 'Not enabled', value: 'not_enabled' },
  { label: 'Unavailable', value: 'unavailable' }
]
const reviewOptions = [
  { label: 'Approved', value: 'approved' },
  { label: 'Pending', value: 'pending' },
  { label: 'Not started', value: 'not_started' },
  { label: 'Rejected', value: 'rejected' }
]
const websiteReviewOptions = [
  { label: 'Approved', value: 'approved' },
  { label: 'Pending', value: 'pending' },
  { label: 'Not started', value: 'not_started' },
  { label: 'Failed', value: 'failed' }
]

function createEvidence() {
  return {
    countryCode: 'AU',
    platform: {
      googleCloudProjectId: null as string | null,
      oauth: {
        clientConfigured: false, consentScreenConfigured: false, offlineAccessGranted: false,
        googleAdsScopeGranted: false, merchantScopeGranted: false, businessProfileScopeGranted: false
      },
      googleAdsApi: { enabled: false, developerTokenAccess: 'missing' },
      merchantApi: { enabled: false, createAndConfigureAccess: false, providerAccountId: null as string | null },
      businessProfileApis: { enabled: false, access: 'not_requested' }
    },
    googleAds: {
      customerId: props.config.customerId || null,
      managerCustomerId: null as string | null,
      status: 'active', adminAccess: false, apiAccess: false, clientAccountCreationEligible: false,
      currencyCode: props.config.budget?.currency || null,
      timeZone: null as string | null,
      billingStatus: 'missing', policyStatus: 'unknown'
    },
    merchant: {
      accountId: props.config.merchantCenterId || null,
      status: 'active', adminAccess: false, apiAccess: false, clientAdminPresent: false,
      termsOfService: 'unknown', businessInformation: 'missing', homepage: 'missing'
    },
    businessProfile: {
      accountId: null as string | null, locationId: null as string | null, storeCode: null as string | null,
      verified: false, apiAccess: false, accessRole: 'none', locationStatus: 'missing',
      duplicateCheck: 'unknown', physicalStoreConfirmed: false
    },
    dealershipLocations: {
      source: 'business_profile', storeDataSourceId: null as string | null,
      storeDataSourceStatus: 'not_used', storeCodes: [] as string[]
    },
    feed: { storeCodes: [] as string[], destination: 'VEHICLE_ADS_ONLY' },
    links: { adsToMerchant: 'missing', merchantToBusinessProfile: 'missing' },
    vehicleAds: {
      addon: 'not_enabled', dealershipLicenseReview: 'not_started', websiteReview: 'not_started',
      accountStateScope: 'unknown'
    }
  }
}

const evidence = reactive(createEvidence())
const dealershipStoreCodes = ref('')
const feedStoreCodes = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  Object.assign(evidence, createEvidence())
  dealershipStoreCodes.value = ''
  feedStoreCodes.value = ''
})

function nullable(value: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

function storeCodes(value: string) {
  return [...new Set(value.split(/[\n,]+/).map(item => item.trim()).filter(Boolean))]
}

function messageOf(cause: unknown) {
  const value = cause as { data?: { statusMessage?: string }, message?: string }
  return value?.data?.statusMessage || value?.message || 'Onboarding evidence could not be saved.'
}

async function save() {
  saving.value = true
  try {
    const payload = structuredClone(evidence)
    payload.platform.googleCloudProjectId = nullable(payload.platform.googleCloudProjectId)
    payload.platform.merchantApi.providerAccountId = nullable(payload.platform.merchantApi.providerAccountId)
    payload.googleAds.customerId = nullable(payload.googleAds.customerId)
    payload.googleAds.managerCustomerId = nullable(payload.googleAds.managerCustomerId)
    payload.googleAds.currencyCode = nullable(payload.googleAds.currencyCode)
    payload.googleAds.timeZone = nullable(payload.googleAds.timeZone)
    payload.merchant.accountId = nullable(payload.merchant.accountId)
    payload.businessProfile.accountId = nullable(payload.businessProfile.accountId)
    payload.businessProfile.locationId = nullable(payload.businessProfile.locationId)
    payload.businessProfile.storeCode = nullable(payload.businessProfile.storeCode)
    payload.dealershipLocations.storeDataSourceId = nullable(payload.dealershipLocations.storeDataSourceId)
    payload.dealershipLocations.storeCodes = storeCodes(dealershipStoreCodes.value)
    payload.feed.storeCodes = storeCodes(feedStoreCodes.value)
    await $fetch(`/api/agency/social/google/pmax-launches/${props.launchId}/onboarding`, {
      method: 'POST', body: { evidence: payload, reason: reason.value }
    })
    toast.add({ title: 'Onboarding evidence attested', description: 'The snapshot is bound to this exact launch version for 30 days.', color: 'success' })
    emit('saved')
    emit('update:open', false)
  } catch (cause) {
    toast.add({ title: 'Could not attest onboarding', description: messageOf(cause), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal :open="open" :ui="{ content: 'max-w-5xl' }" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="flex max-h-[90vh] flex-col">
        <header class="flex items-start justify-between gap-4 border-b border-default px-6 py-5">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted">
              Version-bound evidence
            </p>
            <h2 class="mt-1 text-xl font-semibold">
              Google account onboarding attestation
            </h2>
            <p class="mt-1 max-w-3xl text-sm text-muted">
              Confirm administrative facts only after checking the relevant Google surfaces. Secrets are never collected.
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            aria-label="Close"
            @click="emit('update:open', false)"
          />
        </header>

        <div class="@container overflow-y-auto px-6 py-5">
          <div class="space-y-6">
            <UAlert
              color="warning"
              variant="subtle"
              title="Attestation, not automation"
              description="API readback handles machine-verifiable facts during preflight. This form records the remaining operator-verified account, billing, Business Profile, licence, and website review facts."
            />

            <section class="space-y-4">
              <div>
                <h3 class="font-semibold">
                  Cloud project and OAuth
                </h3>
                <p class="text-sm text-muted">
                  Confirm the Cloudflare-hosted platform has the required Google project, APIs, and delegated scopes.
                </p>
              </div>
              <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
                <UFormField label="Google Cloud project ID">
                  <UInput v-model="evidence.platform.googleCloudProjectId" class="w-full" placeholder="Project ID" />
                </UFormField>
                <UFormField label="Developer token access">
                  <USelect v-model="evidence.platform.googleAdsApi.developerTokenAccess" :items="developerTokenOptions" class="w-full" />
                </UFormField>
                <UFormField label="OAuth client configured">
                  <UCheckbox v-model="evidence.platform.oauth.clientConfigured" label="Confirmed" />
                </UFormField>
                <UFormField label="Consent screen configured">
                  <UCheckbox v-model="evidence.platform.oauth.consentScreenConfigured" label="Confirmed" />
                </UFormField>
                <UFormField label="Offline access granted">
                  <UCheckbox v-model="evidence.platform.oauth.offlineAccessGranted" label="Confirmed" />
                </UFormField>
                <UFormField label="Google Ads scope">
                  <UCheckbox v-model="evidence.platform.oauth.googleAdsScopeGranted" label="Granted" />
                </UFormField>
                <UFormField label="Merchant scope">
                  <UCheckbox v-model="evidence.platform.oauth.merchantScopeGranted" label="Granted" />
                </UFormField>
                <UFormField label="Business Profile scope">
                  <UCheckbox v-model="evidence.platform.oauth.businessProfileScopeGranted" label="Granted" />
                </UFormField>
                <UFormField label="Google Ads API">
                  <UCheckbox v-model="evidence.platform.googleAdsApi.enabled" label="Enabled" />
                </UFormField>
                <UFormField label="Merchant API">
                  <UCheckbox v-model="evidence.platform.merchantApi.enabled" label="Enabled" />
                </UFormField>
                <UFormField label="Merchant create/configure access">
                  <UCheckbox v-model="evidence.platform.merchantApi.createAndConfigureAccess" label="Confirmed" />
                </UFormField>
                <UFormField label="Merchant provider account ID">
                  <UInput v-model="evidence.platform.merchantApi.providerAccountId" class="w-full" />
                </UFormField>
                <UFormField label="Business Profile APIs">
                  <UCheckbox v-model="evidence.platform.businessProfileApis.enabled" label="Enabled" />
                </UFormField>
                <UFormField label="Business Profile API access">
                  <USelect v-model="evidence.platform.businessProfileApis.access" :items="accessOptions" class="w-full" />
                </UFormField>
              </div>
            </section>

            <section class="space-y-4 border-t border-default pt-6">
              <div>
                <h3 class="font-semibold">
                  Google Ads and Merchant Center
                </h3><p class="text-sm text-muted">
                  Identity fields are prefilled from the immutable launch configuration.
                </p>
              </div>
              <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
                <UFormField label="Google Ads customer ID">
                  <UInput v-model="evidence.googleAds.customerId" class="w-full" disabled />
                </UFormField>
                <UFormField label="Manager customer ID">
                  <UInput v-model="evidence.googleAds.managerCustomerId" class="w-full" />
                </UFormField>
                <UFormField label="Ads account status">
                  <USelect v-model="evidence.googleAds.status" :items="accountStatusOptions" class="w-full" />
                </UFormField>
                <UFormField label="Account currency">
                  <UInput v-model="evidence.googleAds.currencyCode" class="w-full" disabled />
                </UFormField>
                <UFormField label="Account timezone">
                  <UInput v-model="evidence.googleAds.timeZone" class="w-full" placeholder="Australia/Melbourne" />
                </UFormField>
                <UFormField label="Billing status">
                  <USelect v-model="evidence.googleAds.billingStatus" :items="billingOptions" class="w-full" />
                </UFormField>
                <UFormField label="Policy status">
                  <USelect v-model="evidence.googleAds.policyStatus" :items="policyOptions" class="w-full" />
                </UFormField>
                <UFormField label="Ads admin access">
                  <UCheckbox v-model="evidence.googleAds.adminAccess" label="Confirmed" />
                </UFormField>
                <UFormField label="Ads API access">
                  <UCheckbox v-model="evidence.googleAds.apiAccess" label="Confirmed" />
                </UFormField>
                <UFormField label="Client account creation eligibility">
                  <UCheckbox v-model="evidence.googleAds.clientAccountCreationEligible" label="Eligible" />
                </UFormField>
                <UFormField label="Merchant account ID">
                  <UInput v-model="evidence.merchant.accountId" class="w-full" disabled />
                </UFormField>
                <UFormField label="Merchant status">
                  <USelect v-model="evidence.merchant.status" :items="accountStatusOptions" class="w-full" />
                </UFormField>
                <UFormField label="Terms of service">
                  <USelect v-model="evidence.merchant.termsOfService" :items="merchantTermsOptions" class="w-full" />
                </UFormField>
                <UFormField label="Business information">
                  <USelect v-model="evidence.merchant.businessInformation" :items="merchantBusinessOptions" class="w-full" />
                </UFormField>
                <UFormField label="Homepage">
                  <USelect v-model="evidence.merchant.homepage" :items="homepageOptions" class="w-full" />
                </UFormField>
                <UFormField label="Merchant admin access">
                  <UCheckbox v-model="evidence.merchant.adminAccess" label="Confirmed" />
                </UFormField>
                <UFormField label="Merchant API access">
                  <UCheckbox v-model="evidence.merchant.apiAccess" label="Confirmed" />
                </UFormField>
                <UFormField label="Client administrator present">
                  <UCheckbox v-model="evidence.merchant.clientAdminPresent" label="Confirmed" />
                </UFormField>
              </div>
            </section>

            <section class="space-y-4 border-t border-default pt-6">
              <div>
                <h3 class="font-semibold">
                  Business Profile and dealership location
                </h3><p class="text-sm text-muted">
                  A Google Business Profile location ID is not a Merchant Center store code. Record both where applicable.
                </p>
              </div>
              <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
                <UFormField label="Business Profile account ID">
                  <UInput v-model="evidence.businessProfile.accountId" class="w-full" />
                </UFormField>
                <UFormField label="Business Profile location ID">
                  <UInput v-model="evidence.businessProfile.locationId" class="w-full" />
                </UFormField>
                <UFormField label="Merchant store code">
                  <UInput v-model="evidence.businessProfile.storeCode" class="w-full" />
                </UFormField>
                <UFormField label="Access role">
                  <USelect v-model="evidence.businessProfile.accessRole" :items="profileRoleOptions" class="w-full" />
                </UFormField>
                <UFormField label="Location status">
                  <USelect v-model="evidence.businessProfile.locationStatus" :items="locationStatusOptions" class="w-full" />
                </UFormField>
                <UFormField label="Duplicate check">
                  <USelect v-model="evidence.businessProfile.duplicateCheck" :items="duplicateOptions" class="w-full" />
                </UFormField>
                <UFormField label="Business Profile verified">
                  <UCheckbox v-model="evidence.businessProfile.verified" label="Verified" />
                </UFormField>
                <UFormField label="Business Profile API access">
                  <UCheckbox v-model="evidence.businessProfile.apiAccess" label="Confirmed" />
                </UFormField>
                <UFormField label="Physical dealership confirmed">
                  <UCheckbox v-model="evidence.businessProfile.physicalStoreConfirmed" label="Confirmed" />
                </UFormField>
                <UFormField label="Location source">
                  <USelect v-model="evidence.dealershipLocations.source" :items="[{ label: 'Business Profile', value: 'business_profile' }, { label: 'Merchant store data source', value: 'store_data_source' }]" class="w-full" />
                </UFormField>
                <UFormField label="Store data source ID">
                  <UInput v-model="evidence.dealershipLocations.storeDataSourceId" class="w-full" />
                </UFormField>
                <UFormField label="Store data source status">
                  <USelect v-model="evidence.dealershipLocations.storeDataSourceStatus" :items="dataSourceStatusOptions" class="w-full" />
                </UFormField>
                <UFormField label="Dealership store codes" help="Comma or line separated">
                  <UTextarea v-model="dealershipStoreCodes" class="w-full" :rows="3" />
                </UFormField>
                <UFormField label="Vehicle feed store codes" help="Must reconcile with dealership codes">
                  <UTextarea v-model="feedStoreCodes" class="w-full" :rows="3" />
                </UFormField>
                <UFormField label="Feed destination">
                  <USelect v-model="evidence.feed.destination" :items="[{ label: 'Vehicle Ads only', value: 'VEHICLE_ADS_ONLY' }, { label: 'Shopping Ads', value: 'SHOPPING_ADS' }, { label: 'Free listings', value: 'FREE_LISTINGS' }, { label: 'Unknown', value: 'UNKNOWN' }]" class="w-full" />
                </UFormField>
              </div>
            </section>

            <section class="space-y-4 border-t border-default pt-6">
              <div>
                <h3 class="font-semibold">
                  Links and Vehicle Ads reviews
                </h3><p class="text-sm text-muted">
                  These must be complete before activation; pending facts become deterministic blockers.
                </p>
              </div>
              <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
                <UFormField label="Ads → Merchant link">
                  <USelect v-model="evidence.links.adsToMerchant" :items="linkOptions" class="w-full" />
                </UFormField>
                <UFormField label="Merchant → Business Profile link">
                  <USelect v-model="evidence.links.merchantToBusinessProfile" :items="linkOptions" class="w-full" />
                </UFormField>
                <UFormField label="Vehicle Ads add-on">
                  <USelect v-model="evidence.vehicleAds.addon" :items="addonOptions" class="w-full" />
                </UFormField>
                <UFormField label="Dealership licence review">
                  <USelect v-model="evidence.vehicleAds.dealershipLicenseReview" :items="reviewOptions" class="w-full" />
                </UFormField>
                <UFormField label="Website review">
                  <USelect v-model="evidence.vehicleAds.websiteReview" :items="websiteReviewOptions" class="w-full" />
                </UFormField>
                <UFormField label="Account state scope">
                  <USelect v-model="evidence.vehicleAds.accountStateScope" :items="[{ label: 'Single state', value: 'single_state' }, { label: 'Multi-state', value: 'multi_state' }, { label: 'Unknown', value: 'unknown' }]" class="w-full" />
                </UFormField>
              </div>
            </section>

            <UFormField label="Attestation reason" help="Explain which source records and Google surfaces were checked.">
              <UTextarea v-model="reason" class="w-full" :rows="3" />
            </UFormField>
          </div>
        </div>

        <footer class="flex flex-col-reverse gap-2 border-t border-default px-6 py-4 sm:flex-row sm:justify-end">
          <UButton color="neutral" variant="ghost" @click="emit('update:open', false)">
            Cancel
          </UButton>
          <UButton icon="i-lucide-shield-check" :loading="saving" @click="save">
            Attest exact evidence
          </UButton>
        </footer>
      </div>
    </template>
  </UModal>
</template>
