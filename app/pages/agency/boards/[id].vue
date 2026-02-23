<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b px-4 py-3">
      <div class="flex items-center justify-between">
        <div>
          <UBreadcrumb class="mb-2" :items="[
            { label: 'Boards', icon: 'i-lucide-layout-grid', to: '/agency/boards' },
            { label: board?.name || 'Board', icon: 'i-lucide-columns-3' }
          ]" />
          <h1 class="text-xl font-semibold">{{ board?.name || 'Board' }}</h1>
          <p class="text-sm text-gray-500 mt-1">
            {{ board?.totalItems || 0 }} items
            <span v-if="board?.lastUpdated">· Last updated {{ formatRelativeTime(board.lastUpdated) }}</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search items..."
            class="w-64"
          />
          <UButton color="primary" icon="i-lucide-plus" @click="showAddItem = true">
            New Item
          </UButton>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="bg-white border-b px-4 py-2 flex items-center gap-4">
      <UButton variant="ghost" size="sm" icon="i-lucide-filter">Filter</UButton>
      <UButton variant="ghost" size="sm" icon="i-lucide-arrow-up-down">Sort</UButton>
      <UButton variant="ghost" size="sm" icon="i-lucide-eye">Hide</UButton>
      <UButton variant="ghost" size="sm" icon="i-lucide-layers">Group</UButton>
      <div class="flex-1"></div>
      <UButton variant="ghost" size="sm" icon="i-lucide-plus" @click="showAddColumn = true">Add Column</UButton>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h3 class="font-medium">Failed to load board</h3>
        <UButton color="primary" class="mt-4" @click="refresh()">Try Again</UButton>
      </div>
    </div>

    <!-- Board Content -->
    <div v-else class="flex-1 overflow-auto p-4">
      <div class="min-w-max">
        <!-- Groups -->
        <div v-for="group in board?.groups" :key="group.id" class="mb-4 bg-white rounded-lg border">
          <!-- Group Header -->
          <button 
            class="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors"
            @click="group.isExpanded = !group.isExpanded"
          >
            <UIcon 
              :name="group.isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" 
              class="w-4 h-4 text-gray-500"
            />
            <span class="w-3 h-3 rounded-sm" :style="{ backgroundColor: group.color }" />
            <span class="font-medium">{{ group.name }}</span>
            <UBadge color="neutral" variant="subtle" class="ml-2">{{ group.items.length }}</UBadge>
          </button>
          
          <!-- Items Table -->
          <div v-if="group.isExpanded" class="border-t">
            <!-- Headers -->
            <div class="flex items-center bg-gray-50 text-xs font-medium text-gray-500 uppercase border-b">
              <div class="w-10 px-2 py-2 border-r">
                <UCheckbox 
                  :model-value="group.items.every(item => selectedItems.has(item.id))"
                  @update:model-value="selectAllInGroup(group, $event)"
                />
              </div>
              <div class="flex-1 min-w-[250px] px-4 py-2 border-r">Item</div>
              <div v-for="col in columns" :key="col.id" class="w-32 px-4 py-2 border-r flex items-center justify-between group">
                <span>{{ col.name }}</span>
                <UDropdownMenu :items="columnMenuItems(col)">
                  <button class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity">
                    <UIcon name="i-lucide-more-vertical" class="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </UDropdownMenu>
              </div>
            </div>

            <!-- Item Rows -->
            <div
              v-for="item in group.items" 
              :key="item.id"
              class="flex items-center border-b hover:bg-gray-50 cursor-pointer"
              :class="{ 'bg-blue-50': selectedTaskId === item.id, 'bg-blue-50/50': selectedItems.has(item.id) }"
              @click="openTask(item.id)"
            >
              <div class="w-10 px-2 py-3 border-r" @click.stop>
                <UCheckbox 
                  :model-value="selectedItems.has(item.id)"
                  @update:model-value="toggleItemSelection(item.id)"
                />
              </div>
              <div class="flex-1 min-w-[250px] px-4 py-3 border-r">
                <p class="text-sm font-medium">{{ item.title }}</p>
              </div>
              <div v-for="col in columns" :key="col.id" class="w-32 px-4 py-3 border-r text-sm" @click.stop>
                <template v-if="col.type === 'status' || col.slug === 'status'">
                  <div
                    class="inline-flex items-center px-3 py-1 rounded text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity min-w-[80px] justify-center"
                    :style="getStatusStyle(item, col.slug)"
                    @click.stop="openStatusPicker(item.id, col.slug, $event)"
                  >
                    {{ getStatusLabel(item, col.slug) }}
                  </div>
                </template>
                <template v-else-if="col.type === 'people' || col.slug === 'who'">
                  <div 
                    class="flex items-center gap-1 min-h-[28px] px-1 rounded hover:bg-gray-100 cursor-pointer"
                    @click.stop="openPeopleSelector(item.id, $event)"
                  >
                    <!-- Show assigned people as badges -->
                    <div v-if="getAssignedPeopleForTask(item.id).length" class="flex items-center gap-1 flex-wrap">
                      <div 
                        v-for="person in getAssignedPeopleForTask(item.id)" 
                        :key="person.id"
                        class="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs"
                      >
                        <UAvatar :alt="person.name" :fallback="person.initials" size="2xs" class="bg-blue-500 text-white" />
                        <span class="truncate max-w-[60px]">{{ person.name.split(' ')[0] }}</span>
                        <button 
                          @click.stop="removePersonFromTask(item.id, person.id)"
                          class="ml-0.5 hover:text-blue-900"
                        >
                          <UIcon name="i-lucide-x" class="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <span v-else class="text-gray-400 text-sm">-</span>
                  </div>
                </template>
                <template v-else-if="col.type === 'dropdown'">
                  <div v-if="getItemValue(item, col.slug)?.length" class="flex flex-wrap gap-1">
                    <span 
                      v-for="(val, idx) in getItemValue(item, col.slug).slice(0, 2)" 
                      :key="idx"
                      class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700"
                    >
                      {{ val }}
                    </span>
                  </div>
                  <span v-else class="text-gray-400">-</span>
                </template>
                <template v-else-if="col.type === 'label' || col.slug === 'priority'">
                  <div
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-90 transition-opacity"
                    :style="getPriorityStyle(item.id)"
                    @click.stop="openPriorityPicker(item.id, $event)"
                  >
                    <UIcon v-if="getTaskPriority(item.id)?.icon" :name="getTaskPriority(item.id)!.icon" class="w-3.5 h-3.5" />
                    <span>{{ getPriorityLabel(item) }}</span>
                  </div>
                </template>
                <template v-else-if="col.type === 'date' || col.slug === 'due_date'">
                  <div
                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer hover:bg-gray-100 transition-colors"
                    :class="getDateColor(getTaskDate(item.id) || getItemValue(item, col.slug))"
                    @click.stop="openDatePicker(item.id, col.slug, $event)"
                  >
                    <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5" />
                    <span>{{ formatDisplayDate(getTaskDate(item.id) || getItemValue(item, col.slug)) }}</span>
                  </div>
                </template>
                <template v-else>
                  <span class="text-gray-600">{{ getItemValue(item, col.slug) || '-' }}</span>
                </template>
              </div>
            </div>

            <!-- Add Item Row -->
            <div class="flex items-center bg-gray-50/50 border-b">
              <div class="w-10 px-2 py-2 border-r"></div>
              <div class="flex-1 min-w-[250px] px-4 py-2">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-plus" class="w-4 h-4 text-gray-400" />
                  <input
                    v-model="newItems[group.id]"
                    type="text"
                    placeholder="Add item"
                    class="flex-1 bg-transparent border-none outline-none text-sm placeholder-gray-400"
                    @keydown.enter="addItem(group.id)"
                    @click.stop
                  />
                </div>
              </div>
              <div v-for="col in columns" :key="col.id" class="w-32 px-4 py-2 border-r"></div>
            </div>
          </div>
        </div>

        <!-- Empty -->
        <div v-if="!board?.groups?.length" class="text-center py-12 bg-white rounded-lg border">
          <UIcon name="i-lucide-columns-3" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <h3 class="font-medium">No items yet</h3>
        </div>
      </div>
    </div>

    <!-- Bulk Actions Toolbar -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div v-if="selectedItems.size > 0" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <!-- Tooltip -->
        <Transition
          enter-active-class="transition duration-200"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-150"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-2"
        >
          <div v-if="showBulkActionsTip" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80">
            <div class="bg-blue-600 text-white rounded-lg p-4 shadow-lg relative">
              <button 
                class="absolute top-2 right-2 text-white/70 hover:text-white"
                @click="showBulkActionsTip = false"
              >
                <UIcon name="i-lucide-x" class="w-4 h-4" />
              </button>
              <h4 class="font-semibold mb-1">Update multiple items at once!</h4>
              <p class="text-sm text-blue-100 mb-2">
                Select multiple items to update column value, edit or move them in one single click.
              </p>
              <p class="text-sm text-blue-100 mb-3">Guaranteed time-saver ;)</p>
              <UButton size="xs" color="neutral" variant="solid" class="bg-white text-blue-600 hover:bg-blue-50" @click="showBulkActionsTip = false">
                Got it
              </UButton>
              <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                <div class="w-3 h-3 bg-blue-600 rotate-45"></div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Toolbar -->
        <div class="bg-white rounded-lg shadow-xl border flex items-center px-2 py-2">
          <!-- Selection Count -->
          <div class="flex items-center gap-2 px-4 border-r mr-2">
            <div class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold">
              {{ selectedItems.size }}
            </div>
            <span class="text-sm font-medium text-gray-700">Item{{ selectedItems.size > 1 ? 's' : '' }} selected</span>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1">
            <UButton variant="ghost" size="sm" icon="i-lucide-copy" class="flex-col gap-0.5 h-auto py-1.5">
              <span class="text-xs">Duplicate</span>
            </UButton>
            <UButton variant="ghost" size="sm" icon="i-lucide-upload" class="flex-col gap-0.5 h-auto py-1.5">
              <span class="text-xs">Export</span>
            </UButton>
            <UButton variant="ghost" size="sm" icon="i-lucide-archive" class="flex-col gap-0.5 h-auto py-1.5">
              <span class="text-xs">Archive</span>
            </UButton>
            <UButton variant="ghost" size="sm" icon="i-lucide-trash-2" class="flex-col gap-0.5 h-auto py-1.5">
              <span class="text-xs">Delete</span>
            </UButton>
            <UButton variant="ghost" size="sm" icon="i-lucide-arrow-right-left" class="flex-col gap-0.5 h-auto py-1.5">
              <span class="text-xs">Convert</span>
            </UButton>
            <UButton variant="ghost" size="sm" icon="i-lucide-arrow-right" class="flex-col gap-0.5 h-auto py-1.5">
              <span class="text-xs">Move to</span>
            </UButton>
            <UButton variant="ghost" size="sm" icon="i-lucide-sparkles" class="flex-col gap-0.5 h-auto py-1.5">
              <span class="text-xs">Sidekick</span>
            </UButton>
            <UButton variant="ghost" size="sm" icon="i-lucide-puzzle" class="flex-col gap-0.5 h-auto py-1.5">
              <span class="text-xs">Apps</span>
            </UButton>
          </div>

          <!-- Close -->
          <div class="border-l pl-2 ml-2">
            <UButton variant="ghost" size="sm" icon="i-lucide-x" color="neutral" @click="clearSelection" />
          </div>
        </div>
      </div>
    </Transition>

    <!-- People Selector Popover -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div 
          v-if="showPeopleSelector"
          class="fixed z-[100] bg-white rounded-lg shadow-xl border w-80"
          :style="{ left: peopleSelectorPosition.x + 'px', top: peopleSelectorPosition.y + 'px' }"
          v-click-outside="closePeopleSelector"
        >
          <!-- Selected People -->
          <div v-if="getAssignedPeopleForTask(peopleSelectorTaskId || '').length" class="p-3 border-b">
            <div class="flex flex-wrap gap-2">
              <div 
                v-for="person in getAssignedPeopleForTask(peopleSelectorTaskId || '')" 
                :key="person.id"
                class="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-sm"
              >
                <UAvatar :alt="person.name" :fallback="person.initials" size="2xs" class="bg-blue-500 text-white" />
                <span>{{ person.name }}</span>
                <button @click="togglePersonForTask(person.id)" class="hover:text-blue-900 ml-0.5">
                  <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- Search -->
          <div class="p-3 border-b">
            <div class="relative">
              <UIcon name="i-lucide-search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                v-model="peopleSearchQuery"
                type="text"
                placeholder="Search names, roles or teams"
                class="w-full pl-9 pr-3 py-2 text-sm border rounded-md outline-none focus:border-blue-500"
              />
              <UIcon name="i-lucide-info" class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <!-- Suggested People -->
          <div class="max-h-64 overflow-y-auto py-2">
            <div class="px-3 pb-2 text-xs font-medium text-gray-500 uppercase">Suggested people</div>
            <button
              v-for="person in filteredPeople"
              :key="person.id"
              class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors"
              :class="{ 'bg-blue-50': isPersonAssignedToTask(person.id) }"
              @click="togglePersonForTask(person.id)"
            >
              <UAvatar :alt="person.name" :fallback="person.initials" size="sm" class="bg-gray-700 text-white" />
              <div class="text-left flex-1">
                <div class="text-sm font-medium text-gray-900">{{ person.name }}</div>
                <div v-if="person.role" class="text-xs text-gray-500">{{ person.role }}</div>
              </div>
              <UIcon v-if="isPersonAssignedToTask(person.id)" name="i-lucide-check" class="w-4 h-4 text-blue-600" />
            </button>
          </div>

          <!-- Notification Banner -->
          <div class="p-3 border-t bg-blue-50/50 flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm text-gray-600">
              <UIcon name="i-lucide-bell" class="w-4 h-4" />
              <span>Assignees will be notified</span>
            </div>
            <UButton size="xs" variant="outline" color="neutral">Mute</UButton>
          </div>

          <!-- Auto-assign -->
          <div class="p-3 border-t">
            <button class="w-full flex items-center justify-center gap-2 text-sm text-blue-600 hover:bg-blue-50 py-2 rounded-lg transition-colors">
              <UIcon name="i-lucide-sparkles" class="w-4 h-4" />
              <span>Auto-assign people</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Status Picker Popover -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div 
          v-if="showStatusPicker"
          class="fixed z-[100] bg-white rounded-lg shadow-xl border w-[360px] p-3"
          :style="{ left: statusPickerPosition.x + 'px', top: statusPickerPosition.y + 'px' }"
          v-click-outside="closeStatusPicker"
        >
          <!-- Status Grid -->
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="status in statusOptions"
              :key="status.id"
              class="px-2 py-2 rounded text-xs font-medium text-center hover:opacity-90 transition-opacity"
              :style="{ backgroundColor: status.color, color: status.textColor }"
              @click="setTaskStatus(status.id)"
            >
              {{ status.label }}
            </button>
          </div>

          <!-- Footer Actions -->
          <div class="mt-3 pt-3 border-t flex items-center gap-2">
            <button class="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
              <UIcon name="i-lucide-pencil" class="w-4 h-4" />
              <span>Edit Labels</span>
            </button>
          </div>

          <!-- Auto-assign -->
          <div class="mt-2 pt-2 border-t">
            <button class="w-full flex items-center justify-center gap-2 text-sm text-blue-600 hover:bg-blue-50 py-2 rounded-lg transition-colors">
              <UIcon name="i-lucide-sparkles" class="w-4 h-4" />
              <span>Auto-assign labels</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Priority Picker Popover -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div 
          v-if="showPriorityPicker"
          class="fixed z-[100] bg-white rounded-lg shadow-xl border w-[200px] p-2"
          :style="{ left: priorityPickerPosition.x + 'px', top: priorityPickerPosition.y + 'px' }"
          v-click-outside="closePriorityPicker"
        >
          <!-- Priority List -->
          <div class="space-y-1">
            <button
              v-for="priority in priorityOptions"
              :key="priority.id"
              class="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
              @click="setTaskPriority(priority.id)"
            >
              <div 
                class="w-8 h-8 rounded-full flex items-center justify-center"
                :style="{ backgroundColor: priority.color }"
              >
                <UIcon :name="priority.icon" class="w-4 h-4 text-white" />
              </div>
              <span class="text-sm font-medium text-gray-900">{{ priority.label }}</span>
              <UIcon 
                v-if="taskPriorities[priorityPickerTaskId || ''] === priority.id" 
                name="i-lucide-check" 
                class="w-4 h-4 text-blue-600 ml-auto" 
              />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Date Picker Popover -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div 
          v-if="showDatePicker"
          class="fixed z-[100] bg-white rounded-lg shadow-xl border w-[280px] p-3"
          :style="{ left: datePickerPosition.x + 'px', top: datePickerPosition.y + 'px' }"
          v-click-outside="closeDatePicker"
        >
          <!-- Quick Select -->
          <div class="grid grid-cols-2 gap-2 mb-3">
            <button 
              class="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-left"
              @click="selectedDate = new Date().toISOString().split('T')[0]"
            >
              Today
            </button>
            <button 
              class="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-left"
              @click="() => { const d = new Date(); d.setDate(d.getDate() + 1); selectedDate = d.toISOString().split('T')[0] }"
            >
              Tomorrow
            </button>
            <button 
              class="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-left"
              @click="() => { const d = new Date(); d.setDate(d.getDate() + 7); selectedDate = d.toISOString().split('T')[0] }"
            >
              Next week
            </button>
            <button 
              class="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-left text-gray-400"
            >
              No Date
            </button>
          </div>

          <!-- Calendar -->
          <div class="border rounded-lg overflow-hidden">
            <UCalendar v-model="calendarValue" />
          </div>

          <!-- Footer -->
          <div class="mt-3 pt-3 border-t flex items-center justify-between">
            <button 
              class="text-sm text-red-600 hover:text-red-700"
              @click="() => { selectedDate = ''; setTaskDate('') }"
            >
              Clear
            </button>
            <div class="flex items-center gap-2">
              <UButton size="xs" variant="ghost" @click="closeDatePicker">Cancel</UButton>
              <UButton size="xs" color="primary" @click="setTaskDate(selectedDate)" :disabled="!selectedDate">Set Date</UButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Delete Column Confirmation -->
    <UModal v-model:open="showDeleteModal" title="Delete Column">
      <template #body>
        <p class="text-gray-600">
          Are you sure you want to delete this column? This will also delete all data in this column and cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="showDeleteConfirm = null">Cancel</UButton>
          <UButton color="error" @click="confirmDeleteColumn">Delete Column</UButton>
        </div>
      </template>
    </UModal>

    <!-- Add Column Modal -->
    <UModal v-model:open="showAddColumn" title="Add Column">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Column Name">
            <UInput v-model="newColumn.name" placeholder="e.g., Budget" class="w-full" />
          </UFormField>
          <UFormField label="Column Type">
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="type in columnTypes"
                :key="type.id"
                class="flex items-center gap-3 p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                :class="newColumn.type === type.id ? 'border-primary bg-primary/5' : ''"
                @click="newColumn.type = type.id"
              >
                <div class="w-8 h-8 rounded-lg flex items-center justify-center" :style="{ backgroundColor: type.color + '20' }">
                  <UIcon :name="type.icon" class="w-4 h-4" :style="{ color: type.color }" />
                </div>
                <span class="text-sm font-medium">{{ type.name }}</span>
              </button>
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="showAddColumn = false">Cancel</UButton>
          <UButton color="primary" :disabled="!newColumn.name || !newColumn.type" @click="addColumn">Add Column</UButton>
        </div>
      </template>
    </UModal>

    <!-- Task Slideover - Monday.com Style -->
    <USlideover 
      v-model:open="showTaskPanel" 
      side="right" 
      :ui="{ content: 'w-[680px]' }"
    >
      <template #header>
        <div v-if="selectedTask" class="flex items-center gap-3 w-full">
          <div class="flex items-center gap-2">
            <span 
              v-if="selectedTask.groupName"
              class="w-2 h-2 rounded-sm" 
              :style="{ backgroundColor: selectedTask.groupColor || '#579BFC' }" 
            />
            <span class="text-xs text-gray-500 uppercase tracking-wide">{{ selectedTask.groupName }}</span>
          </div>
        </div>
      </template>

      <template #body>
        <div v-if="selectedTask" class="h-full flex flex-col">
          <!-- Task Title -->
          <div class="mb-4">
            <h2 class="text-lg font-semibold text-gray-900 leading-tight">{{ selectedTask.title }}</h2>
          </div>

          <!-- Tabs Navigation -->
          <div class="flex items-center border-b -mx-4 px-4 mb-4">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px"
              :class="activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
              <span v-if="tab.count" class="ml-1 text-xs text-gray-400">{{ tab.count }}</span>
            </button>
            <div class="flex-1"></div>
            <UButton icon="i-lucide-plus" variant="ghost" size="sm" color="neutral" class="mb-2" />
          </div>

          <!-- Tab Content -->
          <div class="flex-1 overflow-auto">
            <!-- Updates Tab -->
            <template v-if="activeTab === 'updates'">
              <TaskActivityFeed 
                v-if="selectedTaskId"
                :task-id="selectedTaskId" 
              />
            </template>

            <!-- Files Tab -->
            <div v-else-if="activeTab === 'files'" class="space-y-4">
              <!-- Toolbar -->
              <div class="flex items-center gap-3">
                <UButton icon="i-lucide-plus" variant="outline" size="sm">Add file</UButton>
                <div class="flex-1 relative">
                  <UIcon name="i-lucide-search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search for files" 
                    class="w-full pl-9 pr-3 py-1.5 text-sm border rounded-md outline-none focus:border-blue-500"
                  />
                </div>
                <div class="flex items-center gap-1 border rounded-md p-0.5">
                  <button class="p-1.5 rounded bg-gray-100">
                    <UIcon name="i-lucide-grid-2x2" class="w-4 h-4 text-gray-700" />
                  </button>
                  <button class="p-1.5 rounded hover:bg-gray-50">
                    <UIcon name="i-lucide-list" class="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <UButton icon="i-lucide-download" variant="ghost" size="sm" color="neutral" />
              </div>

              <p class="text-sm text-gray-500">Showing {{ files.length }} out of {{ files.length }} files</p>

              <!-- Files Grid -->
              <div class="grid grid-cols-2 gap-4">
                <div v-for="file in files" :key="file.id" class="group">
                  <!-- Thumbnail Card -->
                  <div class="relative bg-gray-50 rounded-lg border overflow-hidden aspect-[4/3] mb-2">
                    <img :src="file.thumbnail" :alt="file.name" class="w-full h-full object-cover" />
                    
                    <!-- Overlay Actions -->
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button class="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white">
                        <UIcon name="i-lucide-maximize-2" class="w-4 h-4 text-gray-700" />
                      </button>
                      <button class="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white">
                        <UIcon name="i-lucide-share-2" class="w-4 h-4 text-gray-700" />
                      </button>
                    </div>

                    <!-- Version Badge -->
                    <div class="absolute top-2 left-2 bg-white/90 rounded px-1.5 py-0.5 text-xs font-medium">
                      {{ file.version }}
                    </div>

                    <!-- Menu -->
                    <UDropdownMenu :items="fileMenuItems" class="absolute top-2 right-2">
                      <button class="w-7 h-7 rounded bg-white/90 flex items-center justify-center hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <UIcon name="i-lucide-more-horizontal" class="w-4 h-4 text-gray-700" />
                      </button>
                    </UDropdownMenu>
                  </div>

                  <!-- File Info -->
                  <div class="space-y-1">
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-sm font-medium text-gray-900 truncate flex-1" :title="file.name">{{ file.name }}</p>
                      <UIcon name="i-lucide-info" class="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    </div>
                    <button class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                      <UIcon name="i-lucide-clock" class="w-3.5 h-3.5" />
                      <span>Update</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Activity Tab -->
            <div v-else-if="activeTab === 'activity'" class="space-y-4">
              <!-- Activity Type Toggle -->
              <div class="flex items-center justify-between border-b pb-3">
                <span class="text-sm font-medium text-gray-700">Other activities</span>
                <button class="text-sm text-blue-600 hover:text-blue-700">Automation activity</button>
              </div>

              <!-- Filter Bar -->
              <div class="flex items-center gap-3">
                <UButton icon="i-lucide-list-filter" color="primary" size="xs" trailing-icon="i-lucide-chevron-down">Filter log</UButton>
                <UButton icon="i-lucide-user" variant="ghost" size="xs" color="neutral">Person</UButton>
                <UButton icon="i-lucide-sparkles" variant="ghost" size="xs" color="neutral">AI Powered</UButton>
                <div class="flex-1"></div>
                <UButton icon="i-lucide-refresh-cw" variant="ghost" size="xs" color="neutral" />
                <UButton icon="i-lucide-columns-3" variant="ghost" size="xs" color="neutral" />
              </div>

              <!-- Activity List -->
              <div class="space-y-0">
                <div v-for="activity in activities" :key="activity.id" class="flex items-center gap-3 py-3 border-b hover:bg-gray-50 -mx-4 px-4">
                  <!-- Time -->
                  <div class="flex items-center gap-1.5 text-xs text-gray-500 w-12 flex-shrink-0">
                    <UIcon name="i-lucide-clock" class="w-3.5 h-3.5" />
                    <span>{{ activity.time }}</span>
                  </div>

                  <!-- Avatar -->
                  <UAvatar :alt="activity.user.name" :fallback="getInitials(activity.user.name)" size="sm" class="bg-blue-500 text-white flex-shrink-0" />

                  <!-- Task Name -->
                  <div class="w-32 flex-shrink-0">
                    <p class="text-sm font-medium text-gray-900 truncate">{{ activity.taskName }}</p>
                  </div>

                  <!-- Change Type -->
                  <div class="flex items-center gap-1.5 text-sm text-gray-600 flex-shrink-0 w-24">
                    <UIcon :name="activity.icon" class="w-4 h-4" />
                    <span>{{ activity.changeType }}</span>
                  </div>

                  <!-- Change Details -->
                  <div class="flex-1 flex items-center gap-2 min-w-0">
                    <template v-if="activity.oldValue">
                      <span class="text-sm text-gray-500 line-through truncate">{{ activity.oldValue }}</span>
                      <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </template>
                    <span class="text-sm font-medium truncate" :class="getActivityValueColor(activity.newValue)">{{ activity.newValue }}</span>
                  </div>

                  <!-- Undo Button -->
                  <UButton variant="outline" size="xs" color="neutral">Undo</UButton>
                </div>
              </div>
            </div>

            <!-- Info Tab -->
            <div v-else-if="activeTab === 'info'" class="space-y-4">
              <div class="flex items-center justify-between py-2 border-b">
                <span class="text-sm text-gray-500">Status</span>
                <UBadge color="primary" variant="soft">In Progress</UBadge>
              </div>
              <div class="flex items-center justify-between py-2 border-b">
                <span class="text-sm text-gray-500">Priority</span>
                <UBadge color="warning" variant="soft">High</UBadge>
              </div>
              <div class="flex items-center justify-between py-2 border-b">
                <span class="text-sm text-gray-500">Due Date</span>
                <span class="text-sm">{{ formatDate(selectedTask?.dueDate) || 'Not set' }}</span>
              </div>
              <div class="flex items-center justify-between py-2 border-b">
                <span class="text-sm text-gray-500">Assignee</span>
                <div class="flex items-center gap-2">
                  <UAvatar size="xs" fallback="?" />
                  <span class="text-sm">Unassigned</span>
                </div>
              </div>
            </div>
          </div>


        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { CalendarDate, today, getLocalTimeZone } from '@internationalized/date'

// Click outside directive for people selector
interface ClickOutsideElement extends HTMLElement {
  _clickOutside?: (event: Event) => void
}

const vClickOutside = {
  mounted(el: ClickOutsideElement, binding: any) {
    el._clickOutside = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value()
      }
    }
    document.addEventListener('click', el._clickOutside, true)
  },
  unmounted(el: ClickOutsideElement) {
    if (el._clickOutside) {
      document.removeEventListener('click', el._clickOutside, true)
    }
  }
}

definePageMeta({ layout: 'agency' })

interface BoardColumn {
  id: string
  name: string
  slug: string
  type: string
  settings?: any
}

interface BoardItem {
  id: string
  title: string
  dueDate?: string
  priority: string
  status: string
  statusColor: string
  assignees?: { name: string }[]
  clients?: string[]
  columnValues?: Record<string, any>
}

interface BoardGroup {
  id: string
  name: string
  color: string
  items: BoardItem[]
  isExpanded: boolean
}

interface Board {
  id: string
  name: string
  groups: BoardGroup[]
  totalItems: number
  lastUpdated?: string
}

interface TaskDetail {
  id: string
  title: string
  groupName?: string
  groupColor?: string
  dueDate?: string
}

const route = useRoute()
const boardId = computed(() => route.params.id as string)
const searchQuery = ref('')
const showAddItem = ref(false)
const showAddColumn = ref(false)
const showDeleteConfirm = ref<string | null>(null)
const showDeleteModal = computed({
  get: () => showDeleteConfirm.value !== null,
  set: (val: boolean) => {
    if (!val) showDeleteConfirm.value = null
  }
})
const showPeopleSelector = ref(false)
const peopleSelectorTaskId = ref<string | null>(null)
const peopleSearchQuery = ref('')
const peopleSelectorPosition = ref({ x: 0, y: 0 })

const showStatusPicker = ref(false)
const statusPickerTaskId = ref<string | null>(null)
const statusPickerColumn = ref<string | null>(null)
const statusPickerPosition = ref({ x: 0, y: 0 })

const showPriorityPicker = ref(false)
const priorityPickerTaskId = ref<string | null>(null)
const priorityPickerPosition = ref({ x: 0, y: 0 })

const showDatePicker = ref(false)
const datePickerTaskId = ref<string | null>(null)
const datePickerColumn = ref<string | null>(null)
const datePickerPosition = ref({ x: 0, y: 0 })
const selectedDate = ref<string>('')
const calendarValue = computed({
  get: () => {
    if (!selectedDate.value) return today(getLocalTimeZone())
    const [year, month, day] = selectedDate.value.split('-').map(Number)
    return new CalendarDate(year, month, day)
  },
  set: (val: any) => {
    selectedDate.value = val.toString()
  }
})
const showTaskPanel = ref(false)
const selectedTaskId = ref<string | null>(null)
const newItems = ref<Record<string, string>>({})
const selectedItems = ref<Set<string>>(new Set())
const showBulkActionsTip = ref(true)
const activeTab = ref('updates')

const newColumn = ref({ name: '', type: '' })

// Updates/Activity refs (for task panel updates tab)
const newUpdate = ref('')
const newReply = ref('')

interface Update {
  id: string
  author: { name: string; avatar: string }
  content: string
  createdAt: string
}

const updates = ref<Update[]>([
  {
    id: '1',
    author: { name: 'Clara Padalini', avatar: '' },
    content: 'Started working on this task. Will update the client by EOD.',
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: '2',
    author: { name: 'Paul Giurin', avatar: '' },
    content: 'Thanks @Clara Padalini! Let me know if you need any help.',
    createdAt: new Date(Date.now() - 43200000).toISOString()
  }
])

const tabs = [
  { id: 'updates', label: 'Updates', count: 0 },
  { id: 'files', label: 'Files', count: 0 },
  { id: 'activity', label: 'Activity Log', count: 0 },
  { id: 'info', label: 'Info', count: 0 }
]

const fileMenuItems = [
  [
    { label: 'Open File', icon: 'i-lucide-external-link' },
    { label: 'Download File', icon: 'i-lucide-download' }
  ],
  [
    { label: 'Delete File', icon: 'i-lucide-trash-2', color: 'error' }
  ],
  [
    { label: 'Manage file versions', icon: 'i-lucide-history' },
    { label: 'Post updates on file', icon: 'i-lucide-message-circle' },
    { label: 'Extract data from file', icon: 'i-lucide-arrow-right-left' }
  ]
]

const columnTypes = [
  { id: 'status', name: 'Status', icon: 'i-lucide-circle', color: '#00C875' },
  { id: 'dropdown', name: 'Dropdown', icon: 'i-lucide-list', color: '#579BFC' },
  { id: 'text', name: 'Text', icon: 'i-lucide-type', color: '#FFCC00' },
  { id: 'date', name: 'Date', icon: 'i-lucide-calendar', color: '#FF642E' },
  { id: 'people', name: 'People', icon: 'i-lucide-users', color: '#A25DDC' },
  { id: 'numbers', name: 'Numbers', icon: 'i-lucide-hash', color: '#E2445C' },
  { id: 'checkbox', name: 'Checkbox', icon: 'i-lucide-check-square', color: '#00C875' },
  { id: 'timeline', name: 'Timeline', icon: 'i-lucide-gantt-chart', color: '#579BFC' },
  { id: 'label', name: 'Label', icon: 'i-lucide-tag', color: '#FFCC00' },
]

const { data: board, pending, error, refresh } = await useFetch<Board>(`/api/agency/boards/${boardId.value}`)
const { data: columnsData, refresh: refreshColumns } = await useFetch<{ columns: BoardColumn[] }>(`/api/agency/boards/${boardId.value}/columns`)
const columns = computed(() => columnsData.value?.columns || [])

const { data: taskData, execute: fetchTask } = useFetch<TaskDetail>(() => `/api/agency/tasks/${selectedTaskId.value!}`, { immediate: false })
const selectedTask = computed(() => taskData.value || null)

interface FileItem {
  id: string
  name: string
  thumbnail: string
  version: string
  updatedAt: string
}

const files = ref<FileItem[]>([
  {
    id: '1',
    name: 'Screenshot 2026-02-20 at 1...',
    thumbnail: 'https://placehold.co/300x200/f3f4f6/666?text=Screenshot+1',
    version: 'V1',
    updatedAt: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Screenshot 2026-02-20 at 1...',
    thumbnail: 'https://placehold.co/300x200/e5e7eb/666?text=Map+View',
    version: 'V1',
    updatedAt: new Date().toISOString()
  },
  {
    id: '3',
    name: 'Screenshot 2026-02-20 at 1...',
    thumbnail: 'https://placehold.co/300x200/f3f4f6/666?text=Screenshot+3',
    version: 'V1',
    updatedAt: new Date().toISOString()
  },
  {
    id: '4',
    name: 'Screenshot 2026-02-19 at 1...',
    thumbnail: 'https://placehold.co/300x200/e5e7eb/666?text=Chat+View',
    version: 'V1',
    updatedAt: new Date().toISOString()
  },
  {
    id: '5',
    name: 'image003.png',
    thumbnail: 'https://placehold.co/300x200/ffffff/666?text=Logos',
    version: 'V1',
    updatedAt: new Date().toISOString()
  },
  {
    id: '6',
    name: 'image002.png',
    thumbnail: 'https://placehold.co/300x200/1e3a5f/fff?text=BRIGHTON+AUTO',
    version: 'V1',
    updatedAt: new Date().toISOString()
  },
  {
    id: '7',
    name: 'image001.jpg',
    thumbnail: 'https://placehold.co/300x200/ffffff/1e3a5f?text=Bay+City+Auto',
    version: 'V1',
    updatedAt: new Date().toISOString()
  },
  {
    id: '8',
    name: 'image252508.png',
    thumbnail: 'https://placehold.co/300x200/ffffff/666?text=Car+Logos',
    version: 'V1',
    updatedAt: new Date().toISOString()
  }
])

interface Activity {
  id: string
  time: string
  user: { name: string }
  taskName: string
  changeType: string
  icon: string
  oldValue?: string
  newValue: string
}

const activities = ref<Activity[]>([
  {
    id: '1',
    time: '1d',
    user: { name: 'Clara Padalini' },
    taskName: '***BRIGHTON AU...',
    changeType: 'Status',
    icon: 'i-lucide-columns-3',
    oldValue: 'Due T...',
    newValue: 'Urgent'
  },
  {
    id: '2',
    time: '1d',
    user: { name: 'Clara Padalini' },
    taskName: '***BRIGHTON AU...',
    changeType: 'Client',
    icon: 'i-lucide-minus',
    oldValue: '-',
    newValue: 'Bright...'
  },
  {
    id: '3',
    time: '1d',
    user: { name: 'Clara Padalini' },
    taskName: '***BRIGHTON AU...',
    changeType: 'Name',
    icon: 'i-lucide-type',
    oldValue: 'Fwd: ...',
    newValue: '***BRI...'
  },
  {
    id: '4',
    time: '1M',
    user: { name: 'Clara Padalini' },
    taskName: 'Fwd: ADME Feed ...',
    changeType: 'Status',
    icon: 'i-lucide-columns-3',
    oldValue: '',
    newValue: 'Due T...'
  },
  {
    id: '5',
    time: '1M',
    user: { name: 'Clara Padalini' },
    taskName: 'Fwd: ADME Feed ...',
    changeType: 'Group',
    icon: 'i-lucide-folder-open',
    oldValue: 'Emailed Items',
    newValue: 'Current Support Jobs'
  },
  {
    id: '6',
    time: '1M',
    user: { name: 'Clara Padalini' },
    taskName: 'Fwd: ADME Feed ...',
    changeType: 'Created',
    icon: 'i-lucide-plus-circle',
    newValue: 'Group: Emailed Items'
  }
])



function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

async function openTask(taskId: string) {
  // Reset state first
  showTaskPanel.value = false
  selectedTaskId.value = null
  await nextTick()
  
  // Set new task
  selectedTaskId.value = taskId
  activeTab.value = 'updates'
  showTaskPanel.value = true
  await fetchTask()
}

function getItemValue(item: BoardItem, colSlug: string): any {
  const map: Record<string, any> = {
    'status': { text: item.status, color: item.statusColor },
    'who': item.assignees,
    'client': item.clients,
    'priority': item.priority,
    'due_date': item.dueDate
  }
  return map[colSlug] ?? item.columnValues?.[colSlug]
}

async function addColumn() {
  if (!newColumn.value.name || !newColumn.value.type) return
  await $fetch(`/api/agency/boards/${boardId.value}/columns`, {
    method: 'POST',
    body: newColumn.value
  })
  newColumn.value = { name: '', type: '' }
  showAddColumn.value = false
  refreshColumns()
}

function columnMenuItems(col: BoardColumn) {
  return [
    [
      { label: 'Edit', icon: 'i-lucide-pencil', click: () => console.log('Edit column', col.id) },
      { label: 'Sort', icon: 'i-lucide-arrow-up-down' },
      { label: 'Filter', icon: 'i-lucide-filter' }
    ],
    [
      { label: 'Hide', icon: 'i-lucide-eye-off' }
    ],
    [
      { 
        label: 'Delete', 
        icon: 'i-lucide-trash-2', 
        color: 'error',
        click: () => promptDeleteColumn(col.id)
      }
    ]
  ]
}

function promptDeleteColumn(columnId: string) {
  showDeleteConfirm.value = columnId
}

async function confirmDeleteColumn() {
  if (!showDeleteConfirm.value) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/columns/${showDeleteConfirm.value}`, {
      method: 'DELETE'
    })
    showDeleteConfirm.value = null
    refreshColumns()
  } catch (err) {
    console.error('Failed to delete column:', err)
    alert('Failed to delete column')
  }
}

// People selector
const availablePeople = ref([
  { id: '1', name: 'Alicia Karitsas', avatar: '', initials: 'AK', role: '' },
  { id: '2', name: 'Clara Padalini', avatar: '', initials: 'CP', role: 'Director' },
  { id: '3', name: 'Matthew Crawford', avatar: '', initials: 'MC', role: 'Social & Traffic Op...' },
  { id: '4', name: 'Craig Lawrence', avatar: '', initials: 'CL', role: '' },
  { id: '5', name: 'Garrix Lopena', avatar: '', initials: 'GL', role: '' },
  { id: '6', name: 'Robert Giurin', avatar: '', initials: 'RG', role: '' },
  { id: '7', name: 'Paul Giurin', avatar: '', initials: 'PG', role: '' }
])

const taskAssignees = ref<Record<string, string[]>>({
  // taskId: [personId1, personId2]
})

function openPeopleSelector(taskId: string, event: MouseEvent) {
  peopleSelectorTaskId.value = taskId
  showPeopleSelector.value = true
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  peopleSelectorPosition.value = { x: rect.left, y: rect.bottom + 8 }
}

function closePeopleSelector() {
  showPeopleSelector.value = false
  peopleSelectorTaskId.value = null
  peopleSearchQuery.value = ''
}

function togglePersonForTask(personId: string) {
  const taskId = peopleSelectorTaskId.value
  if (!taskId) return
  
  if (!taskAssignees.value[taskId]) {
    taskAssignees.value[taskId] = []
  }
  
  const index = taskAssignees.value[taskId].indexOf(personId)
  if (index > -1) {
    taskAssignees.value[taskId].splice(index, 1)
  } else {
    taskAssignees.value[taskId].push(personId)
  }
}

function removePersonFromTask(taskId: string, personId: string) {
  if (taskAssignees.value[taskId]) {
    const index = taskAssignees.value[taskId].indexOf(personId)
    if (index > -1) {
      taskAssignees.value[taskId].splice(index, 1)
    }
  }
}

function isPersonAssignedToTask(personId: string): boolean {
  const taskId = peopleSelectorTaskId.value
  if (!taskId || !taskAssignees.value[taskId]) return false
  return taskAssignees.value[taskId].includes(personId)
}

function getAssignedPeopleForTask(taskId: string) {
  const personIds = taskAssignees.value[taskId] || []
  return availablePeople.value.filter(p => personIds.includes(p.id))
}

const filteredPeople = computed(() => {
  if (!peopleSearchQuery.value) return availablePeople.value
  const query = peopleSearchQuery.value.toLowerCase()
  return availablePeople.value.filter(p => 
    p.name.toLowerCase().includes(query) ||
    p.role.toLowerCase().includes(query)
  )
})

// Status picker
const statusOptions = [
  { id: 'due-today', label: 'Due Today', color: '#E2445C', textColor: '#fff' },
  { id: 'working-on-it', label: 'Working On It', color: '#FDAB3D', textColor: '#fff' },
  { id: 'ongoing', label: 'Ongoing', color: '#CAB641', textColor: '#fff' },
  { id: 'in-progress', label: 'In Progress', color: '#784848', textColor: '#fff' },
  { id: 'done', label: 'Done', color: '#00C875', textColor: '#fff' },
  { id: 'hold', label: 'Hold', color: '#C4A484', textColor: '#fff' },
  { id: 'critical', label: 'Critical', color: '#FF6B6B', textColor: '#fff' },
  { id: 'urgent', label: 'Urgent', color: '#FF642E', textColor: '#fff' },
  { id: 'awaiting-client', label: 'Awaiting Client', color: '#FF99CC', textColor: '#fff' },
  { id: 'oem-request', label: 'OEM Request', color: '#7BC86C', textColor: '#fff' },
  { id: 'due-this-week', label: 'Due This Week', color: '#A25DDC', textColor: '#fff' },
  { id: 'awaiting-approval', label: 'Awaiting Approval', color: '#4ECDC4', textColor: '#fff' },
  { id: 'overdue', label: 'Overdue', color: '#FFB3BA', textColor: '#fff' },
  { id: 'next-week', label: 'Next Week', color: '#99E6FF', textColor: '#333' },
  { id: 'awaiting-oem', label: 'Awaiting OEM Appr...', color: '#FFD93D', textColor: '#333' },
  { id: 'update-required', label: 'Update Required', color: '#B39DDB', textColor: '#fff' },
  { id: 'changes-required', label: 'Changes Required', color: '#F8BBD9', textColor: '#333' },
  { id: 'ac-mgr', label: 'AC Mgr: Follow Up', color: '#6B4C9A', textColor: '#fff' },
  { id: 'billable', label: 'Billable', color: '#579BFC', textColor: '#fff' }
]

const taskStatuses = ref<Record<string, Record<string, string>>>({})

function openStatusPicker(taskId: string, columnSlug: string, event: MouseEvent) {
  statusPickerTaskId.value = taskId
  statusPickerColumn.value = columnSlug
  showStatusPicker.value = true
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  statusPickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
}

function closeStatusPicker() {
  showStatusPicker.value = false
  statusPickerTaskId.value = null
  statusPickerColumn.value = null
}

function setTaskStatus(statusId: string) {
  const taskId = statusPickerTaskId.value
  const colSlug = statusPickerColumn.value
  if (!taskId || !colSlug) return
  
  if (!taskStatuses.value[taskId]) {
    taskStatuses.value[taskId] = {}
  }
  taskStatuses.value[taskId][colSlug] = statusId
  closeStatusPicker()
}

function getTaskStatus(taskId: string, colSlug: string) {
  return statusOptions.find(s => s.id === taskStatuses.value[taskId]?.[colSlug])
}

// Priority picker
const priorityOptions = [
  { id: 'urgent', label: 'Urgent', color: '#E2445C', icon: 'i-lucide-alert-circle' },
  { id: 'high', label: 'High', color: '#FF642E', icon: 'i-lucide-arrow-up' },
  { id: 'medium', label: 'Medium', color: '#579BFC', icon: 'i-lucide-minus' },
  { id: 'low', label: 'Low', color: '#00C875', icon: 'i-lucide-arrow-down' }
]

const taskPriorities = ref<Record<string, string>>({})

function openPriorityPicker(taskId: string, event: MouseEvent) {
  priorityPickerTaskId.value = taskId
  showPriorityPicker.value = true
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  priorityPickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
}

function closePriorityPicker() {
  showPriorityPicker.value = false
  priorityPickerTaskId.value = null
}

function setTaskPriority(priorityId: string) {
  const taskId = priorityPickerTaskId.value
  if (!taskId) return
  taskPriorities.value[taskId] = priorityId
  closePriorityPicker()
}

function getTaskPriority(taskId: string) {
  return priorityOptions.find(p => p.id === taskPriorities.value[taskId])
}

// Date picker
const taskDueDates = ref<Record<string, string>>({})

function openDatePicker(taskId: string, columnSlug: string, event: MouseEvent) {
  datePickerTaskId.value = taskId
  datePickerColumn.value = columnSlug
  selectedDate.value = taskDueDates.value[taskId] || ''
  showDatePicker.value = true
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  datePickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
}

function closeDatePicker() {
  showDatePicker.value = false
  datePickerTaskId.value = null
  datePickerColumn.value = null
  selectedDate.value = ''
}

function setTaskDate(date: string) {
  const taskId = datePickerTaskId.value
  if (!taskId) return
  taskDueDates.value[taskId] = date
  closeDatePicker()
}

function getTaskDate(taskId: string): string {
  return taskDueDates.value[taskId] || ''
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function getDateColor(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  if (date < today) return 'text-red-600'
  if (date.toDateString() === today.toDateString()) return 'text-orange-600'
  return 'text-gray-700'
}

async function addItem(groupId: string) {
  const title = newItems.value[groupId]?.trim()
  if (!title) return
  newItems.value[groupId] = ''
  refresh()
}

function postUpdate() {
  if (!newUpdate.value.trim()) return
  updates.value.unshift({
    id: Date.now().toString(),
    author: { name: 'You', avatar: '' },
    content: newUpdate.value,
    createdAt: new Date().toISOString()
  })
  newUpdate.value = ''
}

function postReply() {
  if (!newReply.value.trim()) return
  newReply.value = ''
}

function formatDate(date: string | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  return `${days}d`
}

function toggleItemSelection(itemId: string) {
  if (selectedItems.value.has(itemId)) {
    selectedItems.value.delete(itemId)
  } else {
    selectedItems.value.add(itemId)
  }
}

function selectAllInGroup(group: BoardGroup, selected: boolean | string) {
  if (selected === true) {
    group.items.forEach(item => selectedItems.value.add(item.id))
  } else {
    group.items.forEach(item => selectedItems.value.delete(item.id))
  }
}

function clearSelection() {
  selectedItems.value.clear()
}

function getStatusStyle(item: BoardItem, colSlug: string) {
  const status = getTaskStatus(item.id, colSlug)
  if (status) {
    return { backgroundColor: status.color, color: status.textColor }
  }
  // Default from item data
  const val = getItemValue(item, colSlug)
  if (val?.color) {
    return { backgroundColor: val.color + '20', color: val.color }
  }
  return { backgroundColor: '#E5E7EB', color: '#6B7280' }
}

function getStatusLabel(item: BoardItem, colSlug: string) {
  const status = getTaskStatus(item.id, colSlug)
  if (status) return status.label
  const val = getItemValue(item, colSlug)
  return val?.text || val || '-'
}

function getPriorityStyle(taskId: string) {
  const priority = getTaskPriority(taskId)
  if (priority) {
    return { backgroundColor: priority.color + '20', color: priority.color }
  }
  const item = board.value?.groups.flatMap(g => g.items).find(i => i.id === taskId)
  if (item?.priority) {
    const colors: Record<string, string> = {
      urgent: '#E2445C',
      high: '#FF642E',
      medium: '#579BFC',
      low: '#00C875'
    }
    const color = colors[item.priority] || '#6B7280'
    return { backgroundColor: color + '20', color }
  }
  return { backgroundColor: '#E5E7EB', color: '#6B7280' }
}

function getPriorityLabel(item: BoardItem) {
  const priority = getTaskPriority(item.id)
  if (priority) return priority.label
  return item.priority?.charAt(0).toUpperCase() + item.priority?.slice(1) || '-'
}

function getPriorityColor(priority: string): 'error' | 'warning' | 'neutral' | 'success' {
  const colors: Record<string, 'error' | 'warning' | 'neutral' | 'success'> = {
    urgent: 'error', high: 'warning', medium: 'neutral', low: 'success'
  }
  return colors[priority] || 'neutral'
}

function getActivityValueColor(value: string): string {
  if (value.includes('Urgent')) return 'text-red-600 bg-red-50 px-2 py-0.5 rounded' 
  if (value.includes('Due')) return 'text-red-600 bg-red-100 px-2 py-0.5 rounded'
  if (value.includes('Emailed Items')) return 'text-emerald-600'
  if (value.includes('Current Support Jobs')) return 'text-purple-600'
  return 'text-gray-900'
}
</script>
