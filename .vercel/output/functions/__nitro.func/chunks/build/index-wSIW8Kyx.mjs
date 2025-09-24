import { _ as _sfc_main$1, a as _sfc_main$2 } from './PageHeader-DF6x_mG2.mjs';
import { _ as _sfc_main$3 } from './Input-Bc3-FTjC.mjs';
import { d as _sfc_main$9 } from './server.mjs';
import { defineComponent, ref, withCtx, unref, isRef, createVNode, createBlock, openBlock, Fragment, renderList, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrRenderClass, ssrInterpolate } from 'vue/server-renderer';
import 'reka-ui';
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
  __name: "index",
  __ssrInlineRender: true,
  setup(__props) {
    const messages = ref([]);
    const input = ref("");
    const sending = ref(false);
    async function send() {
      const prompt = input.value.trim();
      if (!prompt || sending.value) return;
      messages.value.push({ role: "user", content: prompt });
      input.value = "";
      sending.value = true;
      try {
        const res = await $fetch("/api/ai/chat", {
          method: "POST",
          body: { prompt }
        });
        messages.value.push({ role: "assistant", content: res.reply });
      } catch {
        messages.value.push({ role: "assistant", content: "Sorry, I could not answer that." });
      } finally {
        sending.value = false;
      }
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPage = _sfc_main$1;
      const _component_UPageHeader = _sfc_main$2;
      const _component_UInput = _sfc_main$3;
      const _component_UButton = _sfc_main$9;
      _push(ssrRenderComponent(_component_UPage, _attrs, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UPageHeader, {
              title: "Ask Your Data",
              description: "Ask questions about your KPIs and reports"
            }, null, _parent2, _scopeId));
            _push2(`<div class="space-y-3"${_scopeId}><!--[-->`);
            ssrRenderList(unref(messages), (m, i) => {
              _push2(`<div class="${ssrRenderClass([m.role === "user" ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-muted/30", "p-3 rounded border"])}"${_scopeId}><div class="text-xs text-muted mb-1"${_scopeId}>${ssrInterpolate(m.role)}</div><div class="whitespace-pre-wrap"${_scopeId}>${ssrInterpolate(m.content)}</div></div>`);
            });
            _push2(`<!--]--></div><div class="mt-4 flex gap-2"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UInput, {
              modelValue: unref(input),
              "onUpdate:modelValue": ($event) => isRef(input) ? input.value = $event : null,
              placeholder: "e.g. What is my profit and cash outlook?",
              class: "flex-1"
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UButton, {
              loading: unref(sending),
              label: "Send",
              onClick: send
            }, null, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode(_component_UPageHeader, {
                title: "Ask Your Data",
                description: "Ask questions about your KPIs and reports"
              }),
              createVNode("div", { class: "space-y-3" }, [
                (openBlock(true), createBlock(Fragment, null, renderList(unref(messages), (m, i) => {
                  return openBlock(), createBlock("div", {
                    key: i,
                    class: ["p-3 rounded border", m.role === "user" ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-muted/30"]
                  }, [
                    createVNode("div", { class: "text-xs text-muted mb-1" }, toDisplayString(m.role), 1),
                    createVNode("div", { class: "whitespace-pre-wrap" }, toDisplayString(m.content), 1)
                  ], 2);
                }), 128))
              ]),
              createVNode("div", { class: "mt-4 flex gap-2" }, [
                createVNode(_component_UInput, {
                  modelValue: unref(input),
                  "onUpdate:modelValue": ($event) => isRef(input) ? input.value = $event : null,
                  placeholder: "e.g. What is my profit and cash outlook?",
                  class: "flex-1"
                }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                createVNode(_component_UButton, {
                  loading: unref(sending),
                  label: "Send",
                  onClick: send
                }, null, 8, ["loading"])
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/chat/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-wSIW8Kyx.mjs.map
