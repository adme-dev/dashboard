/**
 * Persona-readiness: a persona is configuration over the SAME loop, not a separate engine.
 * It (a) prepends an instruction preamble and (b) optionally narrows the toolset (intersected
 * with RBAC — persona narrows, RBAC still governs). Slice 1 ships one generalist; named
 * personas (Finance/Marketing/Sales/Account) are slice-1.5 config — zero engine rework.
 */
export interface Persona {
  key: string
  label: string
  instructionsPreamble: string
  /** When set, the loop intersects this allowlist with the RBAC-filtered tools. */
  toolAllowlist?: string[]
}

export const PERSONAS: Record<string, Persona> = {
  general: { key: 'general', label: 'Agency Assistant', instructionsPreamble: '' },
}

export const DEFAULT_PERSONA = PERSONAS.general!
