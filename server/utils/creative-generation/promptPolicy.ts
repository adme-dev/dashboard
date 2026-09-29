const VEHICLE_PROMPT_RE = /\b(vehicle|automobile|automotive|car|sedan|hatchback|wagon|coupe|convertible|ute|pickup|suv|4wd|truck|van|dealer|dealership|oem|badge|grille|wheel|tyre|toyota|lexus|mazda|ford|mitsubishi|haval|gwm|kia|hyundai|genesis|nissan|infiniti|isuzu|honda|subaru|suzuki|volkswagen|audi|bmw|mini|mercedes|volvo|polestar|tesla|byd|chery|jeep|ram|chevrolet|porsche|land\s*rover|range\s*rover)\b/i

/** Text-generated vehicle imagery requires a separate approved-source workflow. */
export function assertNonVehicleImagePrompt(prompt: string): void {
  if (VEHICLE_PROMPT_RE.test(prompt)) {
    throw new Error('Vehicle generation is blocked; use an approved-source transform or image-to-video model')
  }
}
