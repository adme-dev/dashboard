<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useAuth } from '~/composables/useAuth'

const props = defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()
const appConfig = useAppConfig()
const { user, logout, isAuthenticated } = useAuth()

// Fetch user on mount
onMounted(() => {
  useAuth().fetchUser()
})

const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const neutrals = ['slate', 'gray', 'zinc', 'neutral', 'stone']

const items = computed<DropdownMenuItem[][]>(() => {
  const userItems: DropdownMenuItem[] = []
  
  // Only show user info if authenticated
  if (isAuthenticated.value && user.value) {
    userItems.push({
      type: 'label',
      label: user.value.name,
      avatar: user.value.avatar_url ? { src: user.value.avatar_url } : { alt: user.value.name }
    })
  }
  
  return [[
    ...userItems
  ], [{
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/settings/profile'
  }, {
    label: 'Settings',
    icon: 'i-lucide-settings',
    to: '/settings'
  }], [{
    label: 'Theme',
    icon: 'i-lucide-palette',
    children: [{
      label: 'Primary',
      slot: 'chip',
      chip: appConfig.ui.colors.primary,
      content: {
        align: 'center',
        collisionPadding: 16
      },
      children: colors.map(color => ({
        label: color,
        chip: color,
        slot: 'chip',
        checked: appConfig.ui.colors.primary === color,
        type: 'checkbox',
        onSelect: (e) => {
          e.preventDefault()
          appConfig.ui.colors.primary = color
        }
      }))
    }, {
      label: 'Neutral',
      slot: 'chip',
      chip: appConfig.ui.colors.neutral === 'neutral' ? 'old-neutral' : appConfig.ui.colors.neutral,
      content: {
        align: 'end',
        collisionPadding: 16
      },
      children: neutrals.map(color => ({
        label: color,
        chip: color === 'neutral' ? 'old-neutral' : color,
        slot: 'chip',
        type: 'checkbox',
        checked: appConfig.ui.colors.neutral === color,
        onSelect: (e) => {
          e.preventDefault()
          appConfig.ui.colors.neutral = color
        }
      }))
    }]
  }, {
    label: 'Appearance',
    icon: 'i-lucide-sun-moon',
    children: [{
      label: 'Light',
      icon: 'i-lucide-sun',
      type: 'checkbox',
      checked: colorMode.preference === 'light',
      onSelect(e: Event) {
        e.preventDefault()
        colorMode.preference = 'light'
      }
    }, {
      label: 'Dark',
      icon: 'i-lucide-moon',
      type: 'checkbox',
      checked: colorMode.preference === 'dark',
      onSelect(e: Event) {
        e.preventDefault()
        colorMode.preference = 'dark'
      }
    }, {
      label: 'System',
      icon: 'i-lucide-monitor',
      type: 'checkbox',
      checked: colorMode.preference === 'system',
      onSelect(e: Event) {
        e.preventDefault()
        colorMode.preference = 'system'
      }
    }]
  }], [{
    label: 'Log out',
    icon: 'i-lucide-log-out',
    onSelect: () => logout()
  }]]
})

// Button display computed
const buttonProps = computed(() => {
  if (isAuthenticated.value && user.value) {
    return {
      label: props.collapsed ? undefined : user.value.name,
      avatar: user.value.avatar_url ? { src: user.value.avatar_url } : { alt: user.value.name }
    }
  }
  
  return {
    label: props.collapsed ? undefined : 'Guest',
    icon: 'i-lucide-user'
  }
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: props.collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="buttonProps"
      color="neutral"
      variant="ghost"
      block
      :square="props.collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />

    <template #chip-leading="{ item }">
      <span
        :style="{
          '--chip-light': `var(--color-${(item as any).chip}-500)`,
          '--chip-dark': `var(--color-${(item as any).chip}-400)`
        }"
        class="ms-0.5 size-2 rounded-full bg-(--chip-light) dark:bg-(--chip-dark)"
      />
    </template>
  </UDropdownMenu>
</template>
