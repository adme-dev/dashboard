<template>
  <BoardContainer
    ref="containerRef"
    :board-id="boardId"
    @open-task="openTask"
    @export="showExport = true"
    @template="showTemplates = true"
    @automations="showAutomations = true"
    @chat-feed="showChatFeed = true"
    @add-group="showAddGroup = true"
    @add-column="showAddColumn = true"
    @add-item="handleAddItem"
    @new-item="showNewItem = true"
  >
    <!-- Table View (default) -->
    <template #table="{ groups, columns, normalizeColumn, getCellValue, handleCellUpdate, selection }">
      <div class="flex-1 overflow-auto p-4">
        <div class="min-w-max">
          <!-- Groups -->
          <div
            v-for="(group, groupIndex) in groups"
            :key="group.id"
            class="mb-4 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 relative transition-all duration-150"
            :class="{
              'opacity-50': dragState.dragGroupId === group.id,
              'border-t-2 border-t-blue-500': dragState.dropTargetIndex === groupIndex && dragState.dragGroupId !== group.id,
            }"
            @dragover.prevent="onGroupDragOver($event, groupIndex)"
            @dragleave="onGroupDragLeave"
            @drop.prevent="onGroupDrop(groups)"
          >
            <!-- Group Header -->
            <BoardGroupRow
              :group-id="group.id"
              :name="group.name"
              :color="group.color"
              :task-count="group.totalCount ?? group.items.length"
              :is-collapsed="!group.isExpanded"
              :draggable="isRealGroup(group.id)"
              @toggle="toggleGroup(group)"
              @rename="(name) => renameGroup(group.id, name)"
              @update-color="(color) => updateGroupColor(group.id, color)"
              @delete="deleteGroup(group.id)"
              @add-group="(pos) => addGroupNear(group.id, pos)"
              @dragstart="(e) => onGroupDragStart(e, group.id, groupIndex)"
              @dragend="onGroupDragEnd"
            />

            <!-- Items Table -->
            <div v-if="group.isExpanded" class="border-t border-gray-200 dark:border-neutral-700">
              <!-- Loading indicator for lazy-loaded groups -->
              <div v-if="group.items.length === 0 && loadingGroups.has(`${group.id}:0`)" class="flex items-center justify-center py-8">
                <UIcon name="i-lucide-loader-2" class="w-5 h-5 text-gray-400 animate-spin mr-2" />
                <span class="text-sm text-gray-500 dark:text-neutral-400">Loading items...</span>
              </div>

              <!-- Headers -->
              <div v-if="group.items.length > 0" class="flex items-center bg-gray-50 dark:bg-neutral-800 text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase border-b border-gray-200 dark:border-neutral-700">
                <div class="w-10 px-2 py-2 border-r border-gray-200 dark:border-neutral-700">
                  <UCheckbox
                    :model-value="selection.isGroupSelected(group.items)"
                    @update:model-value="selection.selectGroup(group.items, !!$event)"
                  />
                </div>
                <div class="relative flex-shrink-0 px-4 py-2 border-r border-gray-200 dark:border-neutral-700 flex items-center group/itemcol" :style="{ width: itemColWidth + 'px' }">
                  <span class="truncate">Item</span>
                  <div
                    class="absolute top-0 right-0 h-full w-2 cursor-col-resize z-10 transition-colors after:absolute after:top-1 after:bottom-1 after:right-0 after:w-px after:bg-blue-500/0 group-hover/itemcol:after:bg-blue-500/30 hover:!bg-blue-500/30 hover:after:!bg-blue-500 hover:after:!w-0.5 active:!bg-blue-500/50"
                    :class="{ '!bg-blue-500/50 after:!bg-blue-500 after:!w-0.5': resizingItemCol }"
                    title="Drag to resize"
                    @mousedown="onItemColResizeStart"
                    @click.stop
                  />
                </div>
                <div v-for="col in columns" :key="col.id" class="relative px-4 py-2 border-r border-gray-200 dark:border-neutral-700 flex items-center justify-between group" :style="{ width: (col.width || 150) + 'px' }">
                  <span class="truncate">{{ col.name }}</span>
                  <UDropdownMenu :items="columnMenuItems(col)">
                    <button class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded transition-opacity">
                      <UIcon name="i-lucide-more-vertical" class="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400" />
                    </button>
                  </UDropdownMenu>
                  <div
                    class="absolute top-0 right-0 h-full w-2 cursor-col-resize z-10 transition-colors after:absolute after:top-1 after:bottom-1 after:right-0 after:w-px after:bg-blue-500/0 group-hover:after:bg-blue-500/30 hover:!bg-blue-500/30 hover:after:!bg-blue-500 hover:after:!w-0.5 active:!bg-blue-500/50"
                    :class="{ '!bg-blue-500/50 after:!bg-blue-500 after:!w-0.5': resizingColumnId === col.id }"
                    title="Drag to resize"
                    @mousedown="onColumnResizeStart($event, col)"
                    @click.stop
                  />
                </div>
              </div>

              <!-- Item Rows -->
              <template v-for="item in group.items" :key="item.id">
                <div
                  class="flex items-center border-b border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer group/row"
                  :class="{ 'bg-blue-50 dark:bg-blue-950': selectedTaskId === item.id, 'bg-blue-50/50 dark:bg-blue-950/50': selection.isSelected(item.id) }"
                  @click="openTask(item.id)"
                >
                  <div class="w-10 px-2 py-3 border-r border-gray-200 dark:border-neutral-700" @click.stop>
                    <UCheckbox
                      :model-value="selection.isSelected(item.id)"
                      @update:model-value="selection.toggle(item.id)"
                    />
                  </div>
                  <div class="flex-shrink-0 px-4 py-3 border-r border-gray-200 dark:border-neutral-700" :style="{ width: itemColWidth + 'px' }">
                    <div class="flex items-center gap-1.5">
                      <!-- Subitem expand/collapse toggle — always visible when has subtasks, shown on hover otherwise -->
                      <button
                        class="p-0.5 -ml-1 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 transition-all"
                        :class="[
                          subitemHelper.isExpanded(item.id) ? 'rotate-90' : '',
                          subitemHelper.getCount(item.id) ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-60',
                        ]"
                        @click.stop="subitemHelper.toggleExpand(item.id, resolvedBoardId)"
                      >
                        <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400" />
                      </button>
                      <p class="text-sm font-medium truncate min-w-0 flex-1">{{ item.title }}</p>
                      <!-- Subitem count badge -->
                      <span
                        v-if="subitemHelper.getCount(item.id)"
                        class="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-500 dark:text-neutral-400 bg-gray-100 dark:bg-neutral-800 rounded px-1.5 py-0.5 flex-shrink-0"
                      >
                        {{ subitemHelper.getCount(item.id)!.completed }}/{{ subitemHelper.getCount(item.id)!.total }}
                      </span>
                      <!-- Task context menu -->
                      <div class="ml-auto flex-shrink-0" @click.stop>
                        <UDropdownMenu :items="taskMenuItems(item, group)">
                          <button class="opacity-0 group-hover/row:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded transition-opacity">
                            <UIcon name="i-lucide-more-horizontal" class="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400" />
                          </button>
                        </UDropdownMenu>
                      </div>
                    </div>
                  </div>
                  <div v-for="col in columns" :key="col.id" class="px-2 py-1 border-r border-gray-200 dark:border-neutral-700" :style="{ width: (col.width || 150) + 'px' }" @click.stop>
                    <BoardCell
                      :column="normalizeColumn(col)"
                      :value="getPricingCellValue(item, col, getCellValue)"
                      :task-id="item.id"
                      :readonly="isPricingReadonly(col)"
                      @update="(columnId, payload) => handleCellUpdate(item.id, columnId, payload)"
                      @edit-column="(columnId) => openColumnConfig(columns.find(c => c.id === columnId) || columns[0])"
                    />
                  </div>
                </div>

                <!-- Inline Subitems -->
                <BoardSubitemRows
                  v-if="subitemHelper.isExpanded(item.id)"
                  :ref="(el: any) => { if (el) subitemRowRefs.set(item.id, el) }"
                  :parent-task-id="item.id"
                  :board-id="resolvedBoardId"
                  :columns="columns"
                  :normalize-column="normalizeColumn"
                  :get-cell-value="getCellValue"
                  :handle-cell-update="handleCellUpdate"
                  :open-task="openTask"
                  @delete-subitem="(id: string) => { taskToDelete = id }"
                  @link-subitem="(id: string) => { linkPickerTaskId = id }"
                  @create-cross-board="(parentId: string) => openCrossBoardCreate(parentId)"
                />
              </template>

              <!-- Add Item Row -->
              <BoardAddItemRow
                :group-id="group.id"
                :columns="columns"
                @add="handleAddItem"
              />

              <!-- Load More -->
              <div v-if="group.hasMore" class="px-4 py-2 border-t border-gray-200 dark:border-neutral-700">
                <UButton
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-chevrons-down"
                  :loading="loadingGroups.has(`${group.id}:${group.items.length}`)"
                  @click="loadGroupItems(group, group.items.length)"
                >
                  Load more ({{ (group.totalCount ?? 0) - group.items.length }} remaining)
                </UButton>
              </div>

              <!-- Group Summary -->
              <BoardGroupSummary
                v-if="group.items.length > 0"
                :columns="columns"
                :items="group.items"
              />
            </div>
          </div>

          <!-- Bottom drop zone -->
          <div
            v-if="dragState.dragGroupId"
            class="h-4 rounded transition-all duration-150"
            :class="{ 'bg-blue-100 dark:bg-blue-900/30': dragState.dropTargetIndex === groups.length }"
            @dragover.prevent="dragState.dropTargetIndex = groups.length"
            @drop.prevent="onGroupDrop(groups)"
          />

          <!-- Empty -->
          <div v-if="!groups?.length" class="text-center py-12 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700">
            <UIcon name="i-lucide-columns-3" class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-neutral-600" />
            <h3 class="font-medium">No items yet</h3>
            <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">Create a group and start adding items</p>
            <UButton color="primary" class="mt-4" icon="i-lucide-folder-plus" @click="showAddGroup = true">
              Add Group
            </UButton>
          </div>
        </div>
      </div>
    </template>

    <!-- Bulk Actions -->
    <template #bulkActions="{ selection }">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-full opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-full opacity-0"
      >
        <div v-if="selection.hasSelection.value" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <!-- Tooltip -->
          <Transition
            enter-active-class="transition duration-200"
            enter-from-class="opacity-0 translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-2"
          >
            <div v-if="selection.showBulkActionsTip.value" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80">
              <div class="bg-blue-600 text-white rounded-lg p-4 shadow-lg relative">
                <button class="absolute top-2 right-2 text-white/70 hover:text-white" @click="selection.dismissTip()">
                  <UIcon name="i-lucide-x" class="w-4 h-4" />
                </button>
                <h4 class="font-semibold mb-1">Update multiple items at once!</h4>
                <p class="text-sm text-blue-100 mb-2">
                  Select multiple items to update column value, edit or move them in one single click.
                </p>
                <p class="text-sm text-blue-100 mb-3">Guaranteed time-saver ;)</p>
                <UButton size="xs" color="neutral" variant="solid" class="bg-white text-blue-600 hover:bg-blue-50" @click="selection.dismissTip()">
                  Got it
                </UButton>
                <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                  <div class="w-3 h-3 bg-blue-600 rotate-45" />
                </div>
              </div>
            </div>
          </Transition>

          <!-- Toolbar -->
          <div class="bg-white dark:bg-neutral-900 rounded-lg shadow-xl border flex items-center px-2 py-2">
            <div class="flex items-center gap-2 px-4 border-r mr-2">
              <div class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold">
                {{ selection.selectedCount.value }}
              </div>
              <span class="text-sm font-medium text-gray-700 dark:text-neutral-200">Item{{ selection.selectedCount.value > 1 ? 's' : '' }} selected</span>
            </div>
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
            <div class="border-l pl-2 ml-2">
              <UButton variant="ghost" size="sm" icon="i-lucide-x" color="neutral" @click="selection.clear()" />
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </BoardContainer>

  <!-- New Item Modal -->
  <UModal v-model:open="showNewItem" title="New Item">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Title">
          <UInput
            v-model="newItemTitle"
            placeholder="What needs to be done?"
            class="w-full"
            autofocus
            @keydown.enter="submitNewItem"
          />
        </UFormField>
        <UFormField v-if="availableGroups.length > 0" label="Group">
          <USelectMenu
            v-model="newItemGroupId"
            :items="[{ label: 'No group', value: '__none__' }, ...availableGroups.map(g => ({ label: g.name, value: g.id }))]"
            placeholder="Select group"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="showNewItem = false">Cancel</UButton>
        <UButton color="primary" :disabled="!newItemTitle.trim()" @click="submitNewItem">Add Item</UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete Column Confirmation -->
  <UModal v-model:open="showDeleteModal" title="Delete Column">
    <template #body>
      <p class="text-gray-600 dark:text-neutral-300">
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
          <BoardColumnTypeSelector v-model="newColumn.type" />
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

  <!-- Add Group Modal -->
  <UModal v-model:open="showAddGroup" title="New Group">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Group Name">
          <UInput v-model="newGroupName" placeholder="e.g., Sprint 1" class="w-full" />
        </UFormField>
        <UFormField label="Color">
          <div class="grid grid-cols-7 gap-2">
            <button
              v-for="c in groupColorOptions"
              :key="c"
              class="w-8 h-8 rounded-full hover:scale-110 transition-transform"
              :class="newGroupColor === c ? 'ring-2 ring-offset-2' : ''"
              :style="{ backgroundColor: c, ringColor: c }"
              @click="newGroupColor = c"
            />
          </div>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="showAddGroup = false">Cancel</UButton>
        <UButton color="primary" :disabled="!newGroupName.trim()" @click="handleAddGroup">Add Group</UButton>
      </div>
    </template>
  </UModal>

  <!-- Column Config Modal -->
  <BoardColumnConfig
    :column="editingColumn"
    :open="showColumnConfig"
    @update:open="showColumnConfig = $event"
    @save="handleColumnSave"
    @delete="handleColumnDelete"
    @add-option="handleAddOption"
    @update-option="handleUpdateOption"
  />

  <!-- Delete Group Confirmation -->
  <UModal v-model:open="showDeleteGroupModal" title="Delete Group">
    <template #body>
      <p class="text-gray-600 dark:text-neutral-300">
        Are you sure you want to delete this group? Tasks in the group will become ungrouped, not deleted.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="deleteGroupId = null">Cancel</UButton>
        <UButton color="error" @click="confirmDeleteGroup">Delete Group</UButton>
      </div>
    </template>
  </UModal>

  <!-- Export Modal -->
  <BoardExportModal
    v-model:open="showExport"
    :board-id="boardId"
    :board-name="containerRef?.board?.name || 'Board'"
    :columns="containerRef?.columns || []"
  />

  <!-- Template Chooser -->
  <BoardTemplateChooser
    v-model:open="showTemplates"
    :source-board-id="containerRef?.board?.id || boardId"
    :source-board-name="containerRef?.board?.name"
    @apply="handleApplyTemplate"
    @saved="() => {}"
  />

  <!-- Automation Builder -->
  <BoardAutomationBuilder
    :board-id="boardId"
    :open="showAutomations"
    @update:open="showAutomations = $event"
  />

  <!-- Chat Feed Settings -->
  <BoardChatFeedSettings
    :board-id="boardId"
    :open="showChatFeed"
    @update:open="showChatFeed = $event"
  />

  <!-- Delete Task Confirmation -->
  <UModal v-model:open="showDeleteTaskModal">
    <template #header>
      <h3 class="font-semibold">Delete Task</h3>
    </template>
    <template #body>
      <p class="text-gray-600 dark:text-neutral-300">
        Are you sure? This will also delete all subtasks and linked items.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" label="Cancel" @click="taskToDelete = null" />
        <UButton color="error" label="Delete" @click="executeDeleteTask" />
      </div>
    </template>
  </UModal>

  <!-- Link Picker Modal -->
  <UModal v-model:open="showLinkPickerModal">
    <template #header>
      <h3 class="font-semibold">Link to Task</h3>
    </template>
    <template #body>
      <LinkedItemPicker
        v-if="linkPickerTaskId"
        :task-id="linkPickerTaskId"
        :initial-mode="crossBoardParentId ? 'create' : 'search'"
        headless
        @updated="onLinkPickerUpdated"
        @close="closeLinkPicker"
      />
    </template>
  </UModal>

  <!-- Task Slideover -->
  <USlideover
    v-model:open="showTaskPanel"
    side="right"
    :title="selectedTask?.title || 'Task Details'"
    description="Task detail panel"
    :ui="{ content: 'w-[90vw] sm:w-[70vw] md:w-[50vw] lg:w-[33vw] min-w-[400px] max-w-[800px]' }"
  >
    <template #header>
      <div v-if="selectedTask" class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <span
            v-if="selectedTask.groupName"
            class="w-2 h-2 rounded-sm"
            :style="{ backgroundColor: selectedTask.groupColor || '#579BFC' }"
          />
          <span class="text-xs text-gray-500 dark:text-neutral-400 uppercase tracking-wide">{{ selectedTask.groupName }}</span>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-terminal-square"
            variant="soft"
            color="primary"
            size="xs"
            title="Copy a ready-to-paste IDE prompt for this task (Claude Code, Cursor, etc.)"
            @click="selectedTaskId && openIdePrompt(selectedTaskId)"
          >
            IDE prompt
          </UButton>
          <UButton
            icon="i-lucide-message-circle"
            :variant="showChat ? 'soft' : 'ghost'"
            :color="showChat ? 'primary' : 'neutral'"
            size="xs"
            @click="showChat = !showChat"
          />
          <UPopover>
            <UButton
              :icon="itemSubscribed ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
              :variant="itemSubscribed ? 'soft' : 'ghost'"
              :color="itemSubscribed ? 'primary' : 'neutral'"
              size="xs"
            >
              {{ itemSubscribed ? 'Watching' : 'Watch' }}
            </UButton>
            <template #content>
              <div class="p-2 w-56 space-y-0.5">
                <p class="text-xs font-medium px-2 py-1 text-muted">This item only</p>
                <div
                  v-for="opt in itemSubscribeOptions"
                  :key="opt.value"
                  class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-elevated/50 cursor-pointer text-sm"
                  @click="handleItemSubscribe(opt.value)"
                >
                  <UIcon :name="opt.icon" class="w-4 h-4" />
                  <span>{{ opt.label }}</span>
                  <UIcon v-if="itemSubscriptionLevel === opt.value" name="i-lucide-check" class="w-4 h-4 ml-auto text-primary" />
                </div>
                <div class="border-t border-default mt-1 pt-1">
                  <div
                    class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-elevated/50 cursor-pointer text-sm"
                    @click="openItemSettings = true"
                  >
                    <UIcon name="i-lucide-settings-2" class="w-4 h-4" />
                    <span>Custom…</span>
                    <UIcon v-if="itemSubscriptionLevel === 'custom'" name="i-lucide-check" class="w-4 h-4 ml-auto text-primary" />
                  </div>
                </div>
              </div>
            </template>
          </UPopover>
          <BoardWatchSettings
            v-if="selectedTaskId"
            v-model:open="openItemSettings"
            :board-id="boardId"
            :item-id="selectedTaskId"
            @saved="onItemSettingsSaved"
          />
        </div>
      </div>
    </template>

    <template #body>
      <!-- Loading state -->
      <div v-if="taskLoading && !selectedTask" class="flex items-center justify-center py-24">
        <XfLoader size="sm" />
      </div>

      <div v-else-if="selectedTask" class="h-full flex flex-col">
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-neutral-100 leading-tight">{{ selectedTask.title }}</h2>
        </div>

        <!-- Chat Overlay (replaces tabs when active) -->
        <div v-if="showChat" class="flex-1 overflow-hidden">
          <TaskChatPanel v-if="selectedTaskId" :task-id="selectedTaskId" />
        </div>

        <!-- Tab Interface -->
        <template v-else>
          <!-- Tabs -->
          <div class="flex items-center border-b border-gray-200 dark:border-neutral-700 -mx-4 px-4 mb-4">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px"
              :class="activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100'"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- Tab Content -->
          <div class="flex-1 overflow-auto">
            <template v-if="activeTab === 'updates'">
              <TaskCommentThread
                v-if="selectedTaskId"
                :task-id="selectedTaskId"
                placeholder="Write an update and mention others with @"
              />
            </template>

            <div v-else-if="activeTab === 'subtasks'" class="px-1">
              <SubtaskList v-if="selectedTaskId" :task-id="selectedTaskId" />
            </div>

            <div v-else-if="activeTab === 'details'">
              <TaskDetailsPanel v-if="selectedTaskId" :task-id="selectedTaskId" />
            </div>

            <div v-else-if="activeTab === 'time-billing'" class="space-y-6">
              <TaskTimePanel v-if="selectedTaskId" :task-id="selectedTaskId" />
              <hr class="border-gray-200 dark:border-neutral-700" />
              <TaskBillingPanel v-if="selectedTaskId" :task-id="selectedTaskId" />
            </div>
          </div>
        </template>
      </div>
    </template>
  </USlideover>

  <BoardTaskIdePrompt
    v-model="idePromptOpen"
    :board-id="boardId"
    :task-id="idePromptTaskId"
  />
</template>

<script setup lang="ts">
import type { BoardColumn, BoardGroup } from '~/composables/useBoardData'
import BoardContainer from '~/components/board/BoardContainer.vue'
import BoardCell from '~/components/board/BoardCell.vue'
import BoardGroupRow from '~/components/board/BoardGroupRow.vue'
import BoardAddItemRow from '~/components/board/BoardAddItemRow.vue'
import BoardGroupSummary from '~/components/board/BoardGroupSummary.vue'
import BoardColumnConfig from '~/components/board/BoardColumnConfig.vue'
import BoardColumnTypeSelector from '~/components/board/BoardColumnTypeSelector.vue'
import BoardExportModal from '~/components/board/BoardExportModal.vue'
import BoardWatchSettings from '~/components/board/BoardWatchSettings.vue'
import BoardTemplateChooser from '~/components/board/BoardTemplateChooser.vue'
import BoardAutomationBuilder from '~/components/board/BoardAutomationBuilder.vue'
import BoardChatFeedSettings from '~/components/board/BoardChatFeedSettings.vue'
import BoardSubitemRows from '~/components/board/BoardSubitemRows.vue'
import LinkedItemPicker from '~/components/board/LinkedItemPicker.vue'
import SubtaskList from '~/components/task/SubtaskList.vue'
import TaskCommentThread from '~/components/task/CommentThread.vue'
import TaskBillingPanel from '~/components/task/TaskBillingPanel.vue'
import TaskChatPanel from '~/components/task/TaskChatPanel.vue'
import TaskDetailsPanel from '~/components/task/TaskDetailsPanel.vue'
import TaskTimePanel from '~/components/task/TaskTimePanel.vue'

definePageMeta({ title: 'Board' })

// --- Types ---

interface TaskDetail {
  id: string
  title: string
  groupName?: string
  groupColor?: string
  dueDate?: string
  status?: string
}

// --- State ---

const route = useRoute()
const toast = useToast()
const boardId = computed(() => route.params.id as string)
const containerRef = ref<InstanceType<typeof BoardContainer> | null>(null)
const subitemHelper = useBoardSubitems()
const resolvedBoardId = computed(() => (containerRef.value?.board as any)?.id || boardId.value)

// Pricing visibility gating — columns always shown, values blanked for non-privileged users
const { data: pricingVisibility } = useLazyFetch('/api/agency/pricing/visibility')
const canViewPricing = computed(() => (pricingVisibility.value as any)?.canViewPricing ?? true)
const canEditPricing = computed(() => (pricingVisibility.value as any)?.canEditPricing ?? false)

const PRICING_SLUGS = new Set(['budget', 'billing_rate', 'is_billable'])
function isPricingColumn(col: any) {
  return PRICING_SLUGS.has(col.slug)
}
function getPricingCellValue(item: any, col: any, getCellValue: Function) {
  if (isPricingColumn(col) && !canViewPricing.value) return null
  return getCellValue(item, col)
}
function isPricingReadonly(col: any) {
  return isPricingColumn(col) && !canEditPricing.value
}

const showAddColumn = ref(false)
const showAddGroup = ref(false)
const showDeleteConfirm = ref<string | null>(null)
const showDeleteModal = computed({
  get: () => showDeleteConfirm.value !== null,
  set: (val: boolean) => { if (!val) showDeleteConfirm.value = null },
})
const deleteGroupId = ref<string | null>(null)
const showDeleteGroupModal = computed({
  get: () => deleteGroupId.value !== null,
  set: (val: boolean) => { if (!val) deleteGroupId.value = null },
})
const showTaskPanel = ref(false)
const selectedTaskId = ref<string | null>(null)
const activeTab = ref('updates')
const newColumn = ref({ name: '', type: '' })
const showColumnConfig = ref(false)
const editingColumn = ref<BoardColumn | null>(null)
const newGroupName = ref('')
const newGroupColor = ref('#579BFC')
const showExport = ref(false)
const showTemplates = ref(false)
const showAutomations = ref(false)
const showChatFeed = ref(false)
const showNewItem = ref(false)
const newItemTitle = ref('')
const newItemGroupId = ref('__none__')

const availableGroups = computed(() => {
  const groups = containerRef.value?.groups || []
  return groups.filter((g: any) => g.id !== '__ungrouped__' && !g.id.startsWith('grouped_'))
})

async function submitNewItem() {
  const title = newItemTitle.value.trim()
  if (!title) return
  await handleAddItem({
    groupId: newItemGroupId.value === '__none__' ? '__ungrouped__' : newItemGroupId.value,
    title,
  })
  newItemTitle.value = ''
  newItemGroupId.value = '__none__'
  showNewItem.value = false
}

const groupColorOptions = [
  '#579BFC', '#00C875', '#FDAB3D', '#E2445C', '#A25DDC',
  '#FF5AC4', '#FF642E', '#CAB641', '#9CD326', '#00D2D2',
  '#784BD1', '#66CCFF', '#BB3354', '#FF158A', '#037F4C',
  '#225091', '#4ECCC6', '#C4C4C4', '#808080', '#333333',
  '#7F5347',
]

// --- Subitem counts ---

// Init subitem counts from board data when it loads
watch(() => containerRef.value?.filteredGroups, (groups) => {
  if (groups?.length) {
    subitemHelper.initCounts(groups as any[])
  }
}, { deep: false })

// Reset subitems state on board change
watch(boardId, () => {
  subitemHelper.reset()
})

// Record a visit and surface a watch suggestion if the user keeps coming back
// to a board they don't subscribe to. One-shot per board mount.
async function recordVisitAndMaybeSuggest(bId: string) {
  try {
    const result = await $fetch<{ suggestWatch: boolean; recentVisits?: number }>(
      `/api/agency/boards/${bId}/visit`,
      { method: 'POST' }
    )
    if (result.suggestWatch) {
      const toast = useToast()
      toast.add({
        title: 'Watch this board?',
        description: `You've opened this board ${result.recentVisits} times this week. Get notified about updates?`,
        color: 'info',
        duration: 8000,
        actions: [{
          label: 'Watch',
          onClick: async () => {
            try {
              await $fetch(`/api/agency/boards/${bId}/subscribe`, {
                method: 'POST',
                body: { events: [], notifyInapp: true, notifyEmail: false, isMuted: false },
              })
              toast.add({ title: 'Now watching this board', color: 'success' })
            } catch {
              toast.add({ title: 'Could not subscribe', color: 'error' })
            }
          },
        }],
      })
    }
  } catch {
    // non-critical
  }
}

onMounted(() => {
  if (boardId.value) recordVisitAndMaybeSuggest(boardId.value)
})
watch(boardId, (nb) => {
  if (nb) recordVisitAndMaybeSuggest(nb)
})

// --- Container accessors ---

const refresh = () => containerRef.value?.refresh()
const refreshColumns = async () => {
  await containerRef.value?.refreshColumns()
  // Keep editingColumn in sync with refreshed data
  if (editingColumn.value) {
    const updated = containerRef.value?.columns?.find((c: any) => c.id === editingColumn.value!.id)
    if (updated) editingColumn.value = updated
  }
}

// --- Task Detail ---

const { data: taskData, status: taskFetchStatus, execute: fetchTask } = useFetch<TaskDetail>(() => `/api/agency/tasks/${selectedTaskId.value}`, { immediate: false, watch: false })
const taskLoading = computed(() => taskFetchStatus.value === 'pending')
const selectedTask = computed(() => taskData.value || null)

const showChat = ref(false)

const tabs = [
  { id: 'updates', label: 'Updates' },
  { id: 'subtasks', label: 'Subtasks' },
  { id: 'details', label: 'Details' },
  { id: 'time-billing', label: 'Time & Billing' },
]

// --- Item Subscription ---

const itemSubscribed = ref(false)
const itemSubscriptionLevel = ref<string | null>(null)
const openItemSettings = ref(false)

const itemSubscribeOptions = [
  { value: 'all', label: 'All activity', icon: 'i-lucide-bell-ring' },
  { value: 'mentions', label: 'Mentions only', icon: 'i-lucide-at-sign' },
  { value: 'muted', label: 'Muted', icon: 'i-lucide-bell-off' },
]

function classifyItemLevel(sub: any): string {
  if (sub.isMuted) return 'muted'
  const events: string[] = sub.events || []
  if (events.length === 0) return 'all'
  if (events.length === 1 && events[0] === 'task_mentioned') return 'mentions'
  return 'custom'
}

async function checkItemSubscription(taskId: string) {
  itemSubscribed.value = false
  itemSubscriptionLevel.value = null
  try {
    const { subscriptions } = await $fetch<{ subscriptions: any[] }>(`/api/agency/boards/${boardId.value}/subscriptions`)
    const sub = subscriptions.find((s: any) => s.itemId === taskId && !s.columnId)
    if (sub) {
      itemSubscribed.value = true
      itemSubscriptionLevel.value = classifyItemLevel(sub)
    }
  } catch {
    // Non-critical
  }
}

async function handleItemSubscribe(level: string) {
  if (!selectedTaskId.value) return
  try {
    if (level === itemSubscriptionLevel.value) {
      // Toggle off
      await $fetch(`/api/agency/boards/${boardId.value}/unsubscribe`, {
        method: 'DELETE',
        params: { itemId: selectedTaskId.value },
      })
      itemSubscribed.value = false
      itemSubscriptionLevel.value = null
      return
    }
    const events = level === 'mentions' ? ['task_mentioned'] : []
    const isMuted = level === 'muted'
    await $fetch(`/api/agency/boards/${boardId.value}/subscribe`, {
      method: 'POST',
      body: {
        itemId: selectedTaskId.value,
        events,
        notifyInapp: true,
        notifyEmail: false,
        isMuted,
      },
    })
    itemSubscribed.value = true
    itemSubscriptionLevel.value = level
  } catch (err) {
    console.error('Item subscribe failed:', err)
  }
}

function onItemSettingsSaved(payload: { subscribed: boolean; level: string | null }) {
  itemSubscribed.value = payload.subscribed
  itemSubscriptionLevel.value = payload.level
}

// --- Task Actions ---

async function openTask(taskId: string) {
  if (!taskId) return
  showTaskPanel.value = false
  selectedTaskId.value = null
  await nextTick()
  selectedTaskId.value = taskId
  activeTab.value = 'updates'
  showChat.value = false
  showTaskPanel.value = true
  await fetchTask()
  checkItemSubscription(taskId)
}

async function handleAddItem(payload: { groupId: string; title: string; date?: string }) {
  try {
    // board exposed from container is the resolved department UUID
    const boardData = containerRef.value?.board
    const resolvedBoardId = (boardData as any)?.id || boardId.value
    const isDynamicGroup = payload.groupId?.startsWith('grouped_') || false
    const task = await $fetch<{ id: string }>(`/api/agency/tasks`, {
      method: 'POST',
      body: {
        title: payload.title,
        departmentId: resolvedBoardId,
        groupId: (payload.groupId === '__ungrouped__' || isDynamicGroup) ? null : payload.groupId,
      },
    })
    // If a date was provided (e.g. from calendar view), set the date column value
    if (payload.date && task?.id) {
      const dateCol = containerRef.value?.columns?.find((c: any) => {
        const t = c.columnType || c.type
        return t === 'date' || t === 'timeline'
      })
      if (dateCol) {
        await containerRef.value?.handleCellUpdate(task.id, dateCol.id, { dateValue: payload.date })
      }
    }
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Failed to add item',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  }
}

// --- Column Actions ---

async function addColumn() {
  if (!newColumn.value.name || !newColumn.value.type) return
  await $fetch(`/api/agency/boards/${boardId.value}/columns`, {
    method: 'POST',
    body: newColumn.value,
  })
  newColumn.value = { name: '', type: '' }
  showAddColumn.value = false
  refreshColumns()
}

// --- Task Context Menu ---

const subitemRowRefs = new Map<string, any>()
const crossBoardParentId = ref<string | null>(null)

function openCrossBoardCreate(parentTaskId: string) {
  crossBoardParentId.value = parentTaskId
  linkPickerTaskId.value = parentTaskId
}

const taskToDelete = ref<string | null>(null)
const showDeleteTaskModal = computed({
  get: () => taskToDelete.value !== null,
  set: (val: boolean) => { if (!val) taskToDelete.value = null },
})
const linkPickerTaskId = ref<string | null>(null)
const showLinkPickerModal = computed({
  get: () => linkPickerTaskId.value !== null,
  set: (val: boolean) => { if (!val) { linkPickerTaskId.value = null; crossBoardParentId.value = null } },
})

function onLinkPickerUpdated() {
  // Refresh the board data
  refresh()
  // If this was triggered from a cross-board create within subitems, refresh that row's linked tasks
  const parentId = crossBoardParentId.value || linkPickerTaskId.value
  if (parentId) {
    const rowRef = subitemRowRefs.get(parentId)
    if (rowRef?.refreshLinked) {
      rowRef.refreshLinked()
    }
  }
}

function closeLinkPicker() {
  linkPickerTaskId.value = null
  crossBoardParentId.value = null
}

function taskMenuItems(item: { id: string; title: string }, group: BoardGroup) {
  const groups = containerRef.value?.groups || []
  const moveToGroupItems = (groups as BoardGroup[])
    .filter((g) => isRealGroup(g.id) && g.id !== group.id)
    .map((g) => ({
      label: g.name,
      icon: 'i-lucide-folder' as const,
      onSelect: () => moveTaskToGroup(item.id, g.id),
    }))

  return [
    [
      { label: 'Open', icon: 'i-lucide-external-link' as const, onSelect: () => openTask(item.id) },
      { label: 'Add subtask', icon: 'i-lucide-list-plus' as const, onSelect: () => startAddSubitem(item.id) },
      { label: 'Link to task...', icon: 'i-lucide-link-2' as const, onSelect: () => { linkPickerTaskId.value = item.id } },
    ],
    [
      { label: 'Copy IDE prompt', icon: 'i-lucide-terminal-square' as const, onSelect: () => openIdePrompt(item.id) },
      { label: 'Duplicate', icon: 'i-lucide-copy' as const, onSelect: () => duplicateTask(item.id) },
      ...(moveToGroupItems.length > 0 ? [{
        label: 'Move to group',
        icon: 'i-lucide-arrow-right' as const,
        children: moveToGroupItems,
      }] : []),
    ],
    [
      { label: 'Delete', icon: 'i-lucide-trash-2' as const, color: 'error' as const, onSelect: () => { taskToDelete.value = item.id } },
    ],
  ]
}

const idePromptOpen = ref(false)
const idePromptTaskId = ref<string | null>(null)
function openIdePrompt(taskId: string) {
  idePromptTaskId.value = taskId
  idePromptOpen.value = true
}

function startAddSubitem(taskId: string) {
  if (!subitemHelper.isExpanded(taskId)) {
    subitemHelper.toggleExpand(taskId, resolvedBoardId.value)
  }
}

async function duplicateTask(taskId: string) {
  try {
    await $fetch(`/api/agency/tasks/${taskId}/duplicate`, { method: 'POST' })
    await refresh()
    toast.add({ title: 'Task duplicated', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to duplicate', description: err.data?.statusMessage, color: 'error' })
  }
}

async function moveTaskToGroup(taskId: string, groupId: string) {
  try {
    await $fetch(`/api/agency/tasks/${taskId}`, {
      method: 'PUT',
      body: { groupId },
    })
    await refresh()
    toast.add({ title: 'Task moved', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to move task', color: 'error' })
  }
}

async function executeDeleteTask() {
  if (!taskToDelete.value) return
  try {
    await $fetch(`/api/agency/tasks/${taskToDelete.value}`, { method: 'DELETE' })
    taskToDelete.value = null
    // Reset subitems cache so counts and lists refresh
    subitemHelper.reset()
    await refresh()
    toast.add({ title: 'Task deleted', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to delete task', color: 'error' })
  }
}

function columnMenuItems(col: BoardColumn) {
  return [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openColumnConfig(col) },
    { label: 'Sort', icon: 'i-lucide-arrow-up-down' },
    { label: 'Filter', icon: 'i-lucide-filter' },
    { type: 'separator' as const },
    { label: 'Hide', icon: 'i-lucide-eye-off', onSelect: () => hideColumn(col.id) },
    { type: 'separator' as const },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { showDeleteConfirm.value = col.id } },
  ]
}

const resizingColumnId = ref<string | null>(null)

// --- Item column width (resizable, persisted per-board to localStorage) ---
const ITEM_COL_DEFAULT = 320
const ITEM_COL_MIN = 180
const ITEM_COL_MAX = 800
const itemColWidth = ref(ITEM_COL_DEFAULT)
const resizingItemCol = ref(false)
provide('itemColWidth', itemColWidth)

function itemColStorageKey() {
  return `board:${boardId.value}:itemColWidth`
}

watch(boardId, () => {
  if (typeof window === 'undefined') return
  const stored = window.localStorage.getItem(itemColStorageKey())
  const parsed = stored ? parseInt(stored, 10) : NaN
  itemColWidth.value = Number.isFinite(parsed) ? Math.max(ITEM_COL_MIN, Math.min(ITEM_COL_MAX, parsed)) : ITEM_COL_DEFAULT
}, { immediate: true })

function onItemColResizeStart(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()

  const startX = event.clientX
  const startWidth = itemColWidth.value
  resizingItemCol.value = true

  function onMove(ev: MouseEvent) {
    itemColWidth.value = Math.max(ITEM_COL_MIN, Math.min(ITEM_COL_MAX, startWidth + (ev.clientX - startX)))
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    resizingItemCol.value = false
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(itemColStorageKey(), String(itemColWidth.value))
    }
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onColumnResizeStart(event: MouseEvent, col: BoardColumn) {
  event.preventDefault()
  event.stopPropagation()

  const startX = event.clientX
  const startWidth = col.width || 150
  resizingColumnId.value = col.id

  function onMove(ev: MouseEvent) {
    const newWidth = Math.max(80, Math.min(800, startWidth + (ev.clientX - startX)))
    ;(col as any).width = newWidth
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    const finalWidth = col.width || 150
    resizingColumnId.value = null
    if (finalWidth !== startWidth) {
      containerRef.value?.resizeColumn?.(col.id, finalWidth)
    }
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function openColumnConfig(col: BoardColumn) {
  editingColumn.value = col
  showColumnConfig.value = true
}

async function hideColumn(columnId: string) {
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/columns/${columnId}`, {
      method: 'PATCH',
      body: { isVisible: false },
    })
    refreshColumns()
  } catch (err: any) {
    toast.add({ title: 'Failed to hide column', color: 'error' })
  }
}

async function handleColumnSave(columnId: string, payload: any) {
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/columns/${columnId}`, {
      method: 'PATCH',
      body: payload,
    })
    refreshColumns()
    toast.add({ title: 'Column updated', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to update column', color: 'error' })
  }
}

async function handleColumnDelete(columnId: string | undefined) {
  if (!columnId) return
  showColumnConfig.value = false
  showDeleteConfirm.value = columnId
}

async function handleAddOption(columnId: string, payload: { label: string; color: string }) {
  try {
    await $fetch(`/api/agency/columns/${columnId}/options`, {
      method: 'POST',
      body: payload,
    })
    await refreshColumns()
  } catch (err: any) {
    toast.add({ title: 'Failed to add option', color: 'error' })
  }
}

async function handleUpdateOption(columnId: string, optionId: string, payload: any) {
  try {
    await $fetch(`/api/agency/columns/${columnId}/options/${optionId}`, {
      method: 'PATCH',
      body: payload,
    })
    refreshColumns()
  } catch (err: any) {
    toast.add({ title: 'Failed to update option', color: 'error' })
  }
}

async function confirmDeleteColumn() {
  if (!showDeleteConfirm.value) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/columns/${showDeleteConfirm.value}`, {
      method: 'DELETE',
    })
    showDeleteConfirm.value = null
    refreshColumns()
  } catch (err) {
    console.error('Failed to delete column:', err)
  }
}

// --- Group Drag & Drop ---

const dragState = reactive({
  dragGroupId: null as string | null,
  dragGroupIndex: -1,
  dropTargetIndex: -1,
})

function isRealGroup(groupId: string): boolean {
  return groupId !== '__ungrouped__' && !groupId.startsWith('grouped_') && isUUID(groupId)
}

function onGroupDragStart(event: DragEvent, groupId: string, index: number) {
  dragState.dragGroupId = groupId
  dragState.dragGroupIndex = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', groupId)
  }
}

function onGroupDragOver(event: DragEvent, targetIndex: number) {
  if (!dragState.dragGroupId) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragState.dropTargetIndex = targetIndex
}

function onGroupDragLeave() {
  // Only clear if we leave the group area entirely (not entering a child)
  // The dropTargetIndex will be updated by the next dragover
}

function onGroupDragEnd() {
  dragState.dragGroupId = null
  dragState.dragGroupIndex = -1
  dragState.dropTargetIndex = -1
}

async function onGroupDrop(groups: any[]) {
  const { dragGroupId, dragGroupIndex, dropTargetIndex } = dragState
  onGroupDragEnd()

  if (!dragGroupId || dragGroupIndex === dropTargetIndex || dropTargetIndex === -1) return

  // Build reordered group IDs (only real groups)
  const realGroups = groups.filter((g: any) => isRealGroup(g.id))
  const currentIds = realGroups.map((g: any) => g.id)

  const fromIndex = currentIds.indexOf(dragGroupId)
  if (fromIndex === -1) return

  // Calculate target index in the real groups array
  const targetGroup = groups[dropTargetIndex]
  let toIndex = currentIds.indexOf(targetGroup?.id)
  if (toIndex === -1) toIndex = currentIds.length - 1

  // Move the group
  const newIds = [...currentIds]
  newIds.splice(fromIndex, 1)
  newIds.splice(toIndex, 0, dragGroupId)

  try {
    await $fetch(`/api/agency/boards/${boardId.value}/groups/reorder`, {
      method: 'PATCH',
      body: { groupIds: newIds },
    })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to reorder groups', color: 'error' })
  }
}

// --- Group Actions ---

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

const loadingGroups = ref<Set<string>>(new Set())

async function toggleGroup(group: BoardGroup) {
  // Dynamic groups (from group-by) use local collapse tracking
  if (group.id.startsWith('grouped_')) {
    containerRef.value?.toggleGroupExpanded(group.id)
    return
  }
  // Use composable's toggleGroupExpanded to persist state across refreshes
  const willExpand = !group.isExpanded
  containerRef.value?.toggleGroupExpanded(group.id, willExpand)
  // Persist collapse state to server for real board_groups (UUID IDs)
  if (group.id !== '__ungrouped__' && isUUID(group.id)) {
    $fetch(`/api/agency/boards/${boardId.value}/groups/${group.id}`, {
      method: 'PATCH',
      body: { isCollapsed: !willExpand },
    }).catch(() => {})
  }
  // Load items on expand if group was server-collapsed (items empty but totalCount > 0)
  if (willExpand && group.items.length === 0 && (group.totalCount ?? 0) > 0) {
    await loadGroupItems(group)
  }
}

async function loadGroupItems(group: BoardGroup, offset = 0, limit = 50) {
  const key = `${group.id}:${offset}`
  if (loadingGroups.value.has(key)) return
  loadingGroups.value = new Set([...loadingGroups.value, key])
  try {
    const result = await $fetch<{ items: any[]; totalCount: number; hasMore: boolean }>(
      `/api/agency/boards/${boardId.value}/groups/${group.id}/items`,
      { params: { offset, limit } }
    )
    // Store in cache (persists across data refreshes)
    containerRef.value?.updateGroupItemsCache(
      group.id,
      result.items,
      result.totalCount,
      result.hasMore,
      offset > 0, // append for "load more"
    )
  } catch (err) {
    console.error('Failed to load group items:', err)
  } finally {
    const next = new Set(loadingGroups.value)
    next.delete(key)
    loadingGroups.value = next
  }
}

async function renameGroup(groupId: string, name: string) {
  if (groupId === '__ungrouped__' || groupId.startsWith('grouped_') || !isUUID(groupId)) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/groups/${groupId}`, {
      method: 'PATCH',
      body: { name },
    })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to rename group', color: 'error' })
  }
}

async function updateGroupColor(groupId: string, color: string) {
  if (groupId === '__ungrouped__' || groupId.startsWith('grouped_') || !isUUID(groupId)) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/groups/${groupId}`, {
      method: 'PATCH',
      body: { color },
    })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update group color', color: 'error' })
  }
}

function deleteGroup(groupId: string) {
  if (groupId === '__ungrouped__' || groupId.startsWith('grouped_')) return
  deleteGroupId.value = groupId
}

async function confirmDeleteGroup() {
  if (!deleteGroupId.value) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/groups/${deleteGroupId.value}`, {
      method: 'DELETE',
    })
    deleteGroupId.value = null
    await refresh()
    toast.add({ title: 'Group deleted', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to delete group', color: 'error' })
  }
}

async function handleAddGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/groups`, {
      method: 'POST',
      body: { name, color: newGroupColor.value },
    })
    newGroupName.value = ''
    newGroupColor.value = '#579BFC'
    showAddGroup.value = false
    await refresh()
    toast.add({ title: 'Group created', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to create group', color: 'error' })
  }
}

async function addGroupNear(_groupId: string, _position: 'above' | 'below') {
  newGroupName.value = ''
  newGroupColor.value = '#579BFC'
  showAddGroup.value = true
}

// --- Export & Templates ---

async function handleApplyTemplate(templateId: string) {
  try {
    const result = await $fetch<{ success: boolean; templateName: string; created: { columns: number; groups: number; views: number } }>(`/api/agency/boards/templates/${templateId}/apply`, {
      method: 'POST',
      body: { departmentId: containerRef.value?.board?.id || boardId.value },
    })
    toast.add({
      title: 'Template applied',
      description: `Added ${result.created.columns} columns and ${result.created.groups} groups`,
      color: 'success',
    })
    await refresh()
    refreshColumns()
  } catch (err: any) {
    toast.add({
      title: 'Failed to apply template',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  }
}

// --- Formatting ---

function formatDate(date: string | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
</script>
