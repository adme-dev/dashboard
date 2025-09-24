import { useSlots, computed, ref, watch, nextTick, unref, mergeProps, withCtx, createVNode, renderSlot, createBlock, createCommentVNode, openBlock, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderAttrs, ssrInterpolate, ssrRenderSlot, ssrRenderClass } from 'vue/server-renderer';
import { Primitive } from 'reka-ui';
import { e as useVModel } from './index-Btsu36yb.mjs';
import { u as useAppConfig, l as useFormField, m as useComponentIcons, t as tv, _ as _sfc_main$e, a as _sfc_main$c, n as looseToNumber } from './server.mjs';

const theme = {
  "slots": {
    "root": "relative inline-flex items-center",
    "base": [
      "w-full rounded-md border-0 appearance-none placeholder:text-dimmed focus:outline-none disabled:cursor-not-allowed disabled:opacity-75",
      "transition-colors"
    ],
    "leading": "absolute start-0 flex items-start",
    "leadingIcon": "shrink-0 text-dimmed",
    "leadingAvatar": "shrink-0",
    "leadingAvatarSize": "",
    "trailing": "absolute end-0 flex items-start",
    "trailingIcon": "shrink-0 text-dimmed"
  },
  "variants": {
    "fieldGroup": {
      "horizontal": {
        "root": "group has-focus-visible:z-[1]",
        "base": "group-not-only:group-first:rounded-e-none group-not-only:group-last:rounded-s-none group-not-last:group-not-first:rounded-none"
      },
      "vertical": {
        "root": "group has-focus-visible:z-[1]",
        "base": "group-not-only:group-first:rounded-b-none group-not-only:group-last:rounded-t-none group-not-last:group-not-first:rounded-none"
      }
    },
    "size": {
      "xs": {
        "base": "px-2 py-1 text-xs gap-1",
        "leading": "ps-2 inset-y-1",
        "trailing": "pe-2 inset-y-1",
        "leadingIcon": "size-4",
        "leadingAvatarSize": "3xs",
        "trailingIcon": "size-4"
      },
      "sm": {
        "base": "px-2.5 py-1.5 text-xs gap-1.5",
        "leading": "ps-2.5 inset-y-1.5",
        "trailing": "pe-2.5 inset-y-1.5",
        "leadingIcon": "size-4",
        "leadingAvatarSize": "3xs",
        "trailingIcon": "size-4"
      },
      "md": {
        "base": "px-2.5 py-1.5 text-sm gap-1.5",
        "leading": "ps-2.5 inset-y-1.5",
        "trailing": "pe-2.5 inset-y-1.5",
        "leadingIcon": "size-5",
        "leadingAvatarSize": "2xs",
        "trailingIcon": "size-5"
      },
      "lg": {
        "base": "px-3 py-2 text-sm gap-2",
        "leading": "ps-3 inset-y-2",
        "trailing": "pe-3 inset-y-2",
        "leadingIcon": "size-5",
        "leadingAvatarSize": "2xs",
        "trailingIcon": "size-5"
      },
      "xl": {
        "base": "px-3 py-2 text-base gap-2",
        "leading": "ps-3 inset-y-2",
        "trailing": "pe-3 inset-y-2",
        "leadingIcon": "size-6",
        "leadingAvatarSize": "xs",
        "trailingIcon": "size-6"
      }
    },
    "variant": {
      "outline": "text-highlighted bg-default ring ring-inset ring-accented",
      "soft": "text-highlighted bg-elevated/50 hover:bg-elevated focus:bg-elevated disabled:bg-elevated/50",
      "subtle": "text-highlighted bg-elevated ring ring-inset ring-accented",
      "ghost": "text-highlighted bg-transparent hover:bg-elevated focus:bg-elevated disabled:bg-transparent dark:disabled:bg-transparent",
      "none": "text-highlighted bg-transparent"
    },
    "color": {
      "primary": "",
      "secondary": "",
      "success": "",
      "info": "",
      "warning": "",
      "error": "",
      "neutral": ""
    },
    "leading": {
      "true": ""
    },
    "trailing": {
      "true": ""
    },
    "loading": {
      "true": ""
    },
    "highlight": {
      "true": ""
    },
    "type": {
      "file": "file:me-1.5 file:font-medium file:text-muted file:outline-none"
    },
    "autoresize": {
      "true": {
        "base": "resize-none"
      }
    }
  },
  "compoundVariants": [
    {
      "color": "primary",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    },
    {
      "color": "secondary",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary"
    },
    {
      "color": "success",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-success"
    },
    {
      "color": "info",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-info"
    },
    {
      "color": "warning",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-warning"
    },
    {
      "color": "error",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-error"
    },
    {
      "color": "primary",
      "highlight": true,
      "class": "ring ring-inset ring-primary"
    },
    {
      "color": "secondary",
      "highlight": true,
      "class": "ring ring-inset ring-secondary"
    },
    {
      "color": "success",
      "highlight": true,
      "class": "ring ring-inset ring-success"
    },
    {
      "color": "info",
      "highlight": true,
      "class": "ring ring-inset ring-info"
    },
    {
      "color": "warning",
      "highlight": true,
      "class": "ring ring-inset ring-warning"
    },
    {
      "color": "error",
      "highlight": true,
      "class": "ring ring-inset ring-error"
    },
    {
      "color": "neutral",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-inverted"
    },
    {
      "color": "neutral",
      "highlight": true,
      "class": "ring ring-inset ring-inverted"
    },
    {
      "leading": true,
      "size": "xs",
      "class": "ps-7"
    },
    {
      "leading": true,
      "size": "sm",
      "class": "ps-8"
    },
    {
      "leading": true,
      "size": "md",
      "class": "ps-9"
    },
    {
      "leading": true,
      "size": "lg",
      "class": "ps-10"
    },
    {
      "leading": true,
      "size": "xl",
      "class": "ps-11"
    },
    {
      "trailing": true,
      "size": "xs",
      "class": "pe-7"
    },
    {
      "trailing": true,
      "size": "sm",
      "class": "pe-8"
    },
    {
      "trailing": true,
      "size": "md",
      "class": "pe-9"
    },
    {
      "trailing": true,
      "size": "lg",
      "class": "pe-10"
    },
    {
      "trailing": true,
      "size": "xl",
      "class": "pe-11"
    },
    {
      "loading": true,
      "leading": true,
      "class": {
        "leadingIcon": "animate-spin"
      }
    },
    {
      "loading": true,
      "leading": false,
      "trailing": true,
      "class": {
        "trailingIcon": "animate-spin"
      }
    }
  ],
  "defaultVariants": {
    "size": "md",
    "color": "primary",
    "variant": "outline"
  }
};
const _sfc_main = /* @__PURE__ */ Object.assign({ inheritAttrs: false }, {
  __name: "UTextarea",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    id: { type: String, required: false },
    name: { type: String, required: false },
    placeholder: { type: String, required: false },
    color: { type: null, required: false },
    variant: { type: null, required: false },
    size: { type: null, required: false },
    required: { type: Boolean, required: false },
    autofocus: { type: Boolean, required: false },
    autofocusDelay: { type: Number, required: false, default: 0 },
    autoresize: { type: Boolean, required: false },
    autoresizeDelay: { type: Number, required: false, default: 0 },
    disabled: { type: Boolean, required: false },
    rows: { type: Number, required: false, default: 3 },
    maxrows: { type: Number, required: false, default: 0 },
    highlight: { type: Boolean, required: false },
    modelValue: { type: null, required: false },
    defaultValue: { type: null, required: false },
    modelModifiers: { type: Object, required: false },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    icon: { type: [String, Object], required: false },
    avatar: { type: Object, required: false },
    leading: { type: Boolean, required: false },
    leadingIcon: { type: [String, Object], required: false },
    trailing: { type: Boolean, required: false },
    trailingIcon: { type: [String, Object], required: false },
    loading: { type: Boolean, required: false },
    loadingIcon: { type: [String, Object], required: false }
  },
  emits: ["update:modelValue", "blur", "change"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const slots = useSlots();
    const modelValue = useVModel(props, "modelValue", emits, { defaultValue: props.defaultValue });
    const appConfig = useAppConfig();
    const { emitFormFocus, emitFormBlur, emitFormInput, emitFormChange, size, color, id, name, highlight, disabled, ariaAttrs } = useFormField(props, { deferInputValidation: true });
    const { isLeading, isTrailing, leadingIconName, trailingIconName } = useComponentIcons(props);
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.textarea || {} })({
      color: color.value,
      variant: props.variant,
      size: size?.value,
      loading: props.loading,
      highlight: highlight.value,
      autoresize: props.autoresize,
      leading: isLeading.value || !!props.avatar || !!slots.leading,
      trailing: isTrailing.value || !!slots.trailing
    }));
    const textareaRef = ref(null);
    function updateInput(value) {
      if (props.modelModifiers?.trim) {
        value = value?.trim() ?? null;
      }
      if (props.modelModifiers?.number) {
        value = looseToNumber(value);
      }
      if (props.modelModifiers?.nullable) {
        value ||= null;
      }
      if (props.modelModifiers?.optional) {
        value ||= void 0;
      }
      modelValue.value = value;
      emitFormInput();
    }
    function onInput(event) {
      autoResize();
      if (!props.modelModifiers?.lazy) {
        updateInput(event.target.value);
      }
    }
    function onChange(event) {
      const value = event.target.value;
      if (props.modelModifiers?.lazy) {
        updateInput(value);
      }
      if (props.modelModifiers?.trim) {
        event.target.value = value.trim();
      }
      emitFormChange();
      emits("change", event);
    }
    function onBlur(event) {
      emitFormBlur();
      emits("blur", event);
    }
    function autoResize() {
      if (props.autoresize && textareaRef.value) {
        textareaRef.value.rows = props.rows;
        const overflow = textareaRef.value.style.overflow;
        textareaRef.value.style.overflow = "hidden";
        const styles = (void 0).getComputedStyle(textareaRef.value);
        const paddingTop = Number.parseInt(styles.paddingTop);
        const paddingBottom = Number.parseInt(styles.paddingBottom);
        const padding = paddingTop + paddingBottom;
        const lineHeight = Number.parseInt(styles.lineHeight);
        const { scrollHeight } = textareaRef.value;
        const newRows = (scrollHeight - padding) / lineHeight;
        if (newRows > props.rows) {
          textareaRef.value.rows = props.maxrows ? Math.min(newRows, props.maxrows) : newRows;
        }
        textareaRef.value.style.overflow = overflow;
      }
    }
    watch(modelValue, () => {
      nextTick(autoResize);
    });
    __expose({
      textareaRef
    });
    return (_ctx, _push, _parent, _attrs) => {
      let _temp0;
      _push(ssrRenderComponent(unref(Primitive), mergeProps({
        as: __props.as,
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<textarea${ssrRenderAttrs(_temp0 = mergeProps({
              id: unref(id),
              ref_key: "textareaRef",
              ref: textareaRef,
              value: unref(modelValue),
              name: unref(name),
              rows: __props.rows,
              placeholder: __props.placeholder,
              class: ui.value.base({ class: props.ui?.base }),
              disabled: unref(disabled),
              required: __props.required
            }, { ..._ctx.$attrs, ...unref(ariaAttrs) }), "textarea")}${_scopeId}>${ssrInterpolate("value" in _temp0 ? _temp0.value : "")}</textarea>`);
            ssrRenderSlot(_ctx.$slots, "default", {}, null, _push2, _parent2, _scopeId);
            if (unref(isLeading) || !!__props.avatar || !!slots.leading) {
              _push2(`<span class="${ssrRenderClass(ui.value.leading({ class: props.ui?.leading }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "leading", {}, () => {
                if (unref(isLeading) && unref(leadingIconName)) {
                  _push2(ssrRenderComponent(_sfc_main$e, {
                    name: unref(leadingIconName),
                    class: ui.value.leadingIcon({ class: props.ui?.leadingIcon })
                  }, null, _parent2, _scopeId));
                } else if (!!__props.avatar) {
                  _push2(ssrRenderComponent(_sfc_main$c, mergeProps({
                    size: props.ui?.leadingAvatarSize || ui.value.leadingAvatarSize()
                  }, __props.avatar, {
                    class: ui.value.leadingAvatar({ class: props.ui?.leadingAvatar })
                  }), null, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
              }, _push2, _parent2, _scopeId);
              _push2(`</span>`);
            } else {
              _push2(`<!---->`);
            }
            if (unref(isTrailing) || !!slots.trailing) {
              _push2(`<span class="${ssrRenderClass(ui.value.trailing({ class: props.ui?.trailing }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "trailing", {}, () => {
                if (unref(trailingIconName)) {
                  _push2(ssrRenderComponent(_sfc_main$e, {
                    name: unref(trailingIconName),
                    class: ui.value.trailingIcon({ class: props.ui?.trailingIcon })
                  }, null, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
              }, _push2, _parent2, _scopeId);
              _push2(`</span>`);
            } else {
              _push2(`<!---->`);
            }
          } else {
            return [
              createVNode("textarea", mergeProps({
                id: unref(id),
                ref_key: "textareaRef",
                ref: textareaRef,
                value: unref(modelValue),
                name: unref(name),
                rows: __props.rows,
                placeholder: __props.placeholder,
                class: ui.value.base({ class: props.ui?.base }),
                disabled: unref(disabled),
                required: __props.required
              }, { ..._ctx.$attrs, ...unref(ariaAttrs) }, {
                onInput,
                onBlur,
                onChange,
                onFocus: unref(emitFormFocus)
              }), null, 16, ["id", "value", "name", "rows", "placeholder", "disabled", "required", "onFocus"]),
              renderSlot(_ctx.$slots, "default"),
              unref(isLeading) || !!__props.avatar || !!slots.leading ? (openBlock(), createBlock("span", {
                key: 0,
                class: ui.value.leading({ class: props.ui?.leading })
              }, [
                renderSlot(_ctx.$slots, "leading", {}, () => [
                  unref(isLeading) && unref(leadingIconName) ? (openBlock(), createBlock(_sfc_main$e, {
                    key: 0,
                    name: unref(leadingIconName),
                    class: ui.value.leadingIcon({ class: props.ui?.leadingIcon })
                  }, null, 8, ["name", "class"])) : !!__props.avatar ? (openBlock(), createBlock(_sfc_main$c, mergeProps({
                    key: 1,
                    size: props.ui?.leadingAvatarSize || ui.value.leadingAvatarSize()
                  }, __props.avatar, {
                    class: ui.value.leadingAvatar({ class: props.ui?.leadingAvatar })
                  }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                ])
              ], 2)) : createCommentVNode("", true),
              unref(isTrailing) || !!slots.trailing ? (openBlock(), createBlock("span", {
                key: 1,
                class: ui.value.trailing({ class: props.ui?.trailing })
              }, [
                renderSlot(_ctx.$slots, "trailing", {}, () => [
                  unref(trailingIconName) ? (openBlock(), createBlock(_sfc_main$e, {
                    key: 0,
                    name: unref(trailingIconName),
                    class: ui.value.trailingIcon({ class: props.ui?.trailingIcon })
                  }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                ])
              ], 2)) : createCommentVNode("", true)
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/Textarea.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=Textarea-BUiU3euD.mjs.map
