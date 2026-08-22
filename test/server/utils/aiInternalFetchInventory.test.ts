import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { isAllowedGodModeAiReadBridgeRequest } from '~~/server/utils/godMode/internalExecutionDelegation'

function firstArgumentShape(call: ts.CallExpression): string {
  const argument = call.arguments[0]
  if (argument && ts.isStringLiteral(argument)) return argument.text
  if (argument && ts.isNoSubstitutionTemplateLiteral(argument)) return argument.text
  if (argument && ts.isTemplateExpression(argument)) {
    return argument.templateSpans.reduce(
      (result, span) => `${result}\${}${span.literal.text}`,
      argument.head.text
    )
  }
  return '<dynamic>'
}

describe('AI internal fetch inventory', () => {
  it('keeps every callsite explicit, context-bound, and represented by the narrow bridge policy', () => {
    const directory = join(process.cwd(), 'server/utils/ai/tools')
    const calls: string[] = []
    for (const file of readdirSync(directory).filter(name => name.endsWith('.ts'))) {
      const source = ts.createSourceFile(file, readFileSync(join(directory, file), 'utf8'), ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'aiInternalFetch') {
          expect(node.arguments.length, `${file} must pass request, options, and ToolContext`).toBe(3)
          calls.push(`${node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])
          && node.arguments[1].properties.some(property => ts.isPropertyAssignment(property)
            && property.name.getText(source) === 'method'
            && property.initializer.getText(source) === '\'POST\'')
            ? 'POST'
            : 'GET'} ${firstArgumentShape(node)}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }

    expect(calls.sort()).toEqual([
      'GET /api/agency/analytics/campaigns',
      'GET /api/agency/budget-alerts/health',
      'GET /api/agency/capacity',
      'GET /api/agency/social/inbox/analytics/overview',
      'GET /api/agency/social/inbox/conversations',
      'GET /api/agency/social/listening/mentions',
      'GET /api/agency/social/listening/overview',
      'GET /api/agency/social/news',
      'GET /api/agency/social/news/profiles/${}/context',
      'GET /api/agency/social/news/profiles/${}',
      'GET /api/agency/social/publishing/accounts',
      'GET /api/agency/social/reporting/overview',
      'GET /api/agency/social/spend/summary',
      'GET /api/crm/pipeline',
      'GET /api/crm/stages',
      'GET /api/email/campaigns',
      'GET /api/email/campaigns/${}/events',
      'GET /api/leads/list',
      'GET /api/xero/get-out/cash-position',
      'GET /api/xero/get-out/forecast',
      'GET /api/xero/get-out/pipeline-coverage',
      'GET /api/xero/invoices',
      'POST /api/agency/social/${}/sync-spend',
      'POST /api/crm/ai/draft-followup'
    ].sort())
  })

  /**
   * Every POST an AI tool makes over MCP goes through mintMcpGodModeInternalAiDelegation, which 403s
   * anything not in the bridge allowlist. The inventory above only lists callsites — it passed for
   * weeks while run_adspend_sync was deterministically refused. This pins each POST callsite to a
   * concrete example request that the allowlist MUST accept, so an unregistered write fails CI.
   */
  it('every POST callsite has a representative request the bridge allowlist accepts', () => {
    const representative: Record<string, Array<{ path: string, body: unknown }>> = {
      'POST /api/agency/social/${}/sync-spend': [
        { path: '/api/agency/social/meta/sync-spend', body: {} },
        { path: '/api/agency/social/google/sync-spend', body: {} }
      ],
      'POST /api/crm/ai/draft-followup': [
        { path: '/api/crm/ai/draft-followup', body: { client_id: '11111111-1111-4111-8111-111111111111', opportunity_id: '22222222-2222-4222-8222-222222222222' } }
      ]
    }
    const directory = join(process.cwd(), 'server/utils/ai/tools')
    const posts = new Set<string>()
    for (const file of readdirSync(directory).filter(name => name.endsWith('.ts'))) {
      const source = ts.createSourceFile(file, readFileSync(join(directory, file), 'utf8'), ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'aiInternalFetch') {
          const options = node.arguments[1]
          const isPost = !!options && ts.isObjectLiteralExpression(options) && options.properties.some(property =>
            ts.isPropertyAssignment(property) && property.name.getText(source) === 'method' && property.initializer.getText(source) === '\'POST\'')
          if (isPost) posts.add(`POST ${firstArgumentShape(node)}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    for (const shape of posts) {
      const examples = representative[shape]
      expect(examples, `${shape} is called by an AI tool but has no representative request in this test — add one and register the route in isAllowedGodModeAiReadBridgeRequest`).toBeDefined()
      for (const example of examples ?? []) {
        expect(isAllowedGodModeAiReadBridgeRequest('POST', example.path, example.body), `${shape} → ${example.path} is refused by the MCP bridge allowlist (would 403 as SYNC_START_FAILED-style at runtime)`).toBe(true)
      }
    }
  })
})
