// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref } from 'vue'

const testGlobals = globalThis as Record<string, unknown>
testGlobals.ref = ref
testGlobals.computed = computed
testGlobals.useAuth = () => ({
  user: ref({ id: 'member-1', name: 'Paul' })
})

const createComment = vi.fn()
const mockComments = ref<unknown[]>([])

vi.mock('~/composables/useTaskComments', () => ({
  useTaskComments: () => ({
    comments: mockComments,
    loading: ref(false),
    hasMore: ref(false),
    fetchComments: vi.fn(),
    createComment,
    editComment: vi.fn(),
    deleteComment: vi.fn(),
    toggleLike: vi.fn()
  })
}))

const { default: TaskCommentItem } = await import('~~/app/components/task/CommentItem.vue')
const { default: TaskCommentThread } = await import('~~/app/components/task/CommentThread.vue')

const comment = {
  id: 'comment-1',
  task_id: 'task-1',
  author_id: 'member-1',
  author_name: 'Paul',
  author_avatar: null,
  parent_id: null,
  content: 'Production evidence',
  is_internal: false,
  created_at: '2026-07-18T00:00:00.000Z',
  edited_at: null,
  likes_count: 1,
  user_has_liked: true,
  reply_count: 0,
  replies: [],
  mentions: []
}

const stubs = {
  UAvatar: { name: 'UAvatar', template: '<span />' },
  UIcon: { name: 'UIcon', template: '<i />' },
  UButton: {
    name: 'UButton',
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
  },
  UDropdownMenu: { name: 'UDropdownMenu', template: '<div><slot /></div>' },
  UModal: { name: 'UModal', template: '<div><slot name="content" /></div>' },
  UTextarea: { name: 'UTextarea', template: '<textarea />' },
  XfLoader: { name: 'XfLoader', template: '<span />' },
  TaskCommentInput: {
    name: 'TaskCommentInput',
    props: ['parentId'],
    emits: ['submit', 'cancel'],
    template: `<div class="comment-input" :data-parent-id="parentId || ''">
      <button type="button" class="submit-reply" @click="$emit('submit', 'A useful reply', true)">Submit</button>
    </div>`
  }
}

function registerStubs(app: ReturnType<typeof createApp>) {
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
}

describe('task comment replies', () => {
  it('opens the nested editor and emits the submitted reply content', async () => {
    const replies: unknown[][] = []
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(TaskCommentItem, {
        comment,
        onReply: (...args: unknown[]) => replies.push(args)
      })
    })
    registerStubs(app)
    app.mount(host)

    try {
      const replyButton = [...host.querySelectorAll('button')]
        .find(button => button.textContent?.trim() === 'Reply') as HTMLButtonElement
      replyButton.click()
      await nextTick()

      const editor = host.querySelector('[data-parent-id="comment-1"]') as HTMLElement
      expect(editor).toBeTruthy()

      ;(editor.querySelector('.submit-reply') as HTMLButtonElement).click()
      await nextTick()

      expect(replies).toEqual([[comment, 'A useful reply', true]])
      expect(host.querySelector('[data-parent-id="comment-1"]')).toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('persists a reply with the parent comment id', async () => {
    createComment.mockReset().mockResolvedValue(undefined)
    mockComments.value = [comment]
    const host = document.createElement('div')
    const app = createApp({ render: () => h(TaskCommentThread, { taskId: 'task-1' }) })
    app.component('TaskCommentInput', stubs.TaskCommentInput)
    app.component('TaskCommentItem', {
      name: 'TaskCommentItem',
      emits: ['reply'],
      setup(_props, { emit }) {
        return () => h('button', {
          class: 'emit-reply',
          onClick: () => emit('reply', comment, 'Thread reply', false)
        }, 'Emit reply')
      }
    })
    app.component('XfLoader', stubs.XfLoader)
    app.mount(host)

    try {
      ;(host.querySelector('.emit-reply') as HTMLButtonElement).click()
      await nextTick()

      expect(createComment).toHaveBeenCalledWith({
        content: 'Thread reply',
        isInternal: false,
        parentId: 'comment-1'
      })
    } finally {
      app.unmount()
    }
  })
})
