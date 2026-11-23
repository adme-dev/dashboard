/** Internal viewer rechecks the signed-in viewer's access on every load. */
export function bannerTeamReviewUrl(projectId: string): string {
  return 'https://app.xeroflow.io/creative/banner-studio/view/' + encodeURIComponent(projectId)
}
