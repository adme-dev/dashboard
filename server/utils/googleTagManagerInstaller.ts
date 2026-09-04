import { createError, getRequestURL, type H3Event } from 'h3'
import { execute, queryOne, queryRows } from '~~/server/utils/db'
import {
  buildXeroFlowGtmEntities,
  createGtmTag,
  createGtmTrigger,
  createGtmVersion,
  createGtmWorkspace,
  getGtmWorkspaceStatus,
  getLiveGtmVersion,
  publishGtmVersion,
  quickPreviewGtmWorkspace,
  versionHasXeroFlowTag,
  type GtmContainer,
  type GtmContainerVersion,
} from '~~/server/utils/googleTagManagerClient'
import { reserveGtmApiQuota, resolveGtmAccessToken } from '~~/server/utils/googleTagManagerStore'

interface GtmSiteBindingRow {
  binding_id: string
  tracking_site_id: string
  connection_id: string
  account_path: string
  account_name: string
  container_path: string
  container_public_id: string
  container_name: string
  domain_names: string[]
  last_live_version_path: string | null
  last_verified_at: string | null
  site_name: string
  write_key: string
  spa: boolean
}

export interface GtmSiteBindingSummary {
  id: string
  connectionId: string
  accountPath: string
  accountName: string
  containerPath: string
  containerPublicId: string
  containerName: string
  domainNames: string[]
  lastLiveVersionPath: string | null
  lastVerifiedAt: string | null
}

async function loadBindingForSite(siteId: string): Promise<GtmSiteBindingRow | null> {
  return queryOne<GtmSiteBindingRow>(
    `SELECT gb.id AS binding_id,
            gb.tracking_site_id,
            gb.connection_id,
            gb.account_path,
            gb.account_name,
            gb.container_path,
            gb.container_public_id,
            gb.container_name,
            gb.domain_names,
            gb.last_live_version_path,
            gb.last_verified_at,
            ts.name AS site_name,
            ts.write_key,
            ts.spa
       FROM gtm_container_bindings gb
       JOIN tracking_sites ts ON ts.id = gb.tracking_site_id
      WHERE gb.tracking_site_id = $1`,
    [siteId],
  )
}

function toBindingSummary(row: GtmSiteBindingRow): GtmSiteBindingSummary {
  return {
    id: row.binding_id,
    connectionId: row.connection_id,
    accountPath: row.account_path,
    accountName: row.account_name,
    containerPath: row.container_path,
    containerPublicId: row.container_public_id,
    containerName: row.container_name,
    domainNames: row.domain_names || [],
    lastLiveVersionPath: row.last_live_version_path,
    lastVerifiedAt: row.last_verified_at,
  }
}

export async function upsertGtmContainerBinding(input: {
  siteId: string
  userId: string
  connectionId: string
  account: { path: string, name: string }
  container: GtmContainer
}): Promise<GtmSiteBindingSummary> {
  if (!/^accounts\/\d+$/.test(input.account.path)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid GTM account path' })
  }
  if (!/^accounts\/\d+\/containers\/\d+$/.test(input.container.path)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid GTM container path' })
  }
  if (!/^GTM-[A-Z0-9]+$/.test(input.container.publicId || '')) {
    throw createError({ statusCode: 400, statusMessage: 'Only web GTM containers are supported' })
  }
  const usage = input.container.usageContext || []
  if (usage.length && !usage.includes('web')) {
    throw createError({ statusCode: 400, statusMessage: 'The selected GTM container is not a web container' })
  }

  const row = await queryOne<GtmSiteBindingRow>(
    `INSERT INTO gtm_container_bindings (
       tracking_site_id, connection_id,
       account_path, account_name,
       container_path, container_public_id, container_name, domain_names,
       bound_by
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (tracking_site_id)
     DO UPDATE SET
       connection_id = EXCLUDED.connection_id,
       account_path = EXCLUDED.account_path,
       account_name = EXCLUDED.account_name,
       container_path = EXCLUDED.container_path,
       container_public_id = EXCLUDED.container_public_id,
       container_name = EXCLUDED.container_name,
       domain_names = EXCLUDED.domain_names,
       last_live_version_path = NULL,
       last_verified_at = NULL,
       bound_by = EXCLUDED.bound_by,
       updated_at = NOW()
     RETURNING id AS binding_id,
               tracking_site_id,
               connection_id,
               account_path,
               account_name,
               container_path,
               container_public_id,
               container_name,
               domain_names,
               last_live_version_path,
               last_verified_at,
               ''::text AS site_name,
               ''::text AS write_key,
               FALSE AS spa`,
    [
      input.siteId,
      input.connectionId,
      input.account.path,
      input.account.name,
      input.container.path,
      input.container.publicId,
      input.container.name,
      input.container.domainName || [],
      input.userId,
    ],
  )
  if (!row) throw new Error('Unable to bind Google Tag Manager container')
  return toBindingSummary(row)
}

function compactVersion(version: GtmContainerVersion | null | undefined) {
  if (!version) return null
  return {
    path: version.path,
    name: version.name || null,
    fingerprint: version.fingerprint || null,
    tagCount: version.tag?.length || 0,
    triggerCount: version.trigger?.length || 0,
  }
}

function buildSnippet(event: H3Event, binding: GtmSiteBindingRow): string {
  const origin = getRequestURL(event).origin
  const spa = binding.spa ? ' data-spa="true"' : ''
  return `<script src="${origin}/track.js" data-key="${binding.write_key}"${spa} async></script>`
}

function errorCode(error: unknown): string {
  const raw = error as { code?: string, statusCode?: number }
  if (raw.code) return raw.code
  if (raw.statusCode === 429) return 'gtm_quota_exceeded'
  return 'gtm_install_failed'
}

async function failChangeSet(changeSetId: string, error: unknown): Promise<void> {
  const message = String((error as Error)?.message || error || 'Google Tag Manager operation failed').slice(0, 1000)
  const code = errorCode(error)
  const status = code === 'gtm_conflict' ? 'conflict' : 'failed'
  await execute(
    `UPDATE gtm_change_sets
        SET status = $2,
            error_code = $3,
            error_message = $4,
            executed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [changeSetId, status, code, message],
  ).catch(() => {})
}

export async function getGtmSiteStatus(event: H3Event, siteId: string): Promise<{
  binding: GtmSiteBindingSummary | null
  googleEmail?: string
  liveVersion?: ReturnType<typeof compactVersion>
  installed?: boolean
  marker?: string
  changes: unknown[]
}> {
  const binding = await loadBindingForSite(siteId)
  const changes = binding
    ? await queryRows(
        `SELECT id, action_type, status, requested_at, approved_at, executed_at,
                workspace_path, created_version_path, previous_live_version_path,
                error_code, error_message
           FROM gtm_change_sets
          WHERE binding_id = $1
          ORDER BY created_at DESC
          LIMIT 10`,
        [binding.binding_id],
      )
    : []
  if (!binding) return { binding: null, changes }

  const credential = await resolveGtmAccessToken(event, binding.connection_id)
  await reserveGtmApiQuota(1)
  const live = await getLiveGtmVersion(credential.token, binding.container_path)
  const marker = `xeroflow:tracking-site:${siteId}:v1`
  const installed = versionHasXeroFlowTag(live, marker, binding.write_key)
  if (installed) {
    await execute(
      `UPDATE gtm_container_bindings
          SET last_live_version_path = $2,
              last_verified_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [binding.binding_id, live.path],
    )
  }
  return {
    binding: toBindingSummary(binding),
    googleEmail: credential.googleEmail,
    liveVersion: compactVersion(live),
    installed,
    marker,
    changes,
  }
}

export async function installXeroFlowViaGtm(event: H3Event, input: {
  siteId: string
  userId: string
  publish: boolean
}): Promise<Record<string, unknown>> {
  const binding = await loadBindingForSite(input.siteId)
  if (!binding) throw createError({ statusCode: 404, statusMessage: 'Bind a GTM container to this tracking site first' })

  const credential = await resolveGtmAccessToken(event, binding.connection_id)
  const entities = buildXeroFlowGtmEntities({
    siteId: input.siteId,
    siteName: binding.site_name,
    snippet: buildSnippet(event, binding),
  })

  await reserveGtmApiQuota(1)
  const liveBefore = await getLiveGtmVersion(credential.token, binding.container_path)
  if (versionHasXeroFlowTag(liveBefore, entities.marker, binding.write_key)) {
    await execute(
      `UPDATE gtm_container_bindings
          SET last_live_version_path = $2,
              last_verified_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [binding.binding_id, liveBefore.path],
    )
    return {
      ok: true,
      status: 'already_installed',
      installed: true,
      liveVersion: compactVersion(liveBefore),
    }
  }

  let changeSet: { id: string } | null = null
  try {
    changeSet = await queryOne<{ id: string }>(
      `INSERT INTO gtm_change_sets (
         binding_id, action_type, status,
         requested_by, approved_by, executed_by,
         approved_at, desired_state, observed_before,
         previous_live_version_path, previous_live_version_fingerprint
       )
       VALUES ($1,'install_xeroflow','executing',$2,$2,$2,NOW(),$3,$4,$5,$6)
       RETURNING id`,
      [
        binding.binding_id,
        input.userId,
        JSON.stringify({ marker: entities.marker, tag: entities.tag, trigger: entities.trigger, publish: input.publish }),
        JSON.stringify({ liveVersion: compactVersion(liveBefore) }),
        liveBefore.path,
        liveBefore.fingerprint || null,
      ],
    )
  } catch (error: any) {
    if (error?.code === '23505' || String(error?.message || '').includes('idx_gtm_change_sets_active_install')) {
      const active = await queryOne(
        `SELECT id, status, workspace_path, created_version_path
           FROM gtm_change_sets
          WHERE binding_id = $1
            AND action_type = 'install_xeroflow'
            AND status IN ('planned','executing','drafted','versioned')
          ORDER BY created_at DESC LIMIT 1`,
        [binding.binding_id],
      )
      return { ok: true, status: 'already_in_progress', changeSet: active }
    }
    throw error
  }
  if (!changeSet) throw new Error('Unable to create GTM change set')

  // Remaining calls: workspace, trigger, tag, status, quick preview, version,
  // and optionally publish + live read-back.
  await reserveGtmApiQuota(input.publish ? 8 : 6)

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const workspace = await createGtmWorkspace(credential.token, binding.container_path, {
      name: `XeroFlow - ${binding.site_name} - ${stamp}`.slice(0, 200),
      description: `Managed by XeroFlow. ${entities.marker}`,
    })
    await execute(
      `UPDATE gtm_change_sets SET workspace_path = $2, updated_at = NOW() WHERE id = $1`,
      [changeSet.id, workspace.path],
    )

    const trigger = await createGtmTrigger(credential.token, workspace.path, entities.trigger)
    if (!trigger.triggerId) throw new Error('Google Tag Manager did not return a trigger ID')
    const tag = await createGtmTag(credential.token, workspace.path, {
      ...entities.tag,
      firingTriggerId: [trigger.triggerId],
    })

    const workspaceStatus = await getGtmWorkspaceStatus(credential.token, workspace.path)
    if ((workspaceStatus.mergeConflict || []).length) {
      const conflict = new Error('The XeroFlow workspace conflicts with newer GTM changes') as Error & { code?: string }
      conflict.code = 'gtm_conflict'
      throw conflict
    }

    const preview = await quickPreviewGtmWorkspace(credential.token, workspace.path)
    if (preview.compilerError || preview.syncStatus?.mergeConflict || preview.syncStatus?.syncError) {
      const conflict = new Error('Google Tag Manager preview reported a compiler or synchronization error') as Error & { code?: string }
      conflict.code = preview.compilerError ? 'gtm_compiler_error' : 'gtm_conflict'
      throw conflict
    }

    const version = await createGtmVersion(credential.token, workspace.path, {
      name: `XeroFlow - ${binding.site_name} - tracking install`.slice(0, 200),
      notes: `Installed XeroFlow first-party tracking. ${entities.marker}`,
    })
    if (version.compilerError || !version.containerVersion?.path) {
      const compiler = new Error('Google Tag Manager could not create a valid container version') as Error & { code?: string }
      compiler.code = 'gtm_compiler_error'
      throw compiler
    }
    const created = version.containerVersion
    await execute(
      `UPDATE gtm_change_sets
          SET status = 'versioned',
              created_version_path = $2,
              created_version_fingerprint = $3,
              observed_after = $4,
              updated_at = NOW()
        WHERE id = $1`,
      [changeSet.id, created.path, created.fingerprint || null, JSON.stringify({ tag, trigger, preview: compactVersion(preview.containerVersion) })],
    )

    if (!input.publish) {
      return {
        ok: true,
        status: 'versioned',
        changeSetId: changeSet.id,
        version: compactVersion(created),
      }
    }

    const published = await publishGtmVersion(credential.token, created.path, created.fingerprint)
    if (published.compilerError) {
      const compiler = new Error('Google Tag Manager refused to publish because of a compiler error') as Error & { code?: string }
      compiler.code = 'gtm_compiler_error'
      throw compiler
    }
    await execute(
      `UPDATE gtm_change_sets SET status = 'published', updated_at = NOW() WHERE id = $1`,
      [changeSet.id],
    )

    const liveAfter = await getLiveGtmVersion(credential.token, binding.container_path)
    const verified = versionHasXeroFlowTag(liveAfter, entities.marker, binding.write_key)
    await execute(
      `UPDATE gtm_change_sets
          SET status = $2,
              executed_at = NOW(),
              observed_after = COALESCE(observed_after, '{}'::jsonb) || $3::jsonb,
              error_code = $4,
              error_message = $5,
              updated_at = NOW()
        WHERE id = $1`,
      [
        changeSet.id,
        verified ? 'verified' : 'failed',
        JSON.stringify({ liveVersion: compactVersion(liveAfter), markerPresent: verified }),
        verified ? null : 'gtm_readback_mismatch',
        verified ? null : 'Published version did not contain the expected XeroFlow tag',
      ],
    )
    if (verified) {
      await execute(
        `UPDATE gtm_container_bindings
            SET last_live_version_path = $2,
                last_verified_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [binding.binding_id, liveAfter.path],
      )
    }
    return {
      ok: verified,
      status: verified ? 'verified' : 'failed',
      changeSetId: changeSet.id,
      installed: verified,
      liveVersion: compactVersion(liveAfter),
    }
  } catch (error) {
    await failChangeSet(changeSet.id, error)
    throw error
  }
}

export async function publishGtmChangeSet(event: H3Event, input: {
  siteId: string
  changeSetId: string
  userId: string
}): Promise<Record<string, unknown>> {
  const binding = await loadBindingForSite(input.siteId)
  if (!binding) throw createError({ statusCode: 404, statusMessage: 'GTM binding not found' })
  const change = await queryOne<{
    id: string
    created_version_path: string
    created_version_fingerprint: string | null
  }>(
    `UPDATE gtm_change_sets
        SET status = 'executing',
            approved_by = $3,
            executed_by = $3,
            approved_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
        AND binding_id = $2
        AND status = 'versioned'
      RETURNING id, created_version_path, created_version_fingerprint`,
    [input.changeSetId, binding.binding_id, input.userId],
  )
  if (!change) throw createError({ statusCode: 409, statusMessage: 'This GTM change set is not ready to publish' })

  const credential = await resolveGtmAccessToken(event, binding.connection_id)
  await reserveGtmApiQuota(2)
  try {
    const response = await publishGtmVersion(
      credential.token,
      change.created_version_path,
      change.created_version_fingerprint || undefined,
    )
    if (response.compilerError) throw new Error('Google Tag Manager reported a compiler error while publishing')
    const live = await getLiveGtmVersion(credential.token, binding.container_path)
    const marker = `xeroflow:tracking-site:${input.siteId}:v1`
    const verified = versionHasXeroFlowTag(live, marker, binding.write_key)
    await execute(
      `UPDATE gtm_change_sets
          SET status = $2, executed_at = NOW(), observed_after = $3,
              error_code = $4, error_message = $5, updated_at = NOW()
        WHERE id = $1`,
      [
        change.id,
        verified ? 'verified' : 'failed',
        JSON.stringify({ liveVersion: compactVersion(live), markerPresent: verified }),
        verified ? null : 'gtm_readback_mismatch',
        verified ? null : 'Published version did not contain the expected XeroFlow tag',
      ],
    )
    if (verified) {
      await execute(
        `UPDATE gtm_container_bindings
            SET last_live_version_path = $2, last_verified_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [binding.binding_id, live.path],
      )
    }
    return { ok: verified, status: verified ? 'verified' : 'failed', liveVersion: compactVersion(live) }
  } catch (error) {
    await failChangeSet(change.id, error)
    throw error
  }
}

export async function rollbackGtmChangeSet(event: H3Event, input: {
  siteId: string
  changeSetId: string
  userId: string
}): Promise<Record<string, unknown>> {
  const binding = await loadBindingForSite(input.siteId)
  if (!binding) throw createError({ statusCode: 404, statusMessage: 'GTM binding not found' })
  const source = await queryOne<{
    previous_live_version_path: string | null
    previous_live_version_fingerprint: string | null
  }>(
    `SELECT previous_live_version_path, previous_live_version_fingerprint
       FROM gtm_change_sets
      WHERE id = $1 AND binding_id = $2 AND status IN ('published','verified','failed')`,
    [input.changeSetId, binding.binding_id],
  )
  if (!source?.previous_live_version_path) {
    throw createError({ statusCode: 409, statusMessage: 'No previous GTM version is available for rollback' })
  }
  const rollback = await queryOne<{ id: string }>(
    `INSERT INTO gtm_change_sets (
       binding_id, action_type, status, requested_by, approved_by, executed_by,
       approved_at, desired_state, previous_live_version_path, previous_live_version_fingerprint
     )
     VALUES ($1,'rollback','executing',$2,$2,$2,NOW(),$3,$4,$5)
     RETURNING id`,
    [
      binding.binding_id,
      input.userId,
      JSON.stringify({ rollbackOf: input.changeSetId, targetVersionPath: source.previous_live_version_path }),
      binding.last_live_version_path,
      null,
    ],
  )
  if (!rollback) throw new Error('Unable to create GTM rollback record')

  const credential = await resolveGtmAccessToken(event, binding.connection_id)
  await reserveGtmApiQuota(2)
  try {
    const published = await publishGtmVersion(
      credential.token,
      source.previous_live_version_path,
      source.previous_live_version_fingerprint || undefined,
    )
    if (published.compilerError) throw new Error('Google Tag Manager reported a compiler error during rollback')
    const live = await getLiveGtmVersion(credential.token, binding.container_path)
    const restored = live.path === source.previous_live_version_path
    await execute(
      `UPDATE gtm_change_sets
          SET status = $2, executed_at = NOW(), observed_after = $3,
              error_code = $4, error_message = $5, updated_at = NOW()
        WHERE id = $1`,
      [
        rollback.id,
        restored ? 'rolled_back' : 'failed',
        JSON.stringify({ liveVersion: compactVersion(live) }),
        restored ? null : 'gtm_rollback_readback_mismatch',
        restored ? null : 'Google Tag Manager live version did not match the rollback target',
      ],
    )
    if (restored) {
      await execute(
        `UPDATE gtm_container_bindings
            SET last_live_version_path = $2, last_verified_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [binding.binding_id, live.path],
      )
    }
    return { ok: restored, status: restored ? 'rolled_back' : 'failed', liveVersion: compactVersion(live) }
  } catch (error) {
    await failChangeSet(rollback.id, error)
    throw error
  }
}
