import { _ as _sfc_main$1$1, a as _sfc_main$7 } from './DashboardNavbar-Dma8e2D0.mjs';
import { _ as _sfc_main$b } from './DashboardSidebarCollapse-Bb0ddWxH.mjs';
import { _ as _sfc_main$8 } from './Tooltip-B1rd475P.mjs';
import { d as _sfc_main$9, b as _sfc_main$d, _ as _sfc_main$e, j as useAsyncData, h as useLocale, u as useAppConfig, i as reactiveOmit, t as tv } from './server.mjs';
import { _ as _sfc_main$a } from './DropdownMenu-DtfLDXzs.mjs';
import { _ as _sfc_main$c } from './DashboardToolbar-C9qyFRVV.mjs';
import { _ as _sfc_main$k } from './Popover-DieJ_jdv.mjs';
import { defineComponent, shallowRef, ref, mergeProps, withCtx, unref, createVNode, isRef, withAsyncContext, createTextVNode, toDisplayString, createBlock, openBlock, Fragment, renderList, h, useModel, computed, mergeModels, watch, renderSlot, createCommentVNode, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrInterpolate, ssrRenderSlot, ssrRenderClass } from 'vue/server-renderer';
import { useForwardPropsEmits } from 'reka-ui';
import { RangeCalendar, Calendar } from 'reka-ui/namespaced';
import { DateFormatter, getLocalTimeZone, CalendarDate, today } from '@internationalized/date';
import { _ as _sfc_main$l } from './Select-E0Bpi0Ij.mjs';
import { sub, eachDayOfInterval } from 'date-fns';
import { _ as _sfc_main$f } from './PageGrid-CyaRhCNm.mjs';
import { _ as _sfc_main$g } from './PageCard-BrXkocLW.mjs';
import { _ as _sfc_main$h } from './Badge-BfrefdmG.mjs';
import { _ as _sfc_main$i } from './Card-jqGRZ5Ik.mjs';
import { _ as _export_sfc } from './_plugin-vue_export-helper-1tPrXgE0.mjs';
import { _ as _sfc_main$j } from './Table-DItj4AHg.mjs';
import { u as useDashboard } from './useDashboard-DTZ5yh-t.mjs';
import './DashboardSidebarToggle-NWn7wtB9.mjs';
import './index-Btsu36yb.mjs';
import '../nitro/nitro.mjs';
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
import './Kbd-8hyXBZ7D.mjs';
import 'vue-router';
import '@vue/shared';
import 'perfect-debounce';
import 'tailwindcss/colors';
import '@iconify/vue';
import 'tailwind-variants';
import '@iconify/utils/lib/css/icon';
import '../routes/renderer.mjs';
import 'vue-bundle-renderer/runtime';
import 'unhead/server';
import 'devalue';
import 'unhead/plugins';
import 'unhead/utils';
import '@tanstack/vue-table';
import './defineShortcuts-qA-CwxU2.mjs';

const theme = {
  "slots": {
    "root": "",
    "header": "flex items-center justify-between",
    "body": "flex flex-col space-y-4 pt-4 sm:flex-row sm:space-x-4 sm:space-y-0",
    "heading": "text-center font-medium truncate mx-auto",
    "grid": "w-full border-collapse select-none space-y-1 focus:outline-none",
    "gridRow": "grid grid-cols-7 place-items-center",
    "gridWeekDaysRow": "mb-1 grid w-full grid-cols-7",
    "gridBody": "grid",
    "headCell": "rounded-md",
    "cell": "relative text-center",
    "cellTrigger": [
      "m-0.5 relative flex items-center justify-center rounded-full whitespace-nowrap focus-visible:ring-2 focus:outline-none data-disabled:text-muted data-unavailable:line-through data-unavailable:text-muted data-unavailable:pointer-events-none data-[selected]:text-inverted data-today:font-semibold data-[outside-view]:text-muted",
      "transition"
    ]
  },
  "variants": {
    "color": {
      "primary": {
        "headCell": "text-primary",
        "cellTrigger": "focus-visible:ring-primary data-[selected]:bg-primary data-today:not-data-[selected]:text-primary data-[highlighted]:bg-primary/20 hover:not-data-[selected]:bg-primary/20"
      },
      "secondary": {
        "headCell": "text-secondary",
        "cellTrigger": "focus-visible:ring-secondary data-[selected]:bg-secondary data-today:not-data-[selected]:text-secondary data-[highlighted]:bg-secondary/20 hover:not-data-[selected]:bg-secondary/20"
      },
      "success": {
        "headCell": "text-success",
        "cellTrigger": "focus-visible:ring-success data-[selected]:bg-success data-today:not-data-[selected]:text-success data-[highlighted]:bg-success/20 hover:not-data-[selected]:bg-success/20"
      },
      "info": {
        "headCell": "text-info",
        "cellTrigger": "focus-visible:ring-info data-[selected]:bg-info data-today:not-data-[selected]:text-info data-[highlighted]:bg-info/20 hover:not-data-[selected]:bg-info/20"
      },
      "warning": {
        "headCell": "text-warning",
        "cellTrigger": "focus-visible:ring-warning data-[selected]:bg-warning data-today:not-data-[selected]:text-warning data-[highlighted]:bg-warning/20 hover:not-data-[selected]:bg-warning/20"
      },
      "error": {
        "headCell": "text-error",
        "cellTrigger": "focus-visible:ring-error data-[selected]:bg-error data-today:not-data-[selected]:text-error data-[highlighted]:bg-error/20 hover:not-data-[selected]:bg-error/20"
      },
      "neutral": {
        "headCell": "text-highlighted",
        "cellTrigger": "focus-visible:ring-inverted data-[selected]:bg-inverted data-today:not-data-[selected]:text-highlighted data-[highlighted]:bg-inverted/20 hover:not-data-[selected]:bg-inverted/10"
      }
    },
    "size": {
      "xs": {
        "heading": "text-xs",
        "cell": "text-xs",
        "headCell": "text-[10px]",
        "cellTrigger": "size-7",
        "body": "space-y-2 pt-2"
      },
      "sm": {
        "heading": "text-xs",
        "headCell": "text-xs",
        "cell": "text-xs",
        "cellTrigger": "size-7"
      },
      "md": {
        "heading": "text-sm",
        "headCell": "text-xs",
        "cell": "text-sm",
        "cellTrigger": "size-8"
      },
      "lg": {
        "heading": "text-md",
        "headCell": "text-md",
        "cellTrigger": "size-9 text-md"
      },
      "xl": {
        "heading": "text-lg",
        "headCell": "text-lg",
        "cellTrigger": "size-10 text-lg"
      }
    }
  },
  "defaultVariants": {
    "size": "md",
    "color": "primary"
  }
};
const _sfc_main$6 = {
  __name: "UCalendar",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    nextYearIcon: { type: [String, Object], required: false },
    nextYear: { type: Object, required: false },
    nextMonthIcon: { type: [String, Object], required: false },
    nextMonth: { type: Object, required: false },
    prevYearIcon: { type: [String, Object], required: false },
    prevYear: { type: Object, required: false },
    prevMonthIcon: { type: [String, Object], required: false },
    prevMonth: { type: Object, required: false },
    color: { type: null, required: false },
    size: { type: null, required: false },
    range: { type: Boolean, required: false },
    multiple: { type: Boolean, required: false },
    monthControls: { type: Boolean, required: false, default: true },
    yearControls: { type: Boolean, required: false, default: true },
    defaultValue: { type: null, required: false },
    modelValue: { type: null, required: false },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    defaultPlaceholder: { type: null, required: false },
    placeholder: { type: null, required: false },
    allowNonContiguousRanges: { type: Boolean, required: false },
    pagedNavigation: { type: Boolean, required: false },
    preventDeselect: { type: Boolean, required: false },
    maximumDays: { type: Number, required: false },
    weekStartsOn: { type: Number, required: false },
    weekdayFormat: { type: String, required: false },
    fixedWeeks: { type: Boolean, required: false, default: true },
    maxValue: { type: null, required: false },
    minValue: { type: null, required: false },
    numberOfMonths: { type: Number, required: false },
    disabled: { type: Boolean, required: false },
    readonly: { type: Boolean, required: false },
    initialFocus: { type: Boolean, required: false },
    isDateDisabled: { type: Function, required: false },
    isDateUnavailable: { type: Function, required: false },
    isDateHighlightable: { type: Function, required: false },
    nextPage: { type: Function, required: false },
    prevPage: { type: Function, required: false },
    disableDaysOutsideCurrentView: { type: Boolean, required: false },
    fixedDate: { type: String, required: false }
  },
  emits: ["update:modelValue", "update:placeholder", "update:validModelValue", "update:startValue"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const { code: locale, dir, t } = useLocale();
    const appConfig = useAppConfig();
    const rootProps = useForwardPropsEmits(reactiveOmit(props, "range", "modelValue", "defaultValue", "color", "size", "monthControls", "yearControls", "class", "ui"), emits);
    const nextYearIcon = computed(() => props.nextYearIcon || (dir.value === "rtl" ? appConfig.ui.icons.chevronDoubleLeft : appConfig.ui.icons.chevronDoubleRight));
    const nextMonthIcon = computed(() => props.nextMonthIcon || (dir.value === "rtl" ? appConfig.ui.icons.chevronLeft : appConfig.ui.icons.chevronRight));
    const prevYearIcon = computed(() => props.prevYearIcon || (dir.value === "rtl" ? appConfig.ui.icons.chevronDoubleRight : appConfig.ui.icons.chevronDoubleLeft));
    const prevMonthIcon = computed(() => props.prevMonthIcon || (dir.value === "rtl" ? appConfig.ui.icons.chevronRight : appConfig.ui.icons.chevronLeft));
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.calendar || {} })({
      color: props.color,
      size: props.size
    }));
    function paginateYear(date, sign) {
      if (sign === -1) {
        return date.subtract({ years: 1 });
      }
      return date.add({ years: 1 });
    }
    const Calendar$1 = computed(() => props.range ? RangeCalendar : Calendar);
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(Calendar$1).Root, mergeProps(unref(rootProps), {
        "model-value": __props.modelValue,
        "default-value": __props.defaultValue,
        locale: unref(locale),
        dir: unref(dir),
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }, _attrs), {
        default: withCtx(({ weekDays, grid }, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(unref(Calendar$1).Header, {
              class: ui.value.header({ class: props.ui?.header })
            }, {
              default: withCtx((_, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  if (props.yearControls) {
                    _push3(ssrRenderComponent(unref(Calendar$1).Prev, {
                      "prev-page": (date) => paginateYear(date, -1),
                      "aria-label": unref(t)("calendar.prevYear"),
                      "as-child": ""
                    }, {
                      default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_sfc_main$9, mergeProps({
                            icon: prevYearIcon.value,
                            size: props.size,
                            color: "neutral",
                            variant: "ghost"
                          }, props.prevYear), null, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_sfc_main$9, mergeProps({
                              icon: prevYearIcon.value,
                              size: props.size,
                              color: "neutral",
                              variant: "ghost"
                            }, props.prevYear), null, 16, ["icon", "size"])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  if (props.monthControls) {
                    _push3(ssrRenderComponent(unref(Calendar$1).Prev, {
                      "aria-label": unref(t)("calendar.prevMonth"),
                      "as-child": ""
                    }, {
                      default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_sfc_main$9, mergeProps({
                            icon: prevMonthIcon.value,
                            size: props.size,
                            color: "neutral",
                            variant: "ghost"
                          }, props.prevMonth), null, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_sfc_main$9, mergeProps({
                              icon: prevMonthIcon.value,
                              size: props.size,
                              color: "neutral",
                              variant: "ghost"
                            }, props.prevMonth), null, 16, ["icon", "size"])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  _push3(ssrRenderComponent(unref(Calendar$1).Heading, {
                    class: ui.value.heading({ class: props.ui?.heading })
                  }, {
                    default: withCtx(({ headingValue }, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        ssrRenderSlot(_ctx.$slots, "heading", { value: headingValue }, () => {
                          _push4(`${ssrInterpolate(headingValue)}`);
                        }, _push4, _parent4, _scopeId3);
                      } else {
                        return [
                          renderSlot(_ctx.$slots, "heading", { value: headingValue }, () => [
                            createTextVNode(toDisplayString(headingValue), 1)
                          ])
                        ];
                      }
                    }),
                    _: 2
                  }, _parent3, _scopeId2));
                  if (props.monthControls) {
                    _push3(ssrRenderComponent(unref(Calendar$1).Next, {
                      "aria-label": unref(t)("calendar.nextMonth"),
                      "as-child": ""
                    }, {
                      default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_sfc_main$9, mergeProps({
                            icon: nextMonthIcon.value,
                            size: props.size,
                            color: "neutral",
                            variant: "ghost"
                          }, props.nextMonth), null, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_sfc_main$9, mergeProps({
                              icon: nextMonthIcon.value,
                              size: props.size,
                              color: "neutral",
                              variant: "ghost"
                            }, props.nextMonth), null, 16, ["icon", "size"])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  if (props.yearControls) {
                    _push3(ssrRenderComponent(unref(Calendar$1).Next, {
                      "next-page": (date) => paginateYear(date, 1),
                      "aria-label": unref(t)("calendar.nextYear"),
                      "as-child": ""
                    }, {
                      default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_sfc_main$9, mergeProps({
                            icon: nextYearIcon.value,
                            size: props.size,
                            color: "neutral",
                            variant: "ghost"
                          }, props.nextYear), null, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_sfc_main$9, mergeProps({
                              icon: nextYearIcon.value,
                              size: props.size,
                              color: "neutral",
                              variant: "ghost"
                            }, props.nextYear), null, 16, ["icon", "size"])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                } else {
                  return [
                    props.yearControls ? (openBlock(), createBlock(unref(Calendar$1).Prev, {
                      key: 0,
                      "prev-page": (date) => paginateYear(date, -1),
                      "aria-label": unref(t)("calendar.prevYear"),
                      "as-child": ""
                    }, {
                      default: withCtx(() => [
                        createVNode(_sfc_main$9, mergeProps({
                          icon: prevYearIcon.value,
                          size: props.size,
                          color: "neutral",
                          variant: "ghost"
                        }, props.prevYear), null, 16, ["icon", "size"])
                      ]),
                      _: 1
                    }, 8, ["prev-page", "aria-label"])) : createCommentVNode("", true),
                    props.monthControls ? (openBlock(), createBlock(unref(Calendar$1).Prev, {
                      key: 1,
                      "aria-label": unref(t)("calendar.prevMonth"),
                      "as-child": ""
                    }, {
                      default: withCtx(() => [
                        createVNode(_sfc_main$9, mergeProps({
                          icon: prevMonthIcon.value,
                          size: props.size,
                          color: "neutral",
                          variant: "ghost"
                        }, props.prevMonth), null, 16, ["icon", "size"])
                      ]),
                      _: 1
                    }, 8, ["aria-label"])) : createCommentVNode("", true),
                    createVNode(unref(Calendar$1).Heading, {
                      class: ui.value.heading({ class: props.ui?.heading })
                    }, {
                      default: withCtx(({ headingValue }) => [
                        renderSlot(_ctx.$slots, "heading", { value: headingValue }, () => [
                          createTextVNode(toDisplayString(headingValue), 1)
                        ])
                      ]),
                      _: 3
                    }, 8, ["class"]),
                    props.monthControls ? (openBlock(), createBlock(unref(Calendar$1).Next, {
                      key: 2,
                      "aria-label": unref(t)("calendar.nextMonth"),
                      "as-child": ""
                    }, {
                      default: withCtx(() => [
                        createVNode(_sfc_main$9, mergeProps({
                          icon: nextMonthIcon.value,
                          size: props.size,
                          color: "neutral",
                          variant: "ghost"
                        }, props.nextMonth), null, 16, ["icon", "size"])
                      ]),
                      _: 1
                    }, 8, ["aria-label"])) : createCommentVNode("", true),
                    props.yearControls ? (openBlock(), createBlock(unref(Calendar$1).Next, {
                      key: 3,
                      "next-page": (date) => paginateYear(date, 1),
                      "aria-label": unref(t)("calendar.nextYear"),
                      "as-child": ""
                    }, {
                      default: withCtx(() => [
                        createVNode(_sfc_main$9, mergeProps({
                          icon: nextYearIcon.value,
                          size: props.size,
                          color: "neutral",
                          variant: "ghost"
                        }, props.nextYear), null, 16, ["icon", "size"])
                      ]),
                      _: 1
                    }, 8, ["next-page", "aria-label"])) : createCommentVNode("", true)
                  ];
                }
              }),
              _: 2
            }, _parent2, _scopeId));
            _push2(`<div class="${ssrRenderClass(ui.value.body({ class: props.ui?.body }))}"${_scopeId}><!--[-->`);
            ssrRenderList(grid, (month) => {
              _push2(ssrRenderComponent(unref(Calendar$1).Grid, {
                key: month.value.toString(),
                class: ui.value.grid({ class: props.ui?.grid })
              }, {
                default: withCtx((_, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(unref(Calendar$1).GridHead, null, {
                      default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(unref(Calendar$1).GridRow, {
                            class: ui.value.gridWeekDaysRow({ class: props.ui?.gridWeekDaysRow })
                          }, {
                            default: withCtx((_3, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<!--[-->`);
                                ssrRenderList(weekDays, (day) => {
                                  _push5(ssrRenderComponent(unref(Calendar$1).HeadCell, {
                                    key: day,
                                    class: ui.value.headCell({ class: props.ui?.headCell })
                                  }, {
                                    default: withCtx((_4, _push6, _parent6, _scopeId5) => {
                                      if (_push6) {
                                        ssrRenderSlot(_ctx.$slots, "week-day", { day }, () => {
                                          _push6(`${ssrInterpolate(day)}`);
                                        }, _push6, _parent6, _scopeId5);
                                      } else {
                                        return [
                                          renderSlot(_ctx.$slots, "week-day", { day }, () => [
                                            createTextVNode(toDisplayString(day), 1)
                                          ])
                                        ];
                                      }
                                    }),
                                    _: 2
                                  }, _parent5, _scopeId4));
                                });
                                _push5(`<!--]-->`);
                              } else {
                                return [
                                  (openBlock(true), createBlock(Fragment, null, renderList(weekDays, (day) => {
                                    return openBlock(), createBlock(unref(Calendar$1).HeadCell, {
                                      key: day,
                                      class: ui.value.headCell({ class: props.ui?.headCell })
                                    }, {
                                      default: withCtx(() => [
                                        renderSlot(_ctx.$slots, "week-day", { day }, () => [
                                          createTextVNode(toDisplayString(day), 1)
                                        ])
                                      ]),
                                      _: 2
                                    }, 1032, ["class"]);
                                  }), 128))
                                ];
                              }
                            }),
                            _: 2
                          }, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(unref(Calendar$1).GridRow, {
                              class: ui.value.gridWeekDaysRow({ class: props.ui?.gridWeekDaysRow })
                            }, {
                              default: withCtx(() => [
                                (openBlock(true), createBlock(Fragment, null, renderList(weekDays, (day) => {
                                  return openBlock(), createBlock(unref(Calendar$1).HeadCell, {
                                    key: day,
                                    class: ui.value.headCell({ class: props.ui?.headCell })
                                  }, {
                                    default: withCtx(() => [
                                      renderSlot(_ctx.$slots, "week-day", { day }, () => [
                                        createTextVNode(toDisplayString(day), 1)
                                      ])
                                    ]),
                                    _: 2
                                  }, 1032, ["class"]);
                                }), 128))
                              ]),
                              _: 2
                            }, 1032, ["class"])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                    _push3(ssrRenderComponent(unref(Calendar$1).GridBody, {
                      class: ui.value.gridBody({ class: props.ui?.gridBody })
                    }, {
                      default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(`<!--[-->`);
                          ssrRenderList(month.rows, (weekDates, index) => {
                            _push4(ssrRenderComponent(unref(Calendar$1).GridRow, {
                              key: `weekDate-${index}`,
                              class: ui.value.gridRow({ class: props.ui?.gridRow })
                            }, {
                              default: withCtx((_3, _push5, _parent5, _scopeId4) => {
                                if (_push5) {
                                  _push5(`<!--[-->`);
                                  ssrRenderList(weekDates, (weekDate) => {
                                    _push5(ssrRenderComponent(unref(Calendar$1).Cell, {
                                      key: weekDate.toString(),
                                      date: weekDate,
                                      class: ui.value.cell({ class: props.ui?.cell })
                                    }, {
                                      default: withCtx((_4, _push6, _parent6, _scopeId5) => {
                                        if (_push6) {
                                          _push6(ssrRenderComponent(unref(Calendar$1).CellTrigger, {
                                            day: weekDate,
                                            month: month.value,
                                            class: ui.value.cellTrigger({ class: props.ui?.cellTrigger })
                                          }, {
                                            default: withCtx((_5, _push7, _parent7, _scopeId6) => {
                                              if (_push7) {
                                                ssrRenderSlot(_ctx.$slots, "day", { day: weekDate }, () => {
                                                  _push7(`${ssrInterpolate(weekDate.day)}`);
                                                }, _push7, _parent7, _scopeId6);
                                              } else {
                                                return [
                                                  renderSlot(_ctx.$slots, "day", { day: weekDate }, () => [
                                                    createTextVNode(toDisplayString(weekDate.day), 1)
                                                  ])
                                                ];
                                              }
                                            }),
                                            _: 2
                                          }, _parent6, _scopeId5));
                                        } else {
                                          return [
                                            createVNode(unref(Calendar$1).CellTrigger, {
                                              day: weekDate,
                                              month: month.value,
                                              class: ui.value.cellTrigger({ class: props.ui?.cellTrigger })
                                            }, {
                                              default: withCtx(() => [
                                                renderSlot(_ctx.$slots, "day", { day: weekDate }, () => [
                                                  createTextVNode(toDisplayString(weekDate.day), 1)
                                                ])
                                              ]),
                                              _: 2
                                            }, 1032, ["day", "month", "class"])
                                          ];
                                        }
                                      }),
                                      _: 2
                                    }, _parent5, _scopeId4));
                                  });
                                  _push5(`<!--]-->`);
                                } else {
                                  return [
                                    (openBlock(true), createBlock(Fragment, null, renderList(weekDates, (weekDate) => {
                                      return openBlock(), createBlock(unref(Calendar$1).Cell, {
                                        key: weekDate.toString(),
                                        date: weekDate,
                                        class: ui.value.cell({ class: props.ui?.cell })
                                      }, {
                                        default: withCtx(() => [
                                          createVNode(unref(Calendar$1).CellTrigger, {
                                            day: weekDate,
                                            month: month.value,
                                            class: ui.value.cellTrigger({ class: props.ui?.cellTrigger })
                                          }, {
                                            default: withCtx(() => [
                                              renderSlot(_ctx.$slots, "day", { day: weekDate }, () => [
                                                createTextVNode(toDisplayString(weekDate.day), 1)
                                              ])
                                            ]),
                                            _: 2
                                          }, 1032, ["day", "month", "class"])
                                        ]),
                                        _: 2
                                      }, 1032, ["date", "class"]);
                                    }), 128))
                                  ];
                                }
                              }),
                              _: 2
                            }, _parent4, _scopeId3));
                          });
                          _push4(`<!--]-->`);
                        } else {
                          return [
                            (openBlock(true), createBlock(Fragment, null, renderList(month.rows, (weekDates, index) => {
                              return openBlock(), createBlock(unref(Calendar$1).GridRow, {
                                key: `weekDate-${index}`,
                                class: ui.value.gridRow({ class: props.ui?.gridRow })
                              }, {
                                default: withCtx(() => [
                                  (openBlock(true), createBlock(Fragment, null, renderList(weekDates, (weekDate) => {
                                    return openBlock(), createBlock(unref(Calendar$1).Cell, {
                                      key: weekDate.toString(),
                                      date: weekDate,
                                      class: ui.value.cell({ class: props.ui?.cell })
                                    }, {
                                      default: withCtx(() => [
                                        createVNode(unref(Calendar$1).CellTrigger, {
                                          day: weekDate,
                                          month: month.value,
                                          class: ui.value.cellTrigger({ class: props.ui?.cellTrigger })
                                        }, {
                                          default: withCtx(() => [
                                            renderSlot(_ctx.$slots, "day", { day: weekDate }, () => [
                                              createTextVNode(toDisplayString(weekDate.day), 1)
                                            ])
                                          ]),
                                          _: 2
                                        }, 1032, ["day", "month", "class"])
                                      ]),
                                      _: 2
                                    }, 1032, ["date", "class"]);
                                  }), 128))
                                ]),
                                _: 2
                              }, 1032, ["class"]);
                            }), 128))
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    return [
                      createVNode(unref(Calendar$1).GridHead, null, {
                        default: withCtx(() => [
                          createVNode(unref(Calendar$1).GridRow, {
                            class: ui.value.gridWeekDaysRow({ class: props.ui?.gridWeekDaysRow })
                          }, {
                            default: withCtx(() => [
                              (openBlock(true), createBlock(Fragment, null, renderList(weekDays, (day) => {
                                return openBlock(), createBlock(unref(Calendar$1).HeadCell, {
                                  key: day,
                                  class: ui.value.headCell({ class: props.ui?.headCell })
                                }, {
                                  default: withCtx(() => [
                                    renderSlot(_ctx.$slots, "week-day", { day }, () => [
                                      createTextVNode(toDisplayString(day), 1)
                                    ])
                                  ]),
                                  _: 2
                                }, 1032, ["class"]);
                              }), 128))
                            ]),
                            _: 2
                          }, 1032, ["class"])
                        ]),
                        _: 2
                      }, 1024),
                      createVNode(unref(Calendar$1).GridBody, {
                        class: ui.value.gridBody({ class: props.ui?.gridBody })
                      }, {
                        default: withCtx(() => [
                          (openBlock(true), createBlock(Fragment, null, renderList(month.rows, (weekDates, index) => {
                            return openBlock(), createBlock(unref(Calendar$1).GridRow, {
                              key: `weekDate-${index}`,
                              class: ui.value.gridRow({ class: props.ui?.gridRow })
                            }, {
                              default: withCtx(() => [
                                (openBlock(true), createBlock(Fragment, null, renderList(weekDates, (weekDate) => {
                                  return openBlock(), createBlock(unref(Calendar$1).Cell, {
                                    key: weekDate.toString(),
                                    date: weekDate,
                                    class: ui.value.cell({ class: props.ui?.cell })
                                  }, {
                                    default: withCtx(() => [
                                      createVNode(unref(Calendar$1).CellTrigger, {
                                        day: weekDate,
                                        month: month.value,
                                        class: ui.value.cellTrigger({ class: props.ui?.cellTrigger })
                                      }, {
                                        default: withCtx(() => [
                                          renderSlot(_ctx.$slots, "day", { day: weekDate }, () => [
                                            createTextVNode(toDisplayString(weekDate.day), 1)
                                          ])
                                        ]),
                                        _: 2
                                      }, 1032, ["day", "month", "class"])
                                    ]),
                                    _: 2
                                  }, 1032, ["date", "class"]);
                                }), 128))
                              ]),
                              _: 2
                            }, 1032, ["class"]);
                          }), 128))
                        ]),
                        _: 2
                      }, 1032, ["class"])
                    ];
                  }
                }),
                _: 2
              }, _parent2, _scopeId));
            });
            _push2(`<!--]--></div>`);
          } else {
            return [
              createVNode(unref(Calendar$1).Header, {
                class: ui.value.header({ class: props.ui?.header })
              }, {
                default: withCtx(() => [
                  props.yearControls ? (openBlock(), createBlock(unref(Calendar$1).Prev, {
                    key: 0,
                    "prev-page": (date) => paginateYear(date, -1),
                    "aria-label": unref(t)("calendar.prevYear"),
                    "as-child": ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_sfc_main$9, mergeProps({
                        icon: prevYearIcon.value,
                        size: props.size,
                        color: "neutral",
                        variant: "ghost"
                      }, props.prevYear), null, 16, ["icon", "size"])
                    ]),
                    _: 1
                  }, 8, ["prev-page", "aria-label"])) : createCommentVNode("", true),
                  props.monthControls ? (openBlock(), createBlock(unref(Calendar$1).Prev, {
                    key: 1,
                    "aria-label": unref(t)("calendar.prevMonth"),
                    "as-child": ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_sfc_main$9, mergeProps({
                        icon: prevMonthIcon.value,
                        size: props.size,
                        color: "neutral",
                        variant: "ghost"
                      }, props.prevMonth), null, 16, ["icon", "size"])
                    ]),
                    _: 1
                  }, 8, ["aria-label"])) : createCommentVNode("", true),
                  createVNode(unref(Calendar$1).Heading, {
                    class: ui.value.heading({ class: props.ui?.heading })
                  }, {
                    default: withCtx(({ headingValue }) => [
                      renderSlot(_ctx.$slots, "heading", { value: headingValue }, () => [
                        createTextVNode(toDisplayString(headingValue), 1)
                      ])
                    ]),
                    _: 3
                  }, 8, ["class"]),
                  props.monthControls ? (openBlock(), createBlock(unref(Calendar$1).Next, {
                    key: 2,
                    "aria-label": unref(t)("calendar.nextMonth"),
                    "as-child": ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_sfc_main$9, mergeProps({
                        icon: nextMonthIcon.value,
                        size: props.size,
                        color: "neutral",
                        variant: "ghost"
                      }, props.nextMonth), null, 16, ["icon", "size"])
                    ]),
                    _: 1
                  }, 8, ["aria-label"])) : createCommentVNode("", true),
                  props.yearControls ? (openBlock(), createBlock(unref(Calendar$1).Next, {
                    key: 3,
                    "next-page": (date) => paginateYear(date, 1),
                    "aria-label": unref(t)("calendar.nextYear"),
                    "as-child": ""
                  }, {
                    default: withCtx(() => [
                      createVNode(_sfc_main$9, mergeProps({
                        icon: nextYearIcon.value,
                        size: props.size,
                        color: "neutral",
                        variant: "ghost"
                      }, props.nextYear), null, 16, ["icon", "size"])
                    ]),
                    _: 1
                  }, 8, ["next-page", "aria-label"])) : createCommentVNode("", true)
                ]),
                _: 3
              }, 8, ["class"]),
              createVNode("div", {
                class: ui.value.body({ class: props.ui?.body })
              }, [
                (openBlock(true), createBlock(Fragment, null, renderList(grid, (month) => {
                  return openBlock(), createBlock(unref(Calendar$1).Grid, {
                    key: month.value.toString(),
                    class: ui.value.grid({ class: props.ui?.grid })
                  }, {
                    default: withCtx(() => [
                      createVNode(unref(Calendar$1).GridHead, null, {
                        default: withCtx(() => [
                          createVNode(unref(Calendar$1).GridRow, {
                            class: ui.value.gridWeekDaysRow({ class: props.ui?.gridWeekDaysRow })
                          }, {
                            default: withCtx(() => [
                              (openBlock(true), createBlock(Fragment, null, renderList(weekDays, (day) => {
                                return openBlock(), createBlock(unref(Calendar$1).HeadCell, {
                                  key: day,
                                  class: ui.value.headCell({ class: props.ui?.headCell })
                                }, {
                                  default: withCtx(() => [
                                    renderSlot(_ctx.$slots, "week-day", { day }, () => [
                                      createTextVNode(toDisplayString(day), 1)
                                    ])
                                  ]),
                                  _: 2
                                }, 1032, ["class"]);
                              }), 128))
                            ]),
                            _: 2
                          }, 1032, ["class"])
                        ]),
                        _: 2
                      }, 1024),
                      createVNode(unref(Calendar$1).GridBody, {
                        class: ui.value.gridBody({ class: props.ui?.gridBody })
                      }, {
                        default: withCtx(() => [
                          (openBlock(true), createBlock(Fragment, null, renderList(month.rows, (weekDates, index) => {
                            return openBlock(), createBlock(unref(Calendar$1).GridRow, {
                              key: `weekDate-${index}`,
                              class: ui.value.gridRow({ class: props.ui?.gridRow })
                            }, {
                              default: withCtx(() => [
                                (openBlock(true), createBlock(Fragment, null, renderList(weekDates, (weekDate) => {
                                  return openBlock(), createBlock(unref(Calendar$1).Cell, {
                                    key: weekDate.toString(),
                                    date: weekDate,
                                    class: ui.value.cell({ class: props.ui?.cell })
                                  }, {
                                    default: withCtx(() => [
                                      createVNode(unref(Calendar$1).CellTrigger, {
                                        day: weekDate,
                                        month: month.value,
                                        class: ui.value.cellTrigger({ class: props.ui?.cellTrigger })
                                      }, {
                                        default: withCtx(() => [
                                          renderSlot(_ctx.$slots, "day", { day: weekDate }, () => [
                                            createTextVNode(toDisplayString(weekDate.day), 1)
                                          ])
                                        ]),
                                        _: 2
                                      }, 1032, ["day", "month", "class"])
                                    ]),
                                    _: 2
                                  }, 1032, ["date", "class"]);
                                }), 128))
                              ]),
                              _: 2
                            }, 1032, ["class"]);
                          }), 128))
                        ]),
                        _: 2
                      }, 1032, ["class"])
                    ]),
                    _: 2
                  }, 1032, ["class"]);
                }), 128))
              ], 2)
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
};
const _sfc_setup$6 = _sfc_main$6.setup;
_sfc_main$6.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/Calendar.vue");
  return _sfc_setup$6 ? _sfc_setup$6(props, ctx) : void 0;
};
const _sfc_main$5 = /* @__PURE__ */ defineComponent({
  __name: "HomeDateRangePicker",
  __ssrInlineRender: true,
  props: {
    "modelValue": { required: true },
    "modelModifiers": {}
  },
  emits: ["update:modelValue"],
  setup(__props) {
    const df = new DateFormatter("en-US", {
      dateStyle: "medium"
    });
    const selected = useModel(__props, "modelValue");
    const ranges = [
      { label: "Last 7 days", days: 7 },
      { label: "Last 14 days", days: 14 },
      { label: "Last 30 days", days: 30 },
      { label: "Last 3 months", months: 3 },
      { label: "Last 6 months", months: 6 },
      { label: "Last year", years: 1 }
    ];
    const toCalendarDate = (date) => {
      return new CalendarDate(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate()
      );
    };
    const calendarRange = computed({
      get: () => ({
        start: selected.value.start ? toCalendarDate(selected.value.start) : void 0,
        end: selected.value.end ? toCalendarDate(selected.value.end) : void 0
      }),
      set: (newValue) => {
        selected.value = {
          start: newValue.start ? newValue.start.toDate(getLocalTimeZone()) : /* @__PURE__ */ new Date(),
          end: newValue.end ? newValue.end.toDate(getLocalTimeZone()) : /* @__PURE__ */ new Date()
        };
      }
    });
    const isRangeSelected = (range) => {
      if (!selected.value.start || !selected.value.end) return false;
      const currentDate = today(getLocalTimeZone());
      let startDate = currentDate.copy();
      if (range.days) {
        startDate = startDate.subtract({ days: range.days });
      } else if (range.months) {
        startDate = startDate.subtract({ months: range.months });
      } else if (range.years) {
        startDate = startDate.subtract({ years: range.years });
      }
      const selectedStart = toCalendarDate(selected.value.start);
      const selectedEnd = toCalendarDate(selected.value.end);
      return selectedStart.compare(startDate) === 0 && selectedEnd.compare(currentDate) === 0;
    };
    const selectRange = (range) => {
      const endDate = today(getLocalTimeZone());
      let startDate = endDate.copy();
      if (range.days) {
        startDate = startDate.subtract({ days: range.days });
      } else if (range.months) {
        startDate = startDate.subtract({ months: range.months });
      } else if (range.years) {
        startDate = startDate.subtract({ years: range.years });
      }
      selected.value = {
        start: startDate.toDate(getLocalTimeZone()),
        end: endDate.toDate(getLocalTimeZone())
      };
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPopover = _sfc_main$k;
      const _component_UButton = _sfc_main$9;
      const _component_UIcon = _sfc_main$e;
      const _component_UCalendar = _sfc_main$6;
      _push(ssrRenderComponent(_component_UPopover, mergeProps({
        content: { align: "start" },
        modal: true
      }, _attrs), {
        content: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex items-stretch sm:divide-x divide-default"${_scopeId}><div class="hidden sm:flex flex-col justify-center"${_scopeId}><!--[-->`);
            ssrRenderList(ranges, (range, index) => {
              _push2(ssrRenderComponent(_component_UButton, {
                key: index,
                label: range.label,
                color: "neutral",
                variant: "ghost",
                class: ["rounded-none px-4", [isRangeSelected(range) ? "bg-elevated" : "hover:bg-elevated/50"]],
                truncate: "",
                onClick: ($event) => selectRange(range)
              }, null, _parent2, _scopeId));
            });
            _push2(`<!--]--></div>`);
            _push2(ssrRenderComponent(_component_UCalendar, {
              modelValue: unref(calendarRange),
              "onUpdate:modelValue": ($event) => isRef(calendarRange) ? calendarRange.value = $event : null,
              class: "p-2",
              "number-of-months": 2,
              range: ""
            }, null, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", { class: "flex items-stretch sm:divide-x divide-default" }, [
                createVNode("div", { class: "hidden sm:flex flex-col justify-center" }, [
                  (openBlock(), createBlock(Fragment, null, renderList(ranges, (range, index) => {
                    return createVNode(_component_UButton, {
                      key: index,
                      label: range.label,
                      color: "neutral",
                      variant: "ghost",
                      class: ["rounded-none px-4", [isRangeSelected(range) ? "bg-elevated" : "hover:bg-elevated/50"]],
                      truncate: "",
                      onClick: ($event) => selectRange(range)
                    }, null, 8, ["label", "class", "onClick"]);
                  }), 64))
                ]),
                createVNode(_component_UCalendar, {
                  modelValue: unref(calendarRange),
                  "onUpdate:modelValue": ($event) => isRef(calendarRange) ? calendarRange.value = $event : null,
                  class: "p-2",
                  "number-of-months": 2,
                  range: ""
                }, null, 8, ["modelValue", "onUpdate:modelValue"])
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UButton, {
              color: "neutral",
              variant: "ghost",
              icon: "i-lucide-calendar",
              class: "data-[state=open]:bg-elevated group"
            }, {
              trailing: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UIcon, {
                    name: "i-lucide-chevron-down",
                    class: "shrink-0 text-dimmed size-5 group-data-[state=open]:rotate-180 transition-transform duration-200"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-chevron-down",
                      class: "shrink-0 text-dimmed size-5 group-data-[state=open]:rotate-180 transition-transform duration-200"
                    })
                  ];
                }
              }),
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<span class="truncate"${_scopeId2}>`);
                  if (selected.value.start) {
                    _push3(`<!--[-->`);
                    if (selected.value.end) {
                      _push3(`<!--[-->${ssrInterpolate(unref(df).format(selected.value.start))} - ${ssrInterpolate(unref(df).format(selected.value.end))}<!--]-->`);
                    } else {
                      _push3(`<!--[-->${ssrInterpolate(unref(df).format(selected.value.start))}<!--]-->`);
                    }
                    _push3(`<!--]-->`);
                  } else {
                    _push3(`<!--[--> Pick a date <!--]-->`);
                  }
                  _push3(`</span>`);
                } else {
                  return [
                    createVNode("span", { class: "truncate" }, [
                      selected.value.start ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                        selected.value.end ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                          createTextVNode(toDisplayString(unref(df).format(selected.value.start)) + " - " + toDisplayString(unref(df).format(selected.value.end)), 1)
                        ], 64)) : (openBlock(), createBlock(Fragment, { key: 1 }, [
                          createTextVNode(toDisplayString(unref(df).format(selected.value.start)), 1)
                        ], 64))
                      ], 64)) : (openBlock(), createBlock(Fragment, { key: 1 }, [
                        createTextVNode(" Pick a date ")
                      ], 64))
                    ])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UButton, {
                color: "neutral",
                variant: "ghost",
                icon: "i-lucide-calendar",
                class: "data-[state=open]:bg-elevated group"
              }, {
                trailing: withCtx(() => [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-chevron-down",
                    class: "shrink-0 text-dimmed size-5 group-data-[state=open]:rotate-180 transition-transform duration-200"
                  })
                ]),
                default: withCtx(() => [
                  createVNode("span", { class: "truncate" }, [
                    selected.value.start ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                      selected.value.end ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(unref(df).format(selected.value.start)) + " - " + toDisplayString(unref(df).format(selected.value.end)), 1)
                      ], 64)) : (openBlock(), createBlock(Fragment, { key: 1 }, [
                        createTextVNode(toDisplayString(unref(df).format(selected.value.start)), 1)
                      ], 64))
                    ], 64)) : (openBlock(), createBlock(Fragment, { key: 1 }, [
                      createTextVNode(" Pick a date ")
                    ], 64))
                  ])
                ]),
                _: 1
              })
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup$5 = _sfc_main$5.setup;
_sfc_main$5.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/home/HomeDateRangePicker.vue");
  return _sfc_setup$5 ? _sfc_setup$5(props, ctx) : void 0;
};
const __nuxt_component_9 = Object.assign(_sfc_main$5, { __name: "HomeDateRangePicker" });
const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "HomePeriodSelect",
  __ssrInlineRender: true,
  props: /* @__PURE__ */ mergeModels({
    range: {}
  }, {
    "modelValue": { required: true },
    "modelModifiers": {}
  }),
  emits: ["update:modelValue"],
  setup(__props) {
    const model = useModel(__props, "modelValue");
    const props = __props;
    const days = computed(() => eachDayOfInterval(props.range));
    const periods = computed(() => {
      if (days.value.length <= 8) {
        return [
          "daily"
        ];
      }
      if (days.value.length <= 31) {
        return [
          "daily",
          "weekly"
        ];
      }
      return [
        "weekly",
        "monthly"
      ];
    });
    watch(periods, () => {
      if (!periods.value.includes(model.value)) {
        model.value = periods.value[0];
      }
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_USelect = _sfc_main$l;
      _push(ssrRenderComponent(_component_USelect, mergeProps({
        modelValue: model.value,
        "onUpdate:modelValue": ($event) => model.value = $event,
        items: unref(periods),
        variant: "ghost",
        class: "data-[state=open]:bg-elevated",
        ui: { value: "capitalize", itemLabel: "capitalize", trailingIcon: "group-data-[state=open]:rotate-180 transition-transform duration-200" }
      }, _attrs), null, _parent));
    };
  }
});
const _sfc_setup$4 = _sfc_main$4.setup;
_sfc_main$4.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/home/HomePeriodSelect.vue");
  return _sfc_setup$4 ? _sfc_setup$4(props, ctx) : void 0;
};
const __nuxt_component_10 = Object.assign(_sfc_main$4, { __name: "HomePeriodSelect" });
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "HomeStats",
  __ssrInlineRender: true,
  props: {
    period: {},
    range: {}
  },
  async setup(__props) {
    let __temp, __restore;
    const props = __props;
    function formatCurrency(value) {
      return value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      });
    }
    const baseStats = [{
      title: "Revenue",
      icon: "i-lucide-circle-dollar-sign",
      minValue: 2e5,
      maxValue: 5e5,
      minVariation: -20,
      maxVariation: 30,
      formatter: formatCurrency
    }, {
      title: "Expenses",
      icon: "i-lucide-wallet",
      minValue: 12e4,
      maxValue: 3e5,
      minVariation: -15,
      maxVariation: 25,
      formatter: formatCurrency
    }, {
      title: "Profit",
      icon: "i-lucide-piggy-bank",
      minValue: 5e4,
      maxValue: 15e4,
      minVariation: -20,
      maxVariation: 30,
      formatter: formatCurrency
    }, {
      title: "Profit Margin",
      icon: "i-lucide-percent",
      minValue: 5,
      maxValue: 40,
      minVariation: -10,
      maxVariation: 10,
      formatter: (v) => `${v}%`
    }];
    const { data: stats } = ([__temp, __restore] = withAsyncContext(async () => useAsyncData("stats", async () => {
      try {
        const kpis = await $fetch("/api/kpis");
        if (kpis?.length) {
          return kpis.map((k) => ({
            title: k.title,
            icon: k.icon,
            value: typeof k.value === "number" && k.title.includes("Profit Margin") ? `${k.value}%` : typeof k.value === "number" ? formatCurrency(k.value) : k.value,
            variation: k.variation || 0
          }));
        }
      } catch {
      }
      return baseStats.map((stat) => {
        const value = randomInt(stat.minValue, stat.maxValue);
        const variation = randomInt(stat.minVariation, stat.maxVariation);
        return {
          title: stat.title,
          icon: stat.icon,
          value: stat.formatter ? stat.formatter(value) : value,
          variation
        };
      });
    }, {
      watch: [() => props.period, () => props.range],
      default: () => []
    })), __temp = await __temp, __restore(), __temp);
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPageGrid = _sfc_main$f;
      const _component_UPageCard = _sfc_main$g;
      const _component_UBadge = _sfc_main$h;
      _push(ssrRenderComponent(_component_UPageGrid, mergeProps({ class: "lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-px" }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<!--[-->`);
            ssrRenderList(unref(stats), (stat, index) => {
              _push2(ssrRenderComponent(_component_UPageCard, {
                key: index,
                icon: stat.icon,
                title: stat.title,
                to: "/customers",
                variant: "subtle",
                ui: {
                  container: "gap-y-1.5",
                  wrapper: "items-start",
                  leading: "p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col",
                  title: "font-normal text-muted text-xs uppercase"
                },
                class: "lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center gap-2"${_scopeId2}><span class="text-2xl font-semibold text-highlighted"${_scopeId2}>${ssrInterpolate(stat.value)}</span>`);
                    _push3(ssrRenderComponent(_component_UBadge, {
                      color: stat.variation > 0 ? "success" : "error",
                      variant: "subtle",
                      class: "text-xs"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(`${ssrInterpolate(stat.variation > 0 ? "+" : "")}${ssrInterpolate(stat.variation)}% `);
                        } else {
                          return [
                            createTextVNode(toDisplayString(stat.variation > 0 ? "+" : "") + toDisplayString(stat.variation) + "% ", 1)
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                    _push3(`</div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center gap-2" }, [
                        createVNode("span", { class: "text-2xl font-semibold text-highlighted" }, toDisplayString(stat.value), 1),
                        createVNode(_component_UBadge, {
                          color: stat.variation > 0 ? "success" : "error",
                          variant: "subtle",
                          class: "text-xs"
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(stat.variation > 0 ? "+" : "") + toDisplayString(stat.variation) + "% ", 1)
                          ]),
                          _: 2
                        }, 1032, ["color"])
                      ])
                    ];
                  }
                }),
                _: 2
              }, _parent2, _scopeId));
            });
            _push2(`<!--]-->`);
          } else {
            return [
              (openBlock(true), createBlock(Fragment, null, renderList(unref(stats), (stat, index) => {
                return openBlock(), createBlock(_component_UPageCard, {
                  key: index,
                  icon: stat.icon,
                  title: stat.title,
                  to: "/customers",
                  variant: "subtle",
                  ui: {
                    container: "gap-y-1.5",
                    wrapper: "items-start",
                    leading: "p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col",
                    title: "font-normal text-muted text-xs uppercase"
                  },
                  class: "lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
                }, {
                  default: withCtx(() => [
                    createVNode("div", { class: "flex items-center gap-2" }, [
                      createVNode("span", { class: "text-2xl font-semibold text-highlighted" }, toDisplayString(stat.value), 1),
                      createVNode(_component_UBadge, {
                        color: stat.variation > 0 ? "success" : "error",
                        variant: "subtle",
                        class: "text-xs"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(stat.variation > 0 ? "+" : "") + toDisplayString(stat.variation) + "% ", 1)
                        ]),
                        _: 2
                      }, 1032, ["color"])
                    ])
                  ]),
                  _: 2
                }, 1032, ["icon", "title"]);
              }), 128))
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup$3 = _sfc_main$3.setup;
_sfc_main$3.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/home/HomeStats.vue");
  return _sfc_setup$3 ? _sfc_setup$3(props, ctx) : void 0;
};
const __nuxt_component_11 = Object.assign(_sfc_main$3, { __name: "HomeStats" });
const _sfc_main$2 = {};
function _sfc_ssrRender(_ctx, _push, _parent, _attrs) {
  const _component_UCard = _sfc_main$i;
  _push(ssrRenderComponent(_component_UCard, mergeProps({
    class: "shrink-0",
    ui: { body: "!px-0 !pt-0 !pb-3" }
  }, _attrs), {
    header: withCtx((_, _push2, _parent2, _scopeId) => {
      if (_push2) {
        _push2(`<div${_scopeId}><p class="text-xs text-muted uppercase mb-1.5"${_scopeId}> Revenue </p><p class="text-3xl text-highlighted font-semibold"${_scopeId}> --- </p></div>`);
      } else {
        return [
          createVNode("div", null, [
            createVNode("p", { class: "text-xs text-muted uppercase mb-1.5" }, " Revenue "),
            createVNode("p", { class: "text-3xl text-highlighted font-semibold" }, " --- ")
          ])
        ];
      }
    }),
    default: withCtx((_, _push2, _parent2, _scopeId) => {
      if (_push2) {
        _push2(`<div class="h-96"${_scopeId}></div>`);
      } else {
        return [
          createVNode("div", { class: "h-96" })
        ];
      }
    }),
    _: 1
  }, _parent));
}
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/home/HomeChart.server.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const __nuxt_component_12 = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main$2, [["ssrRender", _sfc_ssrRender]]), { __name: "HomeChart" });
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "HomeSales",
  __ssrInlineRender: true,
  props: {
    period: {},
    range: {}
  },
  async setup(__props) {
    let __temp, __restore;
    const props = __props;
    const UBadge = _sfc_main$h;
    const sampleEmails = [
      "james.anderson@example.com",
      "mia.white@example.com",
      "william.brown@example.com",
      "emma.davis@example.com",
      "ethan.harris@example.com"
    ];
    const { data } = ([__temp, __restore] = withAsyncContext(() => useAsyncData("sales", async () => {
      const sales = [];
      const currentDate = /* @__PURE__ */ new Date();
      for (let i = 0; i < 5; i++) {
        const hoursAgo = randomInt(0, 48);
        const date = new Date(currentDate.getTime() - hoursAgo * 36e5);
        sales.push({
          id: (4600 - i).toString(),
          date: date.toISOString(),
          status: randomFrom(["paid", "failed", "refunded"]),
          email: randomFrom(sampleEmails),
          amount: randomInt(100, 1e3)
        });
      }
      return sales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, {
      watch: [() => props.period, () => props.range],
      default: () => []
    })), __temp = await __temp, __restore(), __temp);
    const columns = [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => `#${row.getValue("id")}`
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => {
          return new Date(row.getValue("date")).toLocaleString("en-US", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
        }
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const color = {
            paid: "success",
            failed: "error",
            refunded: "neutral"
          }[row.getValue("status")];
          return h(
            UBadge,
            { class: "capitalize", variant: "subtle", color },
            () => row.getValue("status")
          );
        }
      },
      {
        accessorKey: "email",
        header: "Email"
      },
      {
        accessorKey: "amount",
        header: () => h("div", { class: "text-right" }, "Amount"),
        cell: ({ row }) => {
          const amount = Number.parseFloat(row.getValue("amount"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "EUR"
          }).format(amount);
          return h("div", { class: "text-right font-medium" }, formatted);
        }
      }
    ];
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UTable = _sfc_main$j;
      _push(ssrRenderComponent(_component_UTable, mergeProps({
        data: unref(data),
        columns,
        class: "shrink-0",
        ui: {
          base: "table-fixed border-separate border-spacing-0",
          thead: "[&>tr]:bg-elevated/50 [&>tr]:after:content-none",
          tbody: "[&>tr]:last:[&>td]:border-b-0",
          th: "first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r",
          td: "border-b border-default"
        }
      }, _attrs), null, _parent));
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/home/HomeSales.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const __nuxt_component_13 = Object.assign(_sfc_main$1, { __name: "HomeSales" });
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  setup(__props) {
    const { isNotificationsSlideoverOpen } = useDashboard();
    const items = [[{
      label: "New mail",
      icon: "i-lucide-send",
      to: "/inbox"
    }, {
      label: "New customer",
      icon: "i-lucide-user-plus",
      to: "/customers"
    }]];
    const range = shallowRef({
      start: sub(/* @__PURE__ */ new Date(), { days: 14 }),
      end: /* @__PURE__ */ new Date()
    });
    const period = ref("daily");
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$1$1;
      const _component_UDashboardNavbar = _sfc_main$7;
      const _component_UDashboardSidebarCollapse = _sfc_main$b;
      const _component_UTooltip = _sfc_main$8;
      const _component_UButton = _sfc_main$9;
      const _component_UChip = _sfc_main$d;
      const _component_UIcon = _sfc_main$e;
      const _component_UDropdownMenu = _sfc_main$a;
      const _component_UDashboardToolbar = _sfc_main$c;
      const _component_HomeDateRangePicker = __nuxt_component_9;
      const _component_HomePeriodSelect = __nuxt_component_10;
      const _component_HomeStats = __nuxt_component_11;
      const _component_HomeChart = __nuxt_component_12;
      const _component_HomeSales = __nuxt_component_13;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "home" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, {
              title: "Home",
              ui: { right: "gap-3" }
            }, {
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
                  _push3(ssrRenderComponent(_component_UTooltip, {
                    text: "Notifications",
                    shortcuts: ["N"]
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          color: "neutral",
                          variant: "ghost",
                          square: "",
                          onClick: ($event) => isNotificationsSlideoverOpen.value = true
                        }, {
                          default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                            if (_push5) {
                              _push5(ssrRenderComponent(_component_UChip, {
                                color: "error",
                                inset: ""
                              }, {
                                default: withCtx((_5, _push6, _parent6, _scopeId5) => {
                                  if (_push6) {
                                    _push6(ssrRenderComponent(_component_UIcon, {
                                      name: "i-lucide-bell",
                                      class: "size-5 shrink-0"
                                    }, null, _parent6, _scopeId5));
                                  } else {
                                    return [
                                      createVNode(_component_UIcon, {
                                        name: "i-lucide-bell",
                                        class: "size-5 shrink-0"
                                      })
                                    ];
                                  }
                                }),
                                _: 1
                              }, _parent5, _scopeId4));
                            } else {
                              return [
                                createVNode(_component_UChip, {
                                  color: "error",
                                  inset: ""
                                }, {
                                  default: withCtx(() => [
                                    createVNode(_component_UIcon, {
                                      name: "i-lucide-bell",
                                      class: "size-5 shrink-0"
                                    })
                                  ]),
                                  _: 1
                                })
                              ];
                            }
                          }),
                          _: 1
                        }, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            color: "neutral",
                            variant: "ghost",
                            square: "",
                            onClick: ($event) => isNotificationsSlideoverOpen.value = true
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_UChip, {
                                color: "error",
                                inset: ""
                              }, {
                                default: withCtx(() => [
                                  createVNode(_component_UIcon, {
                                    name: "i-lucide-bell",
                                    class: "size-5 shrink-0"
                                  })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          }, 8, ["onClick"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UDropdownMenu, { items }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          icon: "i-lucide-plus",
                          size: "md",
                          class: "rounded-full"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            icon: "i-lucide-plus",
                            size: "md",
                            class: "rounded-full"
                          })
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UTooltip, {
                      text: "Notifications",
                      shortcuts: ["N"]
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UButton, {
                          color: "neutral",
                          variant: "ghost",
                          square: "",
                          onClick: ($event) => isNotificationsSlideoverOpen.value = true
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_UChip, {
                              color: "error",
                              inset: ""
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_UIcon, {
                                  name: "i-lucide-bell",
                                  class: "size-5 shrink-0"
                                })
                              ]),
                              _: 1
                            })
                          ]),
                          _: 1
                        }, 8, ["onClick"])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UDropdownMenu, { items }, {
                      default: withCtx(() => [
                        createVNode(_component_UButton, {
                          icon: "i-lucide-plus",
                          size: "md",
                          class: "rounded-full"
                        })
                      ]),
                      _: 1
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UDashboardToolbar, null, {
              left: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_HomeDateRangePicker, {
                    modelValue: unref(range),
                    "onUpdate:modelValue": ($event) => isRef(range) ? range.value = $event : null,
                    class: "-ms-1"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_HomePeriodSelect, {
                    modelValue: unref(period),
                    "onUpdate:modelValue": ($event) => isRef(period) ? period.value = $event : null,
                    range: unref(range)
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_HomeDateRangePicker, {
                      modelValue: unref(range),
                      "onUpdate:modelValue": ($event) => isRef(range) ? range.value = $event : null,
                      class: "-ms-1"
                    }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                    createVNode(_component_HomePeriodSelect, {
                      modelValue: unref(period),
                      "onUpdate:modelValue": ($event) => isRef(period) ? period.value = $event : null,
                      range: unref(range)
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "range"])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, {
                title: "Home",
                ui: { right: "gap-3" }
              }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                right: withCtx(() => [
                  createVNode(_component_UTooltip, {
                    text: "Notifications",
                    shortcuts: ["N"]
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UButton, {
                        color: "neutral",
                        variant: "ghost",
                        square: "",
                        onClick: ($event) => isNotificationsSlideoverOpen.value = true
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UChip, {
                            color: "error",
                            inset: ""
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-bell",
                                class: "size-5 shrink-0"
                              })
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }, 8, ["onClick"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UDropdownMenu, { items }, {
                    default: withCtx(() => [
                      createVNode(_component_UButton, {
                        icon: "i-lucide-plus",
                        size: "md",
                        class: "rounded-full"
                      })
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }),
              createVNode(_component_UDashboardToolbar, null, {
                left: withCtx(() => [
                  createVNode(_component_HomeDateRangePicker, {
                    modelValue: unref(range),
                    "onUpdate:modelValue": ($event) => isRef(range) ? range.value = $event : null,
                    class: "-ms-1"
                  }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                  createVNode(_component_HomePeriodSelect, {
                    modelValue: unref(period),
                    "onUpdate:modelValue": ($event) => isRef(period) ? period.value = $event : null,
                    range: unref(range)
                  }, null, 8, ["modelValue", "onUpdate:modelValue", "range"])
                ]),
                _: 1
              })
            ];
          }
        }),
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_HomeStats, {
              period: unref(period),
              range: unref(range)
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_HomeChart, {
              period: unref(period),
              range: unref(range)
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_HomeSales, {
              period: unref(period),
              range: unref(range)
            }, null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_HomeStats, {
                period: unref(period),
                range: unref(range)
              }, null, 8, ["period", "range"]),
              createVNode(_component_HomeChart, {
                period: unref(period),
                range: unref(range)
              }, null, 8, ["period", "range"]),
              createVNode(_component_HomeSales, {
                period: unref(period),
                range: unref(range)
              }, null, 8, ["period", "range"])
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-Bq8LyDQA.mjs.map
