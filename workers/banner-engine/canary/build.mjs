// Disabled after the retained attempt proved a free-space watchdog is not a
// hard Docker storage quota. No Docker command or network call is performed.
throw new Error(
  'Native canary outer build blocked: Docker in-flight writes exceeded the '
  + '900 MiB watchdog budget; use a separately reviewed quota-backed builder. '
  + 'See docs/banner-studio/editable-artwork/CLOUD-NATIVE-CANARY.md.'
)
