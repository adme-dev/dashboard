import { computed, useId, inject, provide, ref, reactive, readonly, createVNode, resolveDynamicComponent, unref, mergeProps, withCtx, renderSlot, useSSRContext } from 'vue';
import { ssrRenderVNode, ssrRenderSlot } from 'vue/server-renderer';
import { h as useEventBus } from './index-Cc9owYnb.mjs';
import { g as useAppConfig, t as tv, w as formBusInjectionKey, x as formStateInjectionKey, y as formErrorsInjectionKey, z as formInputsInjectionKey, A as formLoadingInjectionKey, B as formOptionsInjectionKey } from './server.mjs';

function isYupSchema(schema) {
  return schema.validate && schema.__isYupSchema__;
}
function isYupError(error) {
  return error.inner !== void 0;
}
function isSuperStructSchema(schema) {
  return "schema" in schema && typeof schema.coercer === "function" && typeof schema.validator === "function" && typeof schema.refiner === "function";
}
function isJoiSchema(schema) {
  return schema.validateAsync !== void 0 && schema.id !== void 0;
}
function isJoiError(error) {
  return error.isJoi === true;
}
function isStandardSchema(schema) {
  return "~standard" in schema;
}
async function validateStandardSchema(state, schema) {
  const result = await schema["~standard"].validate(state);
  if (result.issues) {
    return {
      errors: result.issues?.map((issue) => ({
        name: issue.path?.map((item) => typeof item === "object" ? item.key : item).join(".") || "",
        message: issue.message
      })) || [],
      result: null
    };
  }
  return {
    errors: null,
    result: result.value
  };
}
async function validateYupSchema(state, schema) {
  try {
    const result = await schema.validate(state, { abortEarly: false });
    return {
      errors: null,
      result
    };
  } catch (error) {
    if (isYupError(error)) {
      const errors = error.inner.map((issue) => ({
        name: issue.path ?? "",
        message: issue.message
      }));
      return {
        errors,
        result: null
      };
    } else {
      throw error;
    }
  }
}
async function validateSuperstructSchema(state, schema) {
  const [err, result] = schema.validate(state);
  if (err) {
    const errors = err.failures().map((error) => ({
      message: error.message,
      name: error.path.join(".")
    }));
    return {
      errors,
      result: null
    };
  }
  return {
    errors: null,
    result
  };
}
async function validateJoiSchema(state, schema) {
  try {
    const result = await schema.validateAsync(state, { abortEarly: false });
    return {
      errors: null,
      result
    };
  } catch (error) {
    if (isJoiError(error)) {
      const errors = error.details.map((issue) => ({
        name: issue.path.join("."),
        message: issue.message
      }));
      return {
        errors,
        result: null
      };
    } else {
      throw error;
    }
  }
}
function validateSchema(state, schema) {
  if (isStandardSchema(schema)) {
    return validateStandardSchema(state, schema);
  } else if (isJoiSchema(schema)) {
    return validateJoiSchema(state, schema);
  } else if (isYupSchema(schema)) {
    return validateYupSchema(state, schema);
  } else if (isSuperStructSchema(schema)) {
    return validateSuperstructSchema(state, schema);
  } else {
    throw new Error("Form validation failed: Unsupported form schema");
  }
}
function getAtPath(data, path) {
  if (!path) return data;
  const value = path.split(".").reduce(
    (value2, key) => value2?.[key],
    data
  );
  return value;
}
function setAtPath(data, path, value) {
  if (!path) return Object.assign(data, value);
  if (!data) return data;
  const keys = path.split(".");
  let current = data;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === void 0 || current[key] === null) {
      if (i + 1 < keys.length && !Number.isNaN(Number(keys[i + 1]))) {
        current[key] = [];
      } else {
        current[key] = {};
      }
    }
    current = current[key];
  }
  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
  return data;
}
class FormValidationException extends Error {
  formId;
  errors;
  constructor(formId, errors) {
    super("Form validation exception");
    this.formId = formId;
    this.errors = errors;
    Object.setPrototypeOf(this, FormValidationException.prototype);
  }
}
const theme = {
  "base": ""
};
const _sfc_main = {
  __name: "UForm",
  __ssrInlineRender: true,
  props: {
    id: { type: [String, Number], required: false },
    schema: { type: null, required: false },
    state: { type: null, required: false },
    validate: { type: Function, required: false },
    validateOn: { type: Array, required: false, default() {
      return ["input", "blur", "change"];
    } },
    disabled: { type: Boolean, required: false },
    name: { type: null, required: false },
    validateOnInputDelay: { type: Number, required: false, default: 300 },
    transform: { type: null, required: false, default: () => true },
    nested: { type: null, required: false },
    loadingAuto: { type: Boolean, required: false, default: true },
    class: { type: null, required: false },
    onSubmit: { type: Function, required: false }
  },
  emits: ["submit", "error"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const appConfig = useAppConfig();
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.form || {} }));
    const formId = props.id ?? useId();
    const bus = useEventBus(`form-${formId}`);
    const isNested = props.nested?.toString() === "" || props.nested === true;
    const parentBus = isNested && inject(
      formBusInjectionKey,
      void 0
    );
    const parentState = isNested ? inject(formStateInjectionKey, void 0) : void 0;
    const state = computed(() => {
      if (parentState?.value) {
        return props.name ? getAtPath(parentState.value, props.name) : parentState.value;
      }
      return props.state;
    });
    provide(formBusInjectionKey, bus);
    provide(formStateInjectionKey, state);
    const nestedForms = ref(/* @__PURE__ */ new Map());
    const errors = ref([]);
    provide(formErrorsInjectionKey, errors);
    const inputs = ref({});
    provide(formInputsInjectionKey, inputs);
    const dirtyFields = reactive(/* @__PURE__ */ new Set());
    const touchedFields = reactive(/* @__PURE__ */ new Set());
    const blurredFields = reactive(/* @__PURE__ */ new Set());
    function resolveErrorIds(errs) {
      return errs.map((err) => ({
        ...err,
        id: err?.name ? inputs.value[err.name]?.id : void 0
      }));
    }
    const transformedState = ref(null);
    async function getErrors() {
      let errs = props.validate ? await props.validate(state.value) ?? [] : [];
      if (props.schema) {
        const { errors: errors2, result } = await validateSchema(state.value, props.schema);
        if (errors2) {
          errs = errs.concat(errors2);
        } else {
          transformedState.value = result;
        }
      }
      return resolveErrorIds(errs);
    }
    async function _validate(opts = { silent: false, nested: false, transform: false }) {
      const names = opts.name && !Array.isArray(opts.name) ? [opts.name] : opts.name;
      async function validateNestedForms({ validate, name }) {
        try {
          return { name, output: await validate({ ...opts, silent: false }) };
        } catch (error) {
          if (!(error instanceof FormValidationException)) {
            throw error;
          }
          return { name, error };
        }
      }
      const nestedValidatePromises = !names && opts.nested ? Array.from(nestedForms.value.values()).map(validateNestedForms) : [];
      const nestedResults = await Promise.all(nestedValidatePromises);
      const nestedErrors = nestedResults.flatMap((result) => {
        if (!result.error) return [];
        return result.error.errors.map((e) => ({ ...e, name: result.name ? [result.name, e.name].join(".") : e.name }));
      });
      const nestedOutputs = nestedResults.filter((c) => c.output !== void 0);
      const allErrors = [await getErrors(), nestedErrors].flat();
      if (names) {
        const namesSet = new Set(names);
        const patterns = names.map((name) => inputs.value?.[name]?.pattern).filter(Boolean);
        const isErrorForPath = (error) => {
          if (!error.name) return false;
          if (namesSet.has(error.name)) return true;
          return patterns.some((pattern) => pattern.test(error.name));
        };
        const otherErrors = errors.value.filter((error) => !isErrorForPath(error));
        const pathErrors = allErrors.filter(isErrorForPath);
        errors.value = otherErrors.concat(pathErrors);
      } else {
        errors.value = allErrors;
      }
      if (errors.value?.length) {
        if (opts.silent) return false;
        throw new FormValidationException(formId, errors.value);
      }
      if (opts.transform) {
        nestedOutputs.forEach((o) => {
          if (o.name) setAtPath(transformedState.value, o.name, o.output);
          else Object.assign(transformedState.value, o.output);
        });
        return transformedState.value ?? state.value;
      }
      return state.value;
    }
    const loading = ref(false);
    provide(formLoadingInjectionKey, readonly(loading));
    async function onSubmitWrapper(payload) {
      loading.value = props.loadingAuto && true;
      const event = payload;
      try {
        event.data = await _validate({ nested: true, transform: props.transform });
        await props.onSubmit?.(event);
        dirtyFields.clear();
      } catch (error) {
        if (!(error instanceof FormValidationException)) {
          throw error;
        }
        const errorEvent = {
          ...event,
          errors: error.errors
        };
        emits("error", errorEvent);
      } finally {
        loading.value = false;
      }
    }
    const disabled = computed(() => props.disabled || loading.value);
    provide(formOptionsInjectionKey, computed(() => ({
      disabled: disabled.value,
      validateOnInputDelay: props.validateOnInputDelay
    })));
    const api = {
      validate: _validate,
      errors,
      setErrors(errs, name) {
        let formErrors = resolveErrorIds(errs).filter((e) => e.id);
        if (name) {
          formErrors = errors.value.filter(
            (err) => name instanceof RegExp ? !(err.name && name.test(err.name)) : err.name !== name
          ).concat(formErrors);
        }
        for (const form of nestedForms.value.values()) {
          const errors2 = errs.flatMap((e) => {
            if (!form.name) return [e];
            if (e?.name?.startsWith(form.name + `.`)) {
              return [{
                ...e,
                name: e?.name.split(form.name + `.`)[1]
              }];
            }
            return [];
          });
          const nameMatch = name instanceof RegExp ? form.name && name.test(form.name.toString()) : form.name !== name;
          if (nameMatch || !form.name) {
            form.api.setErrors(errors2, name);
            formErrors = formErrors.concat(form.api.getErrors().map((e) => ({ ...e, name: form.name ? [form.name, e.name].join(".") : e.name })));
          }
        }
        errors.value = formErrors;
      },
      async submit() {
        await onSubmitWrapper(new Event("submit"));
      },
      getErrors(name) {
        if (name) {
          return errors.value.filter((err) => name instanceof RegExp ? err.name && name.test(err.name) : err.name === name);
        }
        return errors.value;
      },
      clear(name) {
        let formErrors = [];
        if (name) {
          formErrors = errors.value.filter(
            (err) => {
              return err.name && !!inputs.value[err.name] && (name instanceof RegExp ? !(err.name && name.test(err.name)) : err.name !== name);
            }
          );
        }
        for (const form of nestedForms.value.values()) {
          if (!form.name) form.api.clear(name);
          else if (form.name === name || name instanceof RegExp && name.test(form.name)) form.api.clear();
          else if (typeof name === "string" && name?.startsWith(form.name + `.`)) {
            const nestedName = name?.split(`${form.name}.`)[1];
            form.api.clear(nestedName);
          }
          formErrors = formErrors.concat(
            form.api.getErrors().map((e) => ({
              ...e,
              name: form.name ? [form.name, e.name].join(".") : e.name
            }))
          );
        }
        errors.value = formErrors;
      },
      disabled,
      loading,
      dirty: computed(() => !!dirtyFields.size),
      dirtyFields: readonly(dirtyFields),
      blurredFields: readonly(blurredFields),
      touchedFields: readonly(touchedFields)
    };
    __expose(api);
    return (_ctx, _push, _parent, _attrs) => {
      ssrRenderVNode(_push, createVNode(resolveDynamicComponent(unref(parentBus) ? "div" : "form"), mergeProps({
        id: unref(formId),
        class: ui.value({ class: props.class }),
        onSubmit: onSubmitWrapper
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "default", {
              errors: errors.value,
              loading: loading.value
            }, null, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "default", {
                errors: errors.value,
                loading: loading.value
              })
            ];
          }
        }),
        _: 3
      }), _parent);
    };
  }
};
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/Form.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=Form-BYeXVtN8.mjs.map
