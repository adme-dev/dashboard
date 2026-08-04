import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockResolveAiModelAssignment = vi.fn()
const mockRecordAiInvocation = vi.fn()

vi.mock('~~/server/utils/ai/modelAssignments', () => ({
  resolveAiModelAssignment: (...args: unknown[]) => mockResolveAiModelAssignment(...args)
}))

vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args)
}))

const {
  BOARD_KNOWLEDGE_AI_INLINE_BATCH_LIMIT_BYTES,
  extractDocumentWithAi
} = await import('~~/server/utils/boardKnowledge/extractAi')

const gatewayEnv = {
  AI_GATEWAY_URL: 'https://gateway.ai.cloudflare.com/v1/account/xeroflow/groq',
  AI_GATEWAY_AUTH_TOKEN: 'gateway-secret',
  GOOGLE_AI_STUDIO_API_KEY: 'paid-google-key',
  GOOGLE_AI_STUDIO_PAID: 'true'
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    featureKey: 'board_knowledge_document_extraction',
    provider: 'aigateway',
    modelId: 'google-ai-studio/gemini-3.6-flash',
    fallbackModelId: 'google-ai-studio/gemini-3.5-flash-lite',
    source: 'default',
    ignoredReason: null,
    modelSpec: 'google-ai-studio/gemini-3.6-flash',
    fallbackModelSpec: 'google-ai-studio/gemini-3.5-flash-lite',
    ...overrides
  }
}

function googleResponse(payload: unknown, usage = { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 }) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    usageMetadata: usage
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const validExtraction = {
  blocks: [{ kind: 'heading', content: 'Cash-flow policy', pageStart: 1, pageEnd: 1 }],
  warnings: ['SCAN_OCR_USED'],
  confidence: 0.96
}

describe('board knowledge AI document extraction', () => {
  beforeEach(() => {
    mockResolveAiModelAssignment.mockReset()
    mockRecordAiInvocation.mockReset()
    mockResolveAiModelAssignment.mockResolvedValue(assignment())
    mockRecordAiInvocation.mockResolvedValue(undefined)
  })

  it('calls paid Google through the Cloudflare Gateway with privacy headers and safe telemetry', async () => {
    const fetcher = vi.fn().mockResolvedValue(googleResponse(validExtraction))

    const result = await extractDocumentWithAi({
      submissionId: 'submission-1',
      documentClass: 'scanned_pdf',
      batchNumber: 2,
      bytes: new TextEncoder().encode('synthetic scan bytes'),
      mimeType: 'application/pdf',
      env: gatewayEnv,
      fetcher
    })

    expect(mockResolveAiModelAssignment).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(
      'https://gateway.ai.cloudflare.com/v1/account/xeroflow/google-ai-studio/v1/models/gemini-3.6-flash:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'cf-aig-authorization': 'Bearer gateway-secret',
          'cf-aig-collect-log-payload': 'false',
          'cf-aig-skip-cache': 'true',
          'x-goog-api-key': 'paid-google-key'
        })
      })
    )
    expect(result).toMatchObject({
      method: 'gemini',
      provider: 'google-ai-studio',
      model: 'google-ai-studio/gemini-3.6-flash',
      blocks: validExtraction.blocks,
      warnings: validExtraction.warnings,
      confidence: 0.96
    })
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'board_knowledge_document_extraction',
      gatewayUsed: true,
      fallbackUsed: false,
      status: 'success',
      metadata: {
        submissionId: 'submission-1',
        documentClass: 'scanned_pdf',
        batchNumber: 2
      }
    }))
    const telemetry = JSON.stringify(mockRecordAiInvocation.mock.calls)
    expect(telemetry).not.toContain('Cash-flow policy')
    expect(telemetry).not.toContain('synthetic scan bytes')
    expect(telemetry).not.toContain('filename')
  })

  it('retries an operational primary failure with the configured fallback through Gateway only', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(googleResponse(validExtraction))

    const result = await extractDocumentWithAi({
      submissionId: 'submission-2',
      documentClass: 'pdf_layout_recovery',
      batchNumber: 1,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'application/pdf',
      env: gatewayEnv,
      fetcher
    })

    expect(result.model).toBe('google-ai-studio/gemini-3.5-flash-lite')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('/google-ai-studio/v1/models/gemini-3.6-flash:generateContent'),
      expect.stringContaining('/google-ai-studio/v1/models/gemini-3.5-flash-lite:generateContent')
    ])
    expect(fetcher.mock.calls.every(call => String(call[0]).startsWith('https://gateway.ai.cloudflare.com/'))).toBe(true)
    expect(mockRecordAiInvocation).toHaveBeenLastCalledWith(expect.objectContaining({
      fallbackUsed: true,
      status: 'success'
    }))
  })

  it('fails closed on malformed structured output without trying another model or direct provider', async () => {
    const fetcher = vi.fn().mockResolvedValue(googleResponse({ blocks: [{ kind: 'unknown', content: '' }] }))

    await expect(extractDocumentWithAi({
      submissionId: 'submission-3',
      documentClass: 'scanned_pdf',
      batchNumber: 1,
      bytes: new Uint8Array([1]),
      mimeType: 'application/pdf',
      env: gatewayEnv,
      fetcher
    })).rejects.toThrow('ai_document_response_invalid')

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      errorCode: 'ai_document_response_invalid'
    }))
  })

  it('rejects aggregate AI output beyond the bounded document text limit', async () => {
    const fetcher = vi.fn().mockResolvedValue(googleResponse({
      blocks: Array.from({ length: 9 }, () => ({ kind: 'text', content: 'x'.repeat(250_000) })),
      warnings: [],
      confidence: 0.8
    }))

    await expect(extractDocumentWithAi({
      submissionId: 'submission-large-output',
      documentClass: 'scanned_pdf',
      batchNumber: 1,
      bytes: new Uint8Array([1]),
      mimeType: 'application/pdf',
      env: gatewayEnv,
      fetcher
    })).rejects.toThrow('ai_document_response_invalid')

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects batches larger than 15 MB before resolving a model or making a request', async () => {
    const fetcher = vi.fn()

    await expect(extractDocumentWithAi({
      submissionId: 'submission-4',
      documentClass: 'scanned_pdf',
      batchNumber: 1,
      bytes: new Uint8Array(BOARD_KNOWLEDGE_AI_INLINE_BATCH_LIMIT_BYTES + 1),
      mimeType: 'application/pdf',
      env: gatewayEnv,
      fetcher
    })).rejects.toThrow('ai_document_inline_batch_too_large')

    expect(mockResolveAiModelAssignment).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('requires explicitly paid Google credentials and never bypasses Gateway', async () => {
    const fetcher = vi.fn()

    await expect(extractDocumentWithAi({
      submissionId: 'submission-5',
      documentClass: 'scanned_pdf',
      batchNumber: 1,
      bytes: new Uint8Array([1]),
      mimeType: 'application/pdf',
      env: { ...gatewayEnv, GOOGLE_AI_STUDIO_PAID: 'false' },
      fetcher
    })).rejects.toThrow('paid_google_ai_studio_not_configured')

    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps the Hugging Face seam disabled until the curated model is production-ready', async () => {
    mockResolveAiModelAssignment.mockResolvedValue(assignment({
      modelId: 'huggingface/PaddlePaddle/PaddleOCR-VL-1.6',
      fallbackModelId: null,
      modelSpec: 'huggingface/PaddlePaddle/PaddleOCR-VL-1.6',
      fallbackModelSpec: null
    }))
    const fetcher = vi.fn()

    await expect(extractDocumentWithAi({
      submissionId: 'submission-6',
      documentClass: 'scanned_pdf',
      batchNumber: 1,
      bytes: new Uint8Array([1]),
      mimeType: 'application/pdf',
      env: {
        ...gatewayEnv,
        HUGGINGFACE_API_TOKEN: 'paid-hf-token',
        HUGGINGFACE_BOARD_KNOWLEDGE_PRODUCTION_READY: 'true'
      },
      fetcher
    })).rejects.toThrow('model_endpoint_unverified')

    expect(fetcher).not.toHaveBeenCalled()
  })
})
