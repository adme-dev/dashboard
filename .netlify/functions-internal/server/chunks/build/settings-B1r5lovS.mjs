import { _ as _sfc_main$2, a as _sfc_main$1, b as _sfc_main$3 } from './DashboardSidebarCollapse-CtCG-tPp.mjs';
import { _ as _sfc_main$4 } from './DashboardToolbar-qd3CrmiW.mjs';
import { _ as _sfc_main$5 } from './NavigationMenu-Cz4qWt4k.mjs';
import { i as __nuxt_component_5 } from './server.mjs';
import { defineComponent, mergeProps, withCtx, createVNode, useSSRContext } from 'vue';
import { ssrRenderComponent } from 'vue/server-renderer';
import './DashboardSidebarToggle-BZQ1O4qq.mjs';
import './index-Cc9owYnb.mjs';
import '../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';
import 'reka-ui';
import './Badge-BVxjrbdp.mjs';
import './Popover-DbO_rtYu.mjs';
import 'reka-ui/namespaced';
import './Tooltip-BVNuEb6A.mjs';
import './Kbd-DpYM52pA.mjs';
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

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "settings",
  __ssrInlineRender: true,
  setup(__props) {
    const links = [[{
      label: "General",
      icon: "i-lucide-user",
      to: "/settings",
      exact: true
    }, {
      label: "Members",
      icon: "i-lucide-users",
      to: "/settings/members"
    }, {
      label: "Notifications",
      icon: "i-lucide-bell",
      to: "/settings/notifications"
    }, {
      label: "Security",
      icon: "i-lucide-shield",
      to: "/settings/security"
    }], [{
      label: "Documentation",
      icon: "i-lucide-book-open",
      to: "https://ui4.nuxt.com/docs/getting-started/installation/nuxt",
      target: "_blank"
    }]];
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$2;
      const _component_UDashboardNavbar = _sfc_main$1;
      const _component_UDashboardSidebarCollapse = _sfc_main$3;
      const _component_UDashboardToolbar = _sfc_main$4;
      const _component_UNavigationMenu = _sfc_main$5;
      const _component_NuxtPage = __nuxt_component_5;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({
        id: "settings",
        ui: { body: "lg:py-12" }
      }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, { title: "Settings" }, {
              leading: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UDashboardSidebarCollapse, null, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UDashboardSidebarCollapse)
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UDashboardToolbar, null, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UNavigationMenu, {
                    items: links,
                    highlight: "",
                    class: "-mx-1 flex-1"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UNavigationMenu, {
                      items: links,
                      highlight: "",
                      class: "-mx-1 flex-1"
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, { title: "Settings" }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                _: 1
              }),
              createVNode(_component_UDashboardToolbar, null, {
                default: withCtx(() => [
                  createVNode(_component_UNavigationMenu, {
                    items: links,
                    highlight: "",
                    class: "-mx-1 flex-1"
                  })
                ]),
                _: 1
              })
            ];
          }
        }),
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full lg:max-w-2xl mx-auto"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_NuxtPage, null, null, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", { class: "flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full lg:max-w-2xl mx-auto" }, [
                createVNode(_component_NuxtPage)
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/settings.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=settings-B1r5lovS.mjs.map
