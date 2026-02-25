<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const toast = useToast()

const open = ref(false)

const links = [[{
  label: 'Home',
  icon: 'i-lucide-house',
  to: '/',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Dashboard',
  icon: 'i-lucide-layout-dashboard',
  to: '/dashboard',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Inbox',
  icon: 'i-lucide-inbox',
  to: '/inbox',
  badge: '4',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Customers',
  icon: 'i-lucide-users',
  to: '/customers',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Reports',
  icon: 'i-lucide-file-text',
  to: '/reports',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Profit & Loss',
  icon: 'i-lucide-pie-chart',
  to: '/profit-loss',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Invoices',
  icon: 'i-lucide-receipt',
  to: '/invoices',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Expenses',
  icon: 'i-lucide-wallet',
  to: '/expenses',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Cash Flow',
  icon: 'i-lucide-trending-up',
  to: '/cashflow',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Insights',
  icon: 'i-lucide-lightbulb',
  to: '/insights',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Anomalies',
  icon: 'i-lucide-alert-triangle',
  to: '/anomalies',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Recommendations',
  icon: 'i-lucide-clipboard-check',
  to: '/recommendations',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Chat',
  icon: 'i-lucide-message-circle',
  to: '/chat',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Agency',
  icon: 'i-lucide-briefcase',
  to: '/agency',
  type: 'trigger',
  children: [{
    label: 'Overview',
    to: '/agency',
    exact: true,
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Projects',
    to: '/agency/projects',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Briefs',
    to: '/agency/briefs',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Clients',
    to: '/agency/clients',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Sales & Pricing',
    to: '/agency/sales',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Time Tracking',
    to: '/agency/time',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Profitability',
    to: '/agency/profitability',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Invoices',
    to: '/agency/invoices',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'EOM Invoicing',
    to: '/agency/eom',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Ad Spend',
    to: '/agency/social/spend',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Connections',
    to: '/agency/social',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Capacity',
    to: '/agency/capacity',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Expenses',
    to: '/agency/expenses',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Budget Health',
    to: '/agency/budget-health',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Templates',
    to: '/agency/templates',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Client Portal',
    to: '/agency/client-portal',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Team',
    to: '/agency/team',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Retainers',
    to: '/agency/retainers',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Monday Migration',
    to: '/agency/monday',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Boards',
    to: '/agency/boards',
    onSelect: () => {
      open.value = false
    }
  }]
}, {
  label: 'Settings',
  to: '/settings',
  icon: 'i-lucide-settings',
  defaultOpen: true,
  type: 'trigger',
  children: [{
    label: 'General',
    to: '/settings',
    exact: true,
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Members',
    to: '/settings/members',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Notifications',
    to: '/settings/notifications',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Security',
    to: '/settings/security',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Admin',
    to: '/settings/admin',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Integrations',
    to: '/settings/integrations/monday',
    onSelect: () => {
      open.value = false
    }
  }]
}], [{
  label: 'Feedback',
  icon: 'i-lucide-message-circle',
  to: 'https://github.com/nuxt-ui-templates/dashboard',
  target: '_blank'
}, {
  label: 'Help & Support',
  icon: 'i-lucide-info',
  to: 'https://github.com/nuxt-ui-templates/dashboard',
  target: '_blank'
}]] satisfies NavigationMenuItem[][]

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links.flat()
}, {
  id: 'code',
  label: 'Code',
  items: [{
    id: 'source',
    label: 'View page source',
    icon: 'i-simple-icons-github',
    to: `https://github.com/nuxt-ui-templates/dashboard/blob/main/app/pages${route.path === '/' ? '/index' : route.path}.vue`,
    target: '_blank'
  }]
}])

onMounted(async () => {
  const cookie = useCookie('cookie-consent')
  if (cookie.value === 'accepted') {
    return
  }

  toast.add({
    title: 'We use first-party cookies to enhance your experience on our website.',
    duration: 0,
    close: false,
    actions: [{
      label: 'Accept',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        cookie.value = 'accepted'
      }
    }, {
      label: 'Opt out',
      color: 'neutral',
      variant: 'ghost'
    }]
  })
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />

    <NotificationsSlideover />
  </UDashboardGroup>
</template>
