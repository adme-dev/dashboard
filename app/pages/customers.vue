<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

import type { TableColumn } from '@nuxt/ui'
import { upperFirst } from 'scule'
import { getPaginationRowModel } from '@tanstack/table-core'
import type { Row } from '@tanstack/table-core'
import type { Customer } from '~/types/customers'

const UAvatar = resolveComponent('UAvatar')
const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')

const toast = useToast()
const table = useTemplateRef('table')
const showXeroContacts = ref(false)
const isSyncing = ref(false)

const columnFilters = ref([{
  id: 'name',
  value: ''
}])
const columnVisibility = ref()
const rowSelection = ref({})

// Fetch customers from local database
const { data, status, refresh } = await useFetch<Customer[]>('/api/customers', {
  lazy: true
})

// Fetch Xero contacts directly (when toggled)
const { data: xeroContacts, status: xeroStatus, execute: fetchXeroContacts } = await useFetch('/api/xero/contacts', {
  immediate: false,
  lazy: true
})

// Toggle between local DB and Xero API
async function toggleXeroView() {
  showXeroContacts.value = !showXeroContacts.value
  if (showXeroContacts.value && !xeroContacts.value) {
    await fetchXeroContacts()
  }
}

// Sync contacts from Xero to local DB
async function syncFromXero() {
  isSyncing.value = true
  try {
    const result = await $fetch('/api/xero/contacts/sync', {
      method: 'POST'
    })
    toast.add({
      title: 'Sync Complete',
      description: result.message,
      color: 'success'
    })
    // Refresh local data
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Sync Failed',
      description: err?.message || 'Failed to sync contacts from Xero',
      color: 'error'
    })
  } finally {
    isSyncing.value = false
  }
}

function getRowItems(row: Row<Customer>) {
  return [
    {
      type: 'label',
      label: 'Actions'
    },
    {
      label: 'Copy customer ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(row.original.id.toString())
        toast.add({
          title: 'Copied to clipboard',
          description: 'Customer ID copied to clipboard'
        })
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'View customer details',
      icon: 'i-lucide-list',
      to: `/agency/clients/${row.original.id}`
    },
    {
      label: 'View projects',
      icon: 'i-lucide-folder',
      to: `/agency/clients/${row.original.id}/projects`
    },
    {
      label: 'View in Xero',
      icon: 'i-lucide-external-link',
      disabled: !row.original.xeroContactId,
      onSelect() {
        if (row.original.xeroContactId) {
          window.open(`https://go.xero.com/Contacts/View/${row.original.xeroContactId}`, '_blank')
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: row.original.status === 'active' ? 'Deactivate' : 'Activate',
      icon: row.original.status === 'active' ? 'i-lucide-pause' : 'i-lucide-play',
      onSelect() {
        toast.add({
          title: row.original.status === 'active' ? 'Customer deactivated' : 'Customer activated',
          description: `${row.original.name} has been ${row.original.status === 'active' ? 'deactivated' : 'activated'}.`
        })
      }
    }
  ]
}

const columns: TableColumn<Customer>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        'modelValue': table.getIsSomePageRowsSelected()
          ? 'indeterminate'
          : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': 'Select all'
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
        'ariaLabel': 'Select row'
      })
  },
  {
    accessorKey: 'name',
    header: 'Customer',
    cell: ({ row }) => {
      return h('div', { class: 'flex items-center gap-3' }, [
        h(UAvatar, {
          ...row.original.avatar,
          size: 'lg'
        }),
        h('div', undefined, [
          h('p', { class: 'font-medium text-highlighted' }, row.original.name),
          h('p', { class: 'text-sm text-gray-500' }, row.original.email)
        ])
      ])
    }
  },
  {
    accessorKey: 'billingType',
    header: 'Billing Type',
    cell: ({ row }) => {
      const typeLabels: Record<string, string> = {
        retainer: 'Retainer',
        project: 'Project Based',
        hybrid: 'Hybrid',
        commission: 'Commission'
      }
      return h('span', { class: 'capitalize' }, typeLabels[row.original.billingType] || row.original.billingType)
    }
  },
  {
    accessorKey: 'activeProjects',
    header: 'Active Projects',
    cell: ({ row }) => {
      return h('span', {}, row.original.activeProjects.toString())
    }
  },
  {
    accessorKey: 'totalRevenue',
    header: ({ column }) => {
      const isSorted = column.getIsSorted()

      return h(UButton, {
        color: 'neutral',
        variant: 'ghost',
        label: 'Total Revenue',
        icon: isSorted
          ? isSorted === 'asc'
            ? 'i-lucide-arrow-up-narrow-wide'
            : 'i-lucide-arrow-down-wide-narrow'
          : 'i-lucide-arrow-up-down',
        class: '-mx-2.5',
        onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
      })
    },
    cell: ({ row }) => {
      const formatted = new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD'
      }).format(row.original.totalRevenue)
      return h('span', { class: 'font-medium' }, formatted)
    }
  },
  {
    accessorKey: 'status',
    header: 'Status',
    filterFn: 'equals',
    cell: ({ row }) => {
      const color = row.original.status === 'active' ? 'success' as const : 'neutral' as const
      return h(UBadge, { class: 'capitalize', variant: 'subtle', color }, () =>
        row.original.status
      )
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: {
              align: 'end'
            },
            items: getRowItems(row)
          },
          () =>
            h(UButton, {
              icon: 'i-lucide-ellipsis-vertical',
              color: 'neutral',
              variant: 'ghost',
              class: 'ml-auto'
            })
        )
      )
    }
  }
]

// Xero contacts columns (different data structure)
const xeroColumns = [
  {
    accessorKey: 'name',
    header: 'Contact Name'
  },
  {
    accessorKey: 'email',
    header: 'Email'
  },
  {
    accessorKey: 'isCustomer',
    header: 'Type',
    cell: ({ row }: any) => {
      const types = []
      if (row.original.isCustomer) types.push('Customer')
      if (row.original.isSupplier) types.push('Supplier')
      return h('span', {}, types.join(', ') || 'Contact')
    }
  },
  {
    accessorKey: 'balances.receivableOutstanding',
    header: 'Outstanding',
    cell: ({ row }: any) => {
      const amount = row.original.balances?.receivableOutstanding
      if (!amount) return h('span', { class: 'text-gray-400' }, '-')
      const formatted = new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: row.original.defaultCurrency || 'AUD'
      }).format(amount)
      const color = amount > 0 ? 'text-orange-500' : 'text-green-500'
      return h('span', { class: color }, formatted)
    }
  },
  {
    accessorKey: 'balances.receivableOverdue',
    header: 'Overdue',
    cell: ({ row }: any) => {
      const amount = row.original.balances?.receivableOverdue
      if (!amount) return h('span', { class: 'text-gray-400' }, '-')
      const formatted = new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: row.original.defaultCurrency || 'AUD'
      }).format(amount)
      return h('span', { class: 'text-red-500 font-medium' }, formatted)
    }
  }
]

const statusFilter = ref('all')

watch(() => statusFilter.value, (newVal) => {
  if (!table?.value?.tableApi) return

  const statusColumn = table.value.tableApi.getColumn('status')
  if (!statusColumn) return

  if (newVal === 'all') {
    statusColumn.setFilterValue(undefined)
  } else {
    statusColumn.setFilterValue(newVal)
  }
})

const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})
</script>

<template>
  <UDashboardPanel id="customers">
    <template #header>
      <UDashboardNavbar title="Customers">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              :icon="showXeroContacts ? 'i-lucide-database' : 'i-lucide-cloud'"
              :label="showXeroContacts ? 'View Local' : 'View Xero'"
              color="neutral"
              variant="outline"
              @click="toggleXeroView"
            />
            <UButton
              icon="i-lucide-refresh-cw"
              :label="isSyncing ? 'Syncing...' : 'Sync from Xero'"
              color="primary"
              variant="soft"
              :loading="isSyncing"
              @click="syncFromXero"
            />
            <UButton
              icon="i-lucide-plus"
              label="Add Customer"
              to="/agency/clients/new"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Xero View -->
      <div v-if="showXeroContacts" class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-medium">Xero Contacts</h3>
            <p class="text-sm text-gray-500">
              {{ xeroContacts?.customerCount || 0 }} customers, {{ xeroContacts?.supplierCount || 0 }} suppliers
            </p>
          </div>
          <UBadge color="primary" variant="subtle">Live from Xero</UBadge>
        </div>

        <UTable
          :data="xeroContacts?.contacts || []"
          :columns="xeroColumns"
          :loading="xeroStatus === 'pending'"
        />
      </div>

      <!-- Local Database View -->
      <div v-else class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <UInput
            :model-value="(table?.tableApi?.getColumn('name')?.getFilterValue() as string)"
            class="max-w-sm"
            icon="i-lucide-search"
            placeholder="Search customers..."
            @update:model-value="table?.tableApi?.getColumn('name')?.setFilterValue($event)"
          />

          <div class="flex flex-wrap items-center gap-1.5">
            <USelect
              v-model="statusFilter"
              :items="[
                { label: 'All', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' }
              ]"
              :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
              placeholder="Filter status"
              class="min-w-28"
            />
            <UDropdownMenu
              :items="
                table?.tableApi
                  ?.getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => ({
                    label: upperFirst(column.id),
                    type: 'checkbox' as const,
                    checked: column.getIsVisible(),
                    onUpdateChecked(checked: boolean) {
                      table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
                    },
                    onSelect(e?: Event) {
                      e?.preventDefault()
                    }
                  }))
              "
              :content="{ align: 'end' }"
            >
              <UButton
                label="Display"
                color="neutral"
                variant="outline"
                trailing-icon="i-lucide-settings-2"
              />
            </UDropdownMenu>
          </div>
        </div>

        <UTable
          ref="table"
          v-model:column-filters="columnFilters"
          v-model:column-visibility="columnVisibility"
          v-model:row-selection="rowSelection"
          v-model:pagination="pagination"
          :pagination-options="{
            getPaginationRowModel: getPaginationRowModel()
          }"
          class="shrink-0"
          :data="data || []"
          :columns="columns"
          :loading="status === 'pending'"
          :ui="{
            base: 'table-fixed border-separate border-spacing-0',
            thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
            tbody: '[&>tr]:last:[&>td]:border-b-0',
            th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
            td: 'border-b border-default'
          }"
        />

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
          <div class="text-sm text-muted">
            {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length || 0 }} of
            {{ table?.tableApi?.getFilteredRowModel().rows.length || 0 }} row(s) selected.
          </div>

          <div class="flex items-center gap-1.5">
            <UPagination
              :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
              :items-per-page="table?.tableApi?.getState().pagination.pageSize"
              :total="table?.tableApi?.getFilteredRowModel().rows.length"
              @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
            />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
