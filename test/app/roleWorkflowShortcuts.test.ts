// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { computed, nextTick, ref } from 'vue'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { vueScriptDeclarations } from '../helpers/vueScriptDeclarations'

const chat = readFileSync('app/pages/agency/ai/chat.vue', 'utf8')
function declarations(names: string[], scope: Record<string, unknown>) {
  const code = ts.transpileModule(vueScriptDeclarations(chat, names), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  return new Function(...Object.keys(scope), `${code};return {${names.join(',')}}`)(...Object.values(scope))
}
const workflow = { key: 'budget-review', versionId: 'version-2', label: 'Review budgets', group: 'Marketing', prompt: 'Review [client] budget.', persona: 'marketing' }

describe('role workflow chat menu', () => {
  it('groups only server-listed workflows and includes the skill library link', () => {
    const select = vi.fn()
    const state = declarations(['workflowItems'], { computed, workflows: ref([workflow]), workflowError: ref(''), chooseWorkflow: select })
    expect(state.workflowItems.value[0][0]).toEqual({ type: 'label', label: 'Marketing' })
    expect(state.workflowItems.value[0][1].label).toBe('Review budgets')
    state.workflowItems.value[0][1].onSelect()
    expect(select).toHaveBeenCalledWith(workflow)
    expect(state.workflowItems.value.at(-1)[0].to).toBe('/agency/ai/skills')
  })

  it('offers an honest empty state instead of unrelated unpermitted suggestions', () => {
    const state = declarations(['workflowItems'], { computed, workflows: ref([]), workflowError: ref(''), chooseWorkflow: vi.fn() })
    expect(state.workflowItems.value[0]).toEqual([{ label: 'No workflows available for your role', disabled: true }])
    expect(chat).not.toContain('messageInput = \'How is our ad spend looking this month?\'')
  })

  it('prepares editable request text, focuses the textarea, and waits for explicit send', async () => {
    const selected = ref<unknown>(null)
    const messageInput = ref('')
    const focus = vi.fn()
    const mentionedEntities = ref([{ id: 'old-client' }])
    const closeMentionDropdown = vi.fn()
    const send = vi.fn()
    const state = declarations(['chooseWorkflow'], {
      selectedWorkflow: selected, messageInput, mentionedEntities, closeMentionDropdown, nextTick, inputRef: ref({ focus }),
      selectWorkflow: (value: unknown) => { selected.value = value }, handleSend: send
    })
    state.chooseWorkflow(workflow)
    await nextTick()
    expect(messageInput.value).toBe(workflow.prompt)
    expect(focus).toHaveBeenCalledOnce()
    expect(mentionedEntities.value).toEqual([])
    expect(closeMentionDropdown).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
    messageInput.value = 'Review the real client budget.'
    expect(selected.value).toEqual(workflow)
  })
})
