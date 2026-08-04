export type AiChatSubmissionBody = Record<string, unknown> & {
  transportRetryToken: string
}

/** Create once immediately before the first POST; reuse the returned body for transport retries. */
export function createAiChatSubmissionBody(
  body: Record<string, unknown>,
): AiChatSubmissionBody {
  return { ...body, transportRetryToken: crypto.randomUUID() }
}

export function retryAiChatSubmissionBody(
  body: AiChatSubmissionBody,
): AiChatSubmissionBody {
  return { ...body }
}

/** Retry only a connection-level loss; HTTP responses are authoritative and never replayed here. */
export async function postAiChatSubmission<T>(
  fetcher: (request: string, options: { method: 'POST'; body: AiChatSubmissionBody }) => Promise<T>,
  request: string,
  body: AiChatSubmissionBody,
): Promise<T> {
  try {
    return await fetcher(request, { method: 'POST', body })
  } catch (error) {
    const responseError = error as { response?: unknown; status?: number; statusCode?: number }
    if (responseError?.response || responseError?.status || responseError?.statusCode) throw error
    return await fetcher(request, { method: 'POST', body })
  }
}
