import { c as useToast, e as useFetch, d as _sfc_main$9, a as _sfc_main$c$1 } from './server.mjs';
import { _ as _sfc_main$d } from './Badge-BfrefdmG.mjs';
import { _ as _sfc_main$6 } from './DropdownMenu-DtfLDXzs.mjs';
import { _ as _sfc_main$c } from './Checkbox-wFRNthBN.mjs';
import { _ as _sfc_main$1$1, a as _sfc_main$a } from './DashboardNavbar-Dma8e2D0.mjs';
import { _ as _sfc_main$b } from './DashboardSidebarCollapse-Bb0ddWxH.mjs';
import { _ as _sfc_main$e } from './Modal-Dnvi62H3.mjs';
import { _ as _sfc_main$f } from './Form-gO420aMi.mjs';
import { _ as _sfc_main$g } from './FormField-DDRuR3fR.mjs';
import { _ as _sfc_main$3 } from './Input-Bc3-FTjC.mjs';
import { defineComponent, useTemplateRef, ref, withAsyncContext, watch, mergeProps, withCtx, unref, createTextVNode, toDisplayString, createVNode, createBlock, createCommentVNode, openBlock, isRef, h, renderSlot, reactive, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrInterpolate, ssrRenderSlot } from 'vue/server-renderer';
import * as z from 'zod';
import { _ as _sfc_main$4 } from './Kbd-8hyXBZ7D.mjs';
import { _ as _sfc_main$5 } from './Select-E0Bpi0Ij.mjs';
import { _ as _sfc_main$7 } from './Table-DItj4AHg.mjs';
import { _ as _sfc_main$8 } from './Pagination-UGRk5evm.mjs';
import { _ as upperFirst } from '../nitro/nitro.mjs';
import { getPaginationRowModel } from '@tanstack/table-core';
import 'vue-router';
import '@vue/shared';
import 'perfect-debounce';
import 'tailwindcss/colors';
import '@iconify/vue';
import 'reka-ui';
import 'tailwind-variants';
import '@iconify/utils/lib/css/icon';
import '../routes/renderer.mjs';
import 'vue-bundle-renderer/runtime';
import 'unhead/server';
import 'devalue';
import 'unhead/plugins';
import 'unhead/utils';
import 'xero-node';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';
import 'reka-ui/namespaced';
import './index-Btsu36yb.mjs';
import './DashboardSidebarToggle-NWn7wtB9.mjs';
import '@tanstack/vue-table';

const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "AddModal",
  __ssrInlineRender: true,
  setup(__props) {
    const schema = z.object({
      name: z.string().min(2, "Too short"),
      email: z.string().email("Invalid email")
    });
    const open = ref(false);
    const state = reactive({
      name: void 0,
      email: void 0
    });
    const toast = useToast();
    async function onSubmit(event) {
      toast.add({ title: "Success", description: `New customer ${event.data.name} added`, color: "success" });
      open.value = false;
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UModal = _sfc_main$e;
      const _component_UButton = _sfc_main$9;
      const _component_UForm = _sfc_main$f;
      const _component_UFormField = _sfc_main$g;
      const _component_UInput = _sfc_main$3;
      _push(ssrRenderComponent(_component_UModal, mergeProps({
        open: unref(open),
        "onUpdate:open": ($event) => isRef(open) ? open.value = $event : null,
        title: "New customer",
        description: "Add a new customer to the database"
      }, _attrs), {
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UForm, {
              schema: unref(schema),
              state: unref(state),
              class: "space-y-4",
              onSubmit
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UFormField, {
                    label: "Name",
                    placeholder: "John Doe",
                    name: "name"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UInput, {
                          modelValue: unref(state).name,
                          "onUpdate:modelValue": ($event) => unref(state).name = $event,
                          class: "w-full"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UInput, {
                            modelValue: unref(state).name,
                            "onUpdate:modelValue": ($event) => unref(state).name = $event,
                            class: "w-full"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UFormField, {
                    label: "Email",
                    placeholder: "john.doe@example.com",
                    name: "email"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UInput, {
                          modelValue: unref(state).email,
                          "onUpdate:modelValue": ($event) => unref(state).email = $event,
                          class: "w-full"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UInput, {
                            modelValue: unref(state).email,
                            "onUpdate:modelValue": ($event) => unref(state).email = $event,
                            class: "w-full"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(`<div class="flex justify-end gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Cancel",
                    color: "neutral",
                    variant: "subtle",
                    onClick: ($event) => open.value = false
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Create",
                    color: "primary",
                    variant: "solid",
                    type: "submit"
                  }, null, _parent3, _scopeId2));
                  _push3(`</div>`);
                } else {
                  return [
                    createVNode(_component_UFormField, {
                      label: "Name",
                      placeholder: "John Doe",
                      name: "name"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UInput, {
                          modelValue: unref(state).name,
                          "onUpdate:modelValue": ($event) => unref(state).name = $event,
                          class: "w-full"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UFormField, {
                      label: "Email",
                      placeholder: "john.doe@example.com",
                      name: "email"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UInput, {
                          modelValue: unref(state).email,
                          "onUpdate:modelValue": ($event) => unref(state).email = $event,
                          class: "w-full"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode("div", { class: "flex justify-end gap-2" }, [
                      createVNode(_component_UButton, {
                        label: "Cancel",
                        color: "neutral",
                        variant: "subtle",
                        onClick: ($event) => open.value = false
                      }, null, 8, ["onClick"]),
                      createVNode(_component_UButton, {
                        label: "Create",
                        color: "primary",
                        variant: "solid",
                        type: "submit"
                      })
                    ])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UForm, {
                schema: unref(schema),
                state: unref(state),
                class: "space-y-4",
                onSubmit
              }, {
                default: withCtx(() => [
                  createVNode(_component_UFormField, {
                    label: "Name",
                    placeholder: "John Doe",
                    name: "name"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UInput, {
                        modelValue: unref(state).name,
                        "onUpdate:modelValue": ($event) => unref(state).name = $event,
                        class: "w-full"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UFormField, {
                    label: "Email",
                    placeholder: "john.doe@example.com",
                    name: "email"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UInput, {
                        modelValue: unref(state).email,
                        "onUpdate:modelValue": ($event) => unref(state).email = $event,
                        class: "w-full"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode("div", { class: "flex justify-end gap-2" }, [
                    createVNode(_component_UButton, {
                      label: "Cancel",
                      color: "neutral",
                      variant: "subtle",
                      onClick: ($event) => open.value = false
                    }, null, 8, ["onClick"]),
                    createVNode(_component_UButton, {
                      label: "Create",
                      color: "primary",
                      variant: "solid",
                      type: "submit"
                    })
                  ])
                ]),
                _: 1
              }, 8, ["schema", "state"])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UButton, {
              label: "New customer",
              icon: "i-lucide-plus"
            }, null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UButton, {
                label: "New customer",
                icon: "i-lucide-plus"
              })
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/customers/AddModal.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const __nuxt_component_8 = Object.assign(_sfc_main$2, { __name: "CustomersAddModal" });
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "DeleteModal",
  __ssrInlineRender: true,
  props: {
    count: { default: 0 }
  },
  setup(__props) {
    const open = ref(false);
    async function onSubmit() {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      open.value = false;
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UModal = _sfc_main$e;
      const _component_UButton = _sfc_main$9;
      _push(ssrRenderComponent(_component_UModal, mergeProps({
        open: unref(open),
        "onUpdate:open": ($event) => isRef(open) ? open.value = $event : null,
        title: `Delete ${_ctx.count} customer${_ctx.count > 1 ? "s" : ""}`,
        description: `Are you sure, this action cannot be undone.`
      }, _attrs), {
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex justify-end gap-2"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UButton, {
              label: "Cancel",
              color: "neutral",
              variant: "subtle",
              onClick: ($event) => open.value = false
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UButton, {
              label: "Delete",
              color: "error",
              variant: "solid",
              "loading-auto": "",
              onClick: onSubmit
            }, null, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", { class: "flex justify-end gap-2" }, [
                createVNode(_component_UButton, {
                  label: "Cancel",
                  color: "neutral",
                  variant: "subtle",
                  onClick: ($event) => open.value = false
                }, null, 8, ["onClick"]),
                createVNode(_component_UButton, {
                  label: "Delete",
                  color: "error",
                  variant: "solid",
                  "loading-auto": "",
                  onClick: onSubmit
                })
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "default", {}, null, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "default")
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/customers/DeleteModal.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const __nuxt_component_10 = Object.assign(_sfc_main$1, { __name: "CustomersDeleteModal" });
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "customers",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const UAvatar = _sfc_main$c$1;
    const UButton = _sfc_main$9;
    const UBadge = _sfc_main$d;
    const UDropdownMenu = _sfc_main$6;
    const UCheckbox = _sfc_main$c;
    const toast = useToast();
    const table = useTemplateRef("table");
    const columnFilters = ref([{
      id: "email",
      value: ""
    }]);
    const columnVisibility = ref();
    const rowSelection = ref({ 1: true });
    const { data, status } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/customers", {
      lazy: true
    }, "$6qzunmRhlq")), __temp = await __temp, __restore(), __temp);
    function getRowItems(row) {
      return [
        {
          type: "label",
          label: "Actions"
        },
        {
          label: "Copy customer ID",
          icon: "i-lucide-copy",
          onSelect() {
            (void 0).clipboard.writeText(row.original.id.toString());
            toast.add({
              title: "Copied to clipboard",
              description: "Customer ID copied to clipboard"
            });
          }
        },
        {
          type: "separator"
        },
        {
          label: "View customer details",
          icon: "i-lucide-list"
        },
        {
          label: "View customer payments",
          icon: "i-lucide-wallet"
        },
        {
          type: "separator"
        },
        {
          label: "Delete customer",
          icon: "i-lucide-trash",
          color: "error",
          onSelect() {
            toast.add({
              title: "Customer deleted",
              description: "The customer has been deleted."
            });
          }
        }
      ];
    }
    const columns = [
      {
        id: "select",
        header: ({ table: table2 }) => h(UCheckbox, {
          "modelValue": table2.getIsSomePageRowsSelected() ? "indeterminate" : table2.getIsAllPageRowsSelected(),
          "onUpdate:modelValue": (value) => table2.toggleAllPageRowsSelected(!!value),
          "ariaLabel": "Select all"
        }),
        cell: ({ row }) => h(UCheckbox, {
          "modelValue": row.getIsSelected(),
          "onUpdate:modelValue": (value) => row.toggleSelected(!!value),
          "ariaLabel": "Select row"
        })
      },
      {
        accessorKey: "id",
        header: "ID"
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          return h("div", { class: "flex items-center gap-3" }, [
            h(UAvatar, {
              ...row.original.avatar,
              size: "lg"
            }),
            h("div", void 0, [
              h("p", { class: "font-medium text-highlighted" }, row.original.name),
              h("p", { class: "" }, `@${row.original.name}`)
            ])
          ]);
        }
      },
      {
        accessorKey: "email",
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          return h(UButton, {
            color: "neutral",
            variant: "ghost",
            label: "Email",
            icon: isSorted ? isSorted === "asc" ? "i-lucide-arrow-up-narrow-wide" : "i-lucide-arrow-down-wide-narrow" : "i-lucide-arrow-up-down",
            class: "-mx-2.5",
            onClick: () => column.toggleSorting(column.getIsSorted() === "asc")
          });
        }
      },
      {
        accessorKey: "location",
        header: "Location",
        cell: ({ row }) => row.original.location
      },
      {
        accessorKey: "status",
        header: "Status",
        filterFn: "equals",
        cell: ({ row }) => {
          const color = {
            subscribed: "success",
            unsubscribed: "error",
            bounced: "warning"
          }[row.original.status];
          return h(
            UBadge,
            { class: "capitalize", variant: "subtle", color },
            () => row.original.status
          );
        }
      },
      {
        id: "actions",
        cell: ({ row }) => {
          return h(
            "div",
            { class: "text-right" },
            h(
              UDropdownMenu,
              {
                content: {
                  align: "end"
                },
                items: getRowItems(row)
              },
              () => h(UButton, {
                icon: "i-lucide-ellipsis-vertical",
                color: "neutral",
                variant: "ghost",
                class: "ml-auto"
              })
            )
          );
        }
      }
    ];
    const statusFilter = ref("all");
    watch(() => statusFilter.value, (newVal) => {
      if (!table?.value?.tableApi) return;
      const statusColumn = table.value.tableApi.getColumn("status");
      if (!statusColumn) return;
      if (newVal === "all") {
        statusColumn.setFilterValue(void 0);
      } else {
        statusColumn.setFilterValue(newVal);
      }
    });
    const pagination = ref({
      pageIndex: 0,
      pageSize: 10
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$1$1;
      const _component_UDashboardNavbar = _sfc_main$a;
      const _component_UDashboardSidebarCollapse = _sfc_main$b;
      const _component_CustomersAddModal = __nuxt_component_8;
      const _component_UInput = _sfc_main$3;
      const _component_CustomersDeleteModal = __nuxt_component_10;
      const _component_UKbd = _sfc_main$4;
      const _component_USelect = _sfc_main$5;
      const _component_UTable = _sfc_main$7;
      const _component_UPagination = _sfc_main$8;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "customers" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, { title: "Customers" }, {
              leading: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UDashboardSidebarCollapse, null, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UDashboardSidebarCollapse)
                  ];
                }
              }),
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_CustomersAddModal, null, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_CustomersAddModal)
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, { title: "Customers" }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                right: withCtx(() => [
                  createVNode(_component_CustomersAddModal)
                ]),
                _: 1
              })
            ];
          }
        }),
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex flex-wrap items-center justify-between gap-1.5"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UInput, {
              "model-value": unref(table)?.tableApi?.getColumn("email")?.getFilterValue(),
              class: "max-w-sm",
              icon: "i-lucide-search",
              placeholder: "Filter emails...",
              "onUpdate:modelValue": ($event) => unref(table)?.tableApi?.getColumn("email")?.setFilterValue($event)
            }, null, _parent2, _scopeId));
            _push2(`<div class="flex flex-wrap items-center gap-1.5"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_CustomersDeleteModal, {
              count: unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  if (unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length) {
                    _push3(ssrRenderComponent(unref(UButton), {
                      label: "Delete",
                      color: "error",
                      variant: "subtle",
                      icon: "i-lucide-trash"
                    }, {
                      trailing: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_component_UKbd, null, {
                            default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`${ssrInterpolate(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length)}`);
                              } else {
                                return [
                                  createTextVNode(toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length), 1)
                                ];
                              }
                            }),
                            _: 1
                          }, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_component_UKbd, null, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length), 1)
                              ]),
                              _: 1
                            })
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                } else {
                  return [
                    unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length ? (openBlock(), createBlock(unref(UButton), {
                      key: 0,
                      label: "Delete",
                      color: "error",
                      variant: "subtle",
                      icon: "i-lucide-trash"
                    }, {
                      trailing: withCtx(() => [
                        createVNode(_component_UKbd, null, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length), 1)
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })) : createCommentVNode("", true)
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_USelect, {
              modelValue: unref(statusFilter),
              "onUpdate:modelValue": ($event) => isRef(statusFilter) ? statusFilter.value = $event : null,
              items: [
                { label: "All", value: "all" },
                { label: "Subscribed", value: "subscribed" },
                { label: "Unsubscribed", value: "unsubscribed" },
                { label: "Bounced", value: "bounced" }
              ],
              ui: { trailingIcon: "group-data-[state=open]:rotate-180 transition-transform duration-200" },
              placeholder: "Filter status",
              class: "min-w-28"
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(unref(UDropdownMenu), {
              items: unref(table)?.tableApi?.getAllColumns().filter((column) => column.getCanHide()).map((column) => ({
                label: unref(upperFirst)(column.id),
                type: "checkbox",
                checked: column.getIsVisible(),
                onUpdateChecked(checked) {
                  unref(table)?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked);
                },
                onSelect(e) {
                  e?.preventDefault();
                }
              })),
              content: { align: "end" }
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(unref(UButton), {
                    label: "Display",
                    color: "neutral",
                    variant: "outline",
                    "trailing-icon": "i-lucide-settings-2"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(unref(UButton), {
                      label: "Display",
                      color: "neutral",
                      variant: "outline",
                      "trailing-icon": "i-lucide-settings-2"
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(`</div></div>`);
            _push2(ssrRenderComponent(_component_UTable, {
              ref_key: "table",
              ref: table,
              "column-filters": unref(columnFilters),
              "onUpdate:columnFilters": ($event) => isRef(columnFilters) ? columnFilters.value = $event : null,
              "column-visibility": unref(columnVisibility),
              "onUpdate:columnVisibility": ($event) => isRef(columnVisibility) ? columnVisibility.value = $event : null,
              "row-selection": unref(rowSelection),
              "onUpdate:rowSelection": ($event) => isRef(rowSelection) ? rowSelection.value = $event : null,
              pagination: unref(pagination),
              "onUpdate:pagination": ($event) => isRef(pagination) ? pagination.value = $event : null,
              "pagination-options": {
                getPaginationRowModel: unref(getPaginationRowModel)()
              },
              class: "shrink-0",
              data: unref(data),
              columns,
              loading: unref(status) === "pending",
              ui: {
                base: "table-fixed border-separate border-spacing-0",
                thead: "[&>tr]:bg-elevated/50 [&>tr]:after:content-none",
                tbody: "[&>tr]:last:[&>td]:border-b-0",
                th: "py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r",
                td: "border-b border-default"
              }
            }, null, _parent2, _scopeId));
            _push2(`<div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto"${_scopeId}><div class="text-sm text-muted"${_scopeId}>${ssrInterpolate(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length || 0)} of ${ssrInterpolate(unref(table)?.tableApi?.getFilteredRowModel().rows.length || 0)} row(s) selected. </div><div class="flex items-center gap-1.5"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UPagination, {
              "default-page": (unref(table)?.tableApi?.getState().pagination.pageIndex || 0) + 1,
              "items-per-page": unref(table)?.tableApi?.getState().pagination.pageSize,
              total: unref(table)?.tableApi?.getFilteredRowModel().rows.length,
              "onUpdate:page": (p) => unref(table)?.tableApi?.setPageIndex(p - 1)
            }, null, _parent2, _scopeId));
            _push2(`</div></div>`);
          } else {
            return [
              createVNode("div", { class: "flex flex-wrap items-center justify-between gap-1.5" }, [
                createVNode(_component_UInput, {
                  "model-value": unref(table)?.tableApi?.getColumn("email")?.getFilterValue(),
                  class: "max-w-sm",
                  icon: "i-lucide-search",
                  placeholder: "Filter emails...",
                  "onUpdate:modelValue": ($event) => unref(table)?.tableApi?.getColumn("email")?.setFilterValue($event)
                }, null, 8, ["model-value", "onUpdate:modelValue"]),
                createVNode("div", { class: "flex flex-wrap items-center gap-1.5" }, [
                  createVNode(_component_CustomersDeleteModal, {
                    count: unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length
                  }, {
                    default: withCtx(() => [
                      unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length ? (openBlock(), createBlock(unref(UButton), {
                        key: 0,
                        label: "Delete",
                        color: "error",
                        variant: "subtle",
                        icon: "i-lucide-trash"
                      }, {
                        trailing: withCtx(() => [
                          createVNode(_component_UKbd, null, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length), 1)
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })) : createCommentVNode("", true)
                    ]),
                    _: 1
                  }, 8, ["count"]),
                  createVNode(_component_USelect, {
                    modelValue: unref(statusFilter),
                    "onUpdate:modelValue": ($event) => isRef(statusFilter) ? statusFilter.value = $event : null,
                    items: [
                      { label: "All", value: "all" },
                      { label: "Subscribed", value: "subscribed" },
                      { label: "Unsubscribed", value: "unsubscribed" },
                      { label: "Bounced", value: "bounced" }
                    ],
                    ui: { trailingIcon: "group-data-[state=open]:rotate-180 transition-transform duration-200" },
                    placeholder: "Filter status",
                    class: "min-w-28"
                  }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                  createVNode(unref(UDropdownMenu), {
                    items: unref(table)?.tableApi?.getAllColumns().filter((column) => column.getCanHide()).map((column) => ({
                      label: unref(upperFirst)(column.id),
                      type: "checkbox",
                      checked: column.getIsVisible(),
                      onUpdateChecked(checked) {
                        unref(table)?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked);
                      },
                      onSelect(e) {
                        e?.preventDefault();
                      }
                    })),
                    content: { align: "end" }
                  }, {
                    default: withCtx(() => [
                      createVNode(unref(UButton), {
                        label: "Display",
                        color: "neutral",
                        variant: "outline",
                        "trailing-icon": "i-lucide-settings-2"
                      })
                    ]),
                    _: 1
                  }, 8, ["items"])
                ])
              ]),
              createVNode(_component_UTable, {
                ref_key: "table",
                ref: table,
                "column-filters": unref(columnFilters),
                "onUpdate:columnFilters": ($event) => isRef(columnFilters) ? columnFilters.value = $event : null,
                "column-visibility": unref(columnVisibility),
                "onUpdate:columnVisibility": ($event) => isRef(columnVisibility) ? columnVisibility.value = $event : null,
                "row-selection": unref(rowSelection),
                "onUpdate:rowSelection": ($event) => isRef(rowSelection) ? rowSelection.value = $event : null,
                pagination: unref(pagination),
                "onUpdate:pagination": ($event) => isRef(pagination) ? pagination.value = $event : null,
                "pagination-options": {
                  getPaginationRowModel: unref(getPaginationRowModel)()
                },
                class: "shrink-0",
                data: unref(data),
                columns,
                loading: unref(status) === "pending",
                ui: {
                  base: "table-fixed border-separate border-spacing-0",
                  thead: "[&>tr]:bg-elevated/50 [&>tr]:after:content-none",
                  tbody: "[&>tr]:last:[&>td]:border-b-0",
                  th: "py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r",
                  td: "border-b border-default"
                }
              }, null, 8, ["column-filters", "onUpdate:columnFilters", "column-visibility", "onUpdate:columnVisibility", "row-selection", "onUpdate:rowSelection", "pagination", "onUpdate:pagination", "pagination-options", "data", "loading"]),
              createVNode("div", { class: "flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto" }, [
                createVNode("div", { class: "text-sm text-muted" }, toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length || 0) + " of " + toDisplayString(unref(table)?.tableApi?.getFilteredRowModel().rows.length || 0) + " row(s) selected. ", 1),
                createVNode("div", { class: "flex items-center gap-1.5" }, [
                  createVNode(_component_UPagination, {
                    "default-page": (unref(table)?.tableApi?.getState().pagination.pageIndex || 0) + 1,
                    "items-per-page": unref(table)?.tableApi?.getState().pagination.pageSize,
                    total: unref(table)?.tableApi?.getFilteredRowModel().rows.length,
                    "onUpdate:page": (p) => unref(table)?.tableApi?.setPageIndex(p - 1)
                  }, null, 8, ["default-page", "items-per-page", "total", "onUpdate:page"])
                ])
              ])
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/customers.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=customers-Dn-7eOjd.mjs.map
