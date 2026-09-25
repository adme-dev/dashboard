/* eslint-disable */
// biome-ignore-all lint: Deterministically generated; edit Studio verifier source.
var __defProp = Object.defineProperty;
var __export = (target2, all) => {
  for (var name in all)
    __defProp(target2, name, { get: all[name], enumerable: true });
};

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
var _a;
// @__NO_SIDE_EFFECTS__
function $constructor(name, initializer3, params) {
  function init(inst, def) {
    if (!inst._zod) {
      Object.defineProperty(inst, "_zod", {
        value: {
          def,
          constr: _,
          traits: /* @__PURE__ */ new Set(),
        },
        enumerable: false,
      });
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer3(inst, def);
    const proto = _.prototype;
    const keys = Object.keys(proto);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {}
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a3;
    const inst = params?.Parent ? new Definition() : this;
    init(inst, def);
    (_a3 = inst._zod).deferred ?? (_a3.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent) return true;
      return inst?._zod?.traits?.has(name);
    },
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $ZodAsyncError = class extends Error {
  constructor() {
    super(
      `Encountered Promise during synchronous parse. Use .parseAsync() instead.`
    );
  }
};
var $ZodEncodeError = class extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
};
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig) Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js
var util_exports = {};
__export(util_exports, {
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES,
  Class: () => Class,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  aborted: () => aborted,
  allowsEval: () => allowsEval,
  assert: () => assert,
  assertEqual: () => assertEqual,
  assertIs: () => assertIs,
  assertNever: () => assertNever,
  assertNotEqual: () => assertNotEqual,
  assignProp: () => assignProp,
  base64ToUint8Array: () => base64ToUint8Array,
  base64urlToUint8Array: () => base64urlToUint8Array,
  cached: () => cached,
  captureStackTrace: () => captureStackTrace,
  cleanEnum: () => cleanEnum,
  cleanRegex: () => cleanRegex,
  clone: () => clone,
  cloneDef: () => cloneDef,
  createTransparentProxy: () => createTransparentProxy,
  defineLazy: () => defineLazy,
  esc: () => esc,
  escapeRegex: () => escapeRegex,
  explicitlyAborted: () => explicitlyAborted,
  extend: () => extend,
  finalizeIssue: () => finalizeIssue,
  floatSafeRemainder: () => floatSafeRemainder,
  getElementAtPath: () => getElementAtPath,
  getEnumValues: () => getEnumValues,
  getLengthableOrigin: () => getLengthableOrigin,
  getParsedType: () => getParsedType,
  getSizableOrigin: () => getSizableOrigin,
  hexToUint8Array: () => hexToUint8Array,
  isObject: () => isObject,
  isPlainObject: () => isPlainObject,
  issue: () => issue,
  joinValues: () => joinValues,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  merge: () => merge,
  mergeDefs: () => mergeDefs,
  normalizeParams: () => normalizeParams,
  nullish: () => nullish,
  numKeys: () => numKeys,
  objectClone: () => objectClone,
  omit: () => omit,
  optionalKeys: () => optionalKeys,
  parsedType: () => parsedType,
  partial: () => partial,
  pick: () => pick,
  prefixIssues: () => prefixIssues,
  primitiveTypes: () => primitiveTypes,
  promiseAllObject: () => promiseAllObject,
  propertyKeyTypes: () => propertyKeyTypes,
  randomString: () => randomString,
  required: () => required,
  safeExtend: () => safeExtend,
  shallowClone: () => shallowClone,
  slugify: () => slugify,
  stringifyPrimitive: () => stringifyPrimitive,
  uint8ArrayToBase64: () => uint8ArrayToBase64,
  uint8ArrayToBase64url: () => uint8ArrayToBase64url,
  uint8ArrayToHex: () => uint8ArrayToHex,
  unwrapMessage: () => unwrapMessage,
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function assertIs(_arg) {}
function assertNever(_x) {
  throw new Error("Unexpected value in exhaustive check");
}
function assert(_) {}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter(
    (v) => typeof v === "number"
  );
  const values = Object.entries(entries)
    .filter(([k, _]) => numericValues.indexOf(+k) === -1)
    .map(([_, v]) => v);
  return values;
}
function joinValues(array2, separator = "|") {
  return array2.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint") return value.toString();
  return value;
}
function cached(getter) {
  const set = false;
  return {
    get value() {
      if (!set) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    },
  };
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
  return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object2, key2, getter) {
  let value = void 0;
  Object.defineProperty(object2, key2, {
    get() {
      if (value === EVALUATING) {
        return void 0;
      }
      if (value === void 0) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object2, key2, {
        value: v,
        // configurable: true,
      });
    },
    configurable: true,
  });
}
function objectClone(obj) {
  return Object.create(
    Object.getPrototypeOf(obj),
    Object.getOwnPropertyDescriptors(obj)
  );
}
function assignProp(target2, prop, value) {
  Object.defineProperty(target2, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
  return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
  if (!path) return obj;
  return path.reduce((acc, key2) => acc?.[key2], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key2) => promisesObj[key2]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0; i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length2 = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0; i < length2; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
var captureStackTrace =
  "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (
    typeof navigator !== "undefined" &&
    navigator?.userAgent?.includes("Cloudflare")
  ) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false) return false;
  const ctor = o.constructor;
  if (ctor === void 0) return true;
  if (typeof ctor !== "function") return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false) return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o)) return { ...o };
  if (Array.isArray(o)) return [...o];
  if (o instanceof Map) return new Map(o);
  if (o instanceof Set) return new Set(o);
  return o;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key2 in data) {
    if (Object.prototype.hasOwnProperty.call(data, key2)) {
      keyCount++;
    }
  }
  return keyCount;
}
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (
        data.then &&
        typeof data.then === "function" &&
        data.catch &&
        typeof data.catch === "function"
      ) {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t}`);
  }
};
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
var primitiveTypes = /* @__PURE__ */ new Set([
  "string",
  "number",
  "bigint",
  "boolean",
  "symbol",
  "undefined",
]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent) cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params) return {};
  if (typeof params === "string") return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target2;
  return new Proxy(
    {},
    {
      get(_, prop, receiver) {
        target2 ?? (target2 = getter());
        return Reflect.get(target2, prop, receiver);
      },
      set(_, prop, value, receiver) {
        target2 ?? (target2 = getter());
        return Reflect.set(target2, prop, value, receiver);
      },
      has(_, prop) {
        target2 ?? (target2 = getter());
        return Reflect.has(target2, prop);
      },
      deleteProperty(_, prop) {
        target2 ?? (target2 = getter());
        return Reflect.deleteProperty(target2, prop);
      },
      ownKeys(_) {
        target2 ?? (target2 = getter());
        return Reflect.ownKeys(target2);
      },
      getOwnPropertyDescriptor(_, prop) {
        target2 ?? (target2 = getter());
        return Reflect.getOwnPropertyDescriptor(target2, prop);
      },
      defineProperty(_, prop, descriptor) {
        target2 ?? (target2 = getter());
        return Reflect.defineProperty(target2, prop, descriptor);
      },
    }
  );
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint") return value.toString() + "n";
  if (typeof value === "string") return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return (
      shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional"
    );
  });
}
var NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE],
};
var BIGINT_FORMAT_RANGES = {
  int64: [
    /* @__PURE__ */ BigInt("-9223372036854775808"),
    /* @__PURE__ */ BigInt("9223372036854775807"),
  ],
  uint64: [
    /* @__PURE__ */ BigInt(0),
    /* @__PURE__ */ BigInt("18446744073709551615"),
  ],
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(
      ".pick() cannot be used on object schemas containing refinements"
    );
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key2 in mask) {
        if (!(key2 in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key2}"`);
        }
        if (!mask[key2]) continue;
        newShape[key2] = currDef.shape[key2];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: [],
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(
      ".omit() cannot be used on object schemas containing refinements"
    );
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key2 in mask) {
        if (!(key2 in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key2}"`);
        }
        if (!mask[key2]) continue;
        delete newShape[key2];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: [],
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key2 in shape) {
      if (Object.getOwnPropertyDescriptor(existingShape, key2) !== void 0) {
        throw new Error(
          "Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead."
        );
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
  });
  return clone(schema, def);
}
function merge(a, b) {
  if (a._zod.def.checks?.length) {
    throw new Error(
      ".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead."
    );
  }
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? [],
  });
  return clone(a, def);
}
function partial(Class2, schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(
      ".partial() cannot be used on object schemas containing refinements"
    );
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key2 in mask) {
          if (!(key2 in oldShape)) {
            throw new Error(`Unrecognized key: "${key2}"`);
          }
          if (!mask[key2]) continue;
          shape[key2] = Class2
            ? new Class2({
                type: "optional",
                innerType: oldShape[key2],
              })
            : oldShape[key2];
        }
      } else {
        for (const key2 in oldShape) {
          shape[key2] = Class2
            ? new Class2({
                type: "optional",
                innerType: oldShape[key2],
              })
            : oldShape[key2];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: [],
  });
  return clone(schema, def);
}
function required(Class2, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key2 in mask) {
          if (!(key2 in shape)) {
            throw new Error(`Unrecognized key: "${key2}"`);
          }
          if (!mask[key2]) continue;
          shape[key2] = new Class2({
            type: "nonoptional",
            innerType: oldShape[key2],
          });
        }
      } else {
        for (const key2 in oldShape) {
          shape[key2] = new Class2({
            type: "nonoptional",
            innerType: oldShape[key2],
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true) return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true) return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a3;
    (_a3 = iss).path ?? (_a3.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config2) {
  const message = iss.message
    ? iss.message
    : (unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ??
      unwrapMessage(ctx?.error?.(iss)) ??
      unwrapMessage(config2.customError?.(iss)) ??
      unwrapMessage(config2.localeError?.(iss)) ??
      "Invalid input");
  const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
function getSizableOrigin(input) {
  if (input instanceof Set) return "set";
  if (input instanceof Map) return "map";
  if (input instanceof File) return "file";
  return "unknown";
}
function getLengthableOrigin(input) {
  if (Array.isArray(input)) return "array";
  if (typeof input === "string") return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (
        obj &&
        Object.getPrototypeOf(obj) !== Object.prototype &&
        "constructor" in obj &&
        obj.constructor
      ) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst,
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj)
    .filter(([k, _]) => {
      return Number.isNaN(Number.parseInt(k, 10));
    })
    .map((el) => el[1]);
}
function base64ToUint8Array(base642) {
  const binaryString = atob(base642);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
function uint8ArrayToBase64(bytes) {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}
function base64urlToUint8Array(base64url2) {
  const base642 = base64url2.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base642.length % 4)) % 4);
  return base64ToUint8Array(base642 + padding);
}
function uint8ArrayToBase64url(bytes) {
  return uint8ArrayToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
function hexToUint8Array(hex) {
  const cleanHex = hex.replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}
function uint8ArrayToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
var Class = class {
  constructor(..._args) {}
};

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false,
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false,
  });
  inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false,
  });
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error2, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error2.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error2, mapper = (issue2) => issue2.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error3, path = []) => {
    for (const issue2 of error3.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) =>
          processError({ issues }, [...path, ...issue2.path])
        );
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue2));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }
  };
  processError(error2);
  return fieldErrors;
}

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  if (result.issues.length) {
    const e = new (_params?.Err ?? _Err)(
      result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
    );
    captureStackTrace(e, _params?.callee);
    throw e;
  }
  return result.value;
};
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) result = await result;
  if (result.issues.length) {
    const e = new (params?.Err ?? _Err)(
      result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
    );
    captureStackTrace(e, params?.callee);
    throw e;
  }
  return result.value;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length
    ? {
        success: false,
        error: new (_Err ?? $ZodError)(
          result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        ),
      }
    : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) result = await result;
  return result.issues.length
    ? {
        success: false,
        error: new _Err(
          result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        ),
      }
    : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);
var _encode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx
    ? { ..._ctx, direction: "backward" }
    : { direction: "backward" };
  return _parse(_Err)(schema, value, ctx);
};
var _decode = (_Err) => (schema, value, _ctx) => {
  return _parse(_Err)(schema, value, _ctx);
};
var _encodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx
    ? { ..._ctx, direction: "backward" }
    : { direction: "backward" };
  return _parseAsync(_Err)(schema, value, ctx);
};
var _decodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _parseAsync(_Err)(schema, value, _ctx);
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx
    ? { ..._ctx, direction: "backward" }
    : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx
    ? { ..._ctx, direction: "backward" }
    : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/regexes.js
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
var duration =
  /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var guid =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version4) => {
  if (!version4)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(
    `^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version4}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`
  );
};
var email =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 =
  /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 =
  /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex =
    typeof args.precision === "number"
      ? args.precision === -1
        ? `${hhmm}`
        : args.precision === 0
          ? `${hhmm}:[0-5]\\d`
          : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}`
      : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time3 = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local) opts.push("");
  if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const timeRegex = `${time3}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string = (params) => {
  const regex = params
    ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}`
    : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;
var _null = /^null$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a3;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a3 = inst._zod).onattach ?? (_a3.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date",
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor(
  "$ZodCheckLessThan",
  (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      const curr =
        (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ??
        Number.POSITIVE_INFINITY;
      if (def.value < curr) {
        if (def.inclusive) bag.maximum = def.value;
        else bag.exclusiveMaximum = def.value;
      }
    });
    inst._zod.check = (payload) => {
      if (
        def.inclusive ? payload.value <= def.value : payload.value < def.value
      ) {
        return;
      }
      payload.issues.push({
        origin,
        code: "too_big",
        maximum:
          typeof def.value === "object" ? def.value.getTime() : def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor(
  "$ZodCheckGreaterThan",
  (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      const curr =
        (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ??
        Number.NEGATIVE_INFINITY;
      if (def.value > curr) {
        if (def.inclusive) bag.minimum = def.value;
        else bag.exclusiveMinimum = def.value;
      }
    });
    inst._zod.check = (payload) => {
      if (
        def.inclusive ? payload.value >= def.value : payload.value > def.value
      ) {
        return;
      }
      payload.issues.push({
        origin,
        code: "too_small",
        minimum:
          typeof def.value === "object" ? def.value.getTime() : def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor(
  "$ZodCheckMultipleOf",
  (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst2) => {
      var _a3;
      (_a3 = inst2._zod.bag).multipleOf ?? (_a3.multipleOf = def.value);
    });
    inst._zod.check = (payload) => {
      if (typeof payload.value !== typeof def.value)
        throw new Error("Cannot mix number and bigint in multiple_of check.");
      const isMultiple =
        typeof payload.value === "bigint"
          ? payload.value % def.value === BigInt(0)
          : floatSafeRemainder(payload.value, def.value) === 0;
      if (isMultiple) return;
      payload.issues.push({
        origin: typeof payload.value,
        code: "not_multiple_of",
        divisor: def.value,
        input: payload.value,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor(
  "$ZodCheckNumberFormat",
  (inst, def) => {
    $ZodCheck.init(inst, def);
    def.format = def.format || "float64";
    const isInt = def.format?.includes("int");
    const origin = isInt ? "int" : "number";
    const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.format = def.format;
      bag.minimum = minimum;
      bag.maximum = maximum;
      if (isInt) bag.pattern = integer;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      if (isInt) {
        if (!Number.isInteger(input)) {
          payload.issues.push({
            expected: origin,
            format: def.format,
            code: "invalid_type",
            continue: false,
            input,
            inst,
          });
          return;
        }
        if (!Number.isSafeInteger(input)) {
          if (input > 0) {
            payload.issues.push({
              input,
              code: "too_big",
              maximum: Number.MAX_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              inclusive: true,
              continue: !def.abort,
            });
          } else {
            payload.issues.push({
              input,
              code: "too_small",
              minimum: Number.MIN_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              inclusive: true,
              continue: !def.abort,
            });
          }
          return;
        }
      }
      if (input < minimum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_small",
          minimum,
          inclusive: true,
          inst,
          continue: !def.abort,
        });
      }
      if (input > maximum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_big",
          maximum,
          inclusive: true,
          inst,
          continue: !def.abort,
        });
      }
    };
  }
);
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor(
  "$ZodCheckMaxLength",
  (inst, def) => {
    var _a3;
    $ZodCheck.init(inst, def);
    (_a3 = inst._zod.def).when ??
      (_a3.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== void 0;
      });
    inst._zod.onattach.push((inst2) => {
      const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
      if (def.maximum < curr) inst2._zod.bag.maximum = def.maximum;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      const length2 = input.length;
      if (length2 <= def.maximum) return;
      const origin = getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_big",
        maximum: def.maximum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckMinLength = /* @__PURE__ */ $constructor(
  "$ZodCheckMinLength",
  (inst, def) => {
    var _a3;
    $ZodCheck.init(inst, def);
    (_a3 = inst._zod.def).when ??
      (_a3.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== void 0;
      });
    inst._zod.onattach.push((inst2) => {
      const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
      if (def.minimum > curr) inst2._zod.bag.minimum = def.minimum;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      const length2 = input.length;
      if (length2 >= def.minimum) return;
      const origin = getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_small",
        minimum: def.minimum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor(
  "$ZodCheckLengthEquals",
  (inst, def) => {
    var _a3;
    $ZodCheck.init(inst, def);
    (_a3 = inst._zod.def).when ??
      (_a3.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== void 0;
      });
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.minimum = def.length;
      bag.maximum = def.length;
      bag.length = def.length;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      const length2 = input.length;
      if (length2 === def.length) return;
      const origin = getLengthableOrigin(input);
      const tooBig = length2 > def.length;
      payload.issues.push({
        origin,
        ...(tooBig
          ? { code: "too_big", maximum: def.length }
          : { code: "too_small", minimum: def.length }),
        inclusive: true,
        exact: true,
        input: payload.value,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor(
  "$ZodCheckStringFormat",
  (inst, def) => {
    var _a3, _b;
    $ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.format = def.format;
      if (def.pattern) {
        bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
        bag.patterns.add(def.pattern);
      }
    });
    if (def.pattern)
      (_a3 = inst._zod).check ??
        (_a3.check = (payload) => {
          def.pattern.lastIndex = 0;
          if (def.pattern.test(payload.value)) return;
          payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: def.format,
            input: payload.value,
            ...(def.pattern ? { pattern: def.pattern.toString() } : {}),
            inst,
            continue: !def.abort,
          });
        });
    else (_b = inst._zod).check ?? (_b.check = () => {});
  }
);
var $ZodCheckRegex = /* @__PURE__ */ $constructor(
  "$ZodCheckRegex",
  (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value)) return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "regex",
        input: payload.value,
        pattern: def.pattern.toString(),
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor(
  "$ZodCheckLowerCase",
  (inst, def) => {
    def.pattern ?? (def.pattern = lowercase);
    $ZodCheckStringFormat.init(inst, def);
  }
);
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor(
  "$ZodCheckUpperCase",
  (inst, def) => {
    def.pattern ?? (def.pattern = uppercase);
    $ZodCheckStringFormat.init(inst, def);
  }
);
var $ZodCheckIncludes = /* @__PURE__ */ $constructor(
  "$ZodCheckIncludes",
  (inst, def) => {
    $ZodCheck.init(inst, def);
    const escapedRegex = escapeRegex(def.includes);
    const pattern = new RegExp(
      typeof def.position === "number"
        ? `^.{${def.position}}${escapedRegex}`
        : escapedRegex
    );
    def.pattern = pattern;
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
      bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
      if (payload.value.includes(def.includes, def.position)) return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "includes",
        includes: def.includes,
        input: payload.value,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor(
  "$ZodCheckStartsWith",
  (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
      bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
      if (payload.value.startsWith(def.prefix)) return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "starts_with",
        prefix: def.prefix,
        input: payload.value,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor(
  "$ZodCheckEndsWith",
  (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
      bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
      if (payload.value.endsWith(def.suffix)) return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "ends_with",
        suffix: def.suffix,
        input: payload.value,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor(
  "$ZodCheckOverwrite",
  (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
      payload.value = def.tx(payload.value);
    };
  }
);

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/doc.js
var Doc = class {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this) this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split("\n").filter((x) => x);
    const minIndent = Math.min(
      ...lines.map((x) => x.length - x.trimStart().length)
    );
    const dedented = lines
      .map((x) => x.slice(minIndent))
      .map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join("\n"));
  }
};

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 4,
  patch: 3,
};

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a3;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...(inst._zod.def.checks ?? [])];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a3 = inst._zod).deferred ?? (_a3.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload)) continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun) continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen) return;
            if (!isAborted) isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen) continue;
          if (!isAborted) isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false) throw new $ZodAsyncError();
        return checkResult.then((checkResult2) =>
          inst._zod.parse(checkResult2, ctx)
        );
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse(
          { value: payload.value, issues: [] },
          { ...ctx, skipChecks: true }
        );
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false) throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  defineLazy(inst, "~standard", () => ({
    validate: (value) => {
      try {
        const r = safeParse(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync(inst, value).then((r) =>
          r.success ? { value: r.data } : { issues: r.error?.issues }
        );
      }
    },
    vendor: "zod",
    version: 1,
  }));
});
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern =
    [...(inst?._zod.bag?.patterns ?? [])].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {}
    if (typeof payload.value === "string") return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst,
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor(
  "$ZodStringFormat",
  (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    $ZodString.init(inst, def);
  }
);
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8,
    };
    const v = versionMap[def.version];
    if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      if (!def.normalize && def.protocol?.source === httpProtocol.source) {
        if (!/^https?:\/\//i.test(trimmed)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort,
          });
          return;
        }
      }
      const url = new URL(trimmed);
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort,
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (
          !def.protocol.test(
            url.protocol.endsWith(":")
              ? url.protocol.slice(0, -1)
              : url.protocol
          )
        ) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort,
          });
        }
      }
      if (def.normalize) {
        payload.value = url.href;
      } else {
        payload.value = trimmed;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort,
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor(
  "$ZodISODateTime",
  (inst, def) => {
    def.pattern ?? (def.pattern = datetime(def));
    $ZodStringFormat.init(inst, def);
  }
);
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor(
  "$ZodISODuration",
  (inst, def) => {
    def.pattern ?? (def.pattern = duration);
    $ZodStringFormat.init(inst, def);
  }
);
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv4`;
});
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv6`;
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort,
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const parts = payload.value.split("/");
    try {
      if (parts.length !== 2) throw new Error();
      const [address, prefix] = parts;
      if (!prefix) throw new Error();
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix) throw new Error();
      if (prefixNum < 0 || prefixNum > 128) throw new Error();
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort,
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "") return true;
  if (/\s/.test(data)) return false;
  if (data.length % 4 !== 0) return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64";
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value)) return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort,
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data)) return false;
  const base642 = data.replace(/[-_]/g, (c) => (c === "-" ? "+" : "/"));
  const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor(
  "$ZodBase64URL",
  (inst, def) => {
    def.pattern ?? (def.pattern = base64url);
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.contentEncoding = "base64url";
    inst._zod.check = (payload) => {
      if (isValidBase64URL(payload.value)) return;
      payload.issues.push({
        code: "invalid_format",
        format: "base64url",
        input: payload.value,
        inst,
        continue: !def.abort,
      });
    };
  }
);
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3) return false;
    const [header] = tokensParts;
    if (!header) return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
    if (!parsedHeader.alg) return false;
    if (
      algorithm &&
      (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg)) return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort,
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (
      typeof input === "number" &&
      !Number.isNaN(input) &&
      Number.isFinite(input)
    ) {
      return payload;
    }
    const received =
      typeof input === "number"
        ? Number.isNaN(input)
          ? "NaN"
          : !Number.isFinite(input)
            ? "Infinity"
            : void 0
        : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...(received ? { received } : {}),
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor(
  "$ZodNumberFormat",
  (inst, def) => {
    $ZodCheckNumberFormat.init(inst, def);
    $ZodNumber.init(inst, def);
  }
);
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "boolean") return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst,
    });
    return payload;
  };
});
var $ZodNull = /* @__PURE__ */ $constructor("$ZodNull", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _null;
  inst._zod.values = /* @__PURE__ */ new Set([null]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input === null) return payload;
    payload.issues.push({
      expected: "null",
      code: "invalid_type",
      input,
      inst,
    });
    return payload;
  };
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst,
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst,
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run(
        {
          value: item,
          issues: [],
        },
        ctx
      );
      if (result instanceof Promise) {
        proms.push(
          result.then((result2) => handleArrayResult(result2, payload, i))
        );
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(
  result,
  final,
  key2,
  input,
  isOptionalIn,
  isOptionalOut
) {
  const isPresent = key2 in input;
  if (result.issues.length) {
    if (isOptionalIn && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key2, result.issues));
  }
  if (!isPresent && !isOptionalIn) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key2],
      });
    }
    return;
  }
  if (result.value === void 0) {
    if (isPresent) {
      final.value[key2] = void 0;
    }
  } else {
    final.value[key2] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k of keys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys),
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const isOptionalIn = _catchall.optin === "optional";
  const isOptionalOut = _catchall.optout === "optional";
  for (const key2 in input) {
    if (key2 === "__proto__") continue;
    if (keySet.has(key2)) continue;
    if (t === "never") {
      unrecognized.push(key2);
      continue;
    }
    const r = _catchall.run({ value: input[key2], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(
        r.then((r2) =>
          handlePropertyResult(
            r2,
            payload,
            key2,
            input,
            isOptionalIn,
            isOptionalOut
          )
        )
      );
    } else {
      handlePropertyResult(
        r,
        payload,
        key2,
        input,
        isOptionalIn,
        isOptionalOut
      );
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst,
    });
  }
  if (!proms.length) return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh,
        });
        return newSh;
      },
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key2 in shape) {
      const field = shape[key2]._zod;
      if (field.values) {
        propValues[key2] ?? (propValues[key2] = /* @__PURE__ */ new Set());
        for (const v of field.values) propValues[key2].add(v);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst,
      });
      return payload;
    }
    payload.value = {};
    const proms = [];
    const shape = value.shape;
    for (const key2 of value.keys) {
      const el = shape[key2];
      const isOptionalIn = el._zod.optin === "optional";
      const isOptionalOut = el._zod.optout === "optional";
      const r = el._zod.run({ value: input[key2], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(
          r.then((r2) =>
            handlePropertyResult(
              r2,
              payload,
              key2,
              input,
              isOptionalIn,
              isOptionalOut
            )
          )
        );
      } else {
        handlePropertyResult(
          r,
          payload,
          key2,
          input,
          isOptionalIn,
          isOptionalOut
        );
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor(
  "$ZodObjectJIT",
  (inst, def) => {
    $ZodObject.init(inst, def);
    const superParse = inst._zod.parse;
    const _normalized = cached(() => normalizeDef(def));
    const generateFastpass = (shape) => {
      const doc = new Doc(["shape", "payload", "ctx"]);
      const normalized = _normalized.value;
      const parseStr = (key2) => {
        const k = esc(key2);
        return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
      };
      doc.write(`const input = payload.value;`);
      const ids = /* @__PURE__ */ Object.create(null);
      let counter = 0;
      for (const key2 of normalized.keys) {
        ids[key2] = `key_${counter++}`;
      }
      doc.write(`const newResult = {};`);
      for (const key2 of normalized.keys) {
        const id = ids[key2];
        const k = esc(key2);
        const schema = shape[key2];
        const isOptionalIn = schema?._zod?.optin === "optional";
        const isOptionalOut = schema?._zod?.optout === "optional";
        doc.write(`const ${id} = ${parseStr(key2)};`);
        if (isOptionalIn && isOptionalOut) {
          doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
        } else if (!isOptionalIn) {
          doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
        } else {
          doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
        }
      }
      doc.write(`payload.value = newResult;`);
      doc.write(`return payload;`);
      const fn = doc.compile();
      return (payload, ctx) => fn(shape, payload, ctx);
    };
    let fastpass;
    const isObject2 = isObject;
    const jit = !globalConfig.jitless;
    const allowsEval2 = allowsEval;
    const fastEnabled = jit && allowsEval2.value;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
      value ?? (value = _normalized.value);
      const input = payload.value;
      if (!isObject2(input)) {
        payload.issues.push({
          expected: "object",
          code: "invalid_type",
          input,
          inst,
        });
        return payload;
      }
      if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
        if (!fastpass) fastpass = generateFastpass(def.shape);
        payload = fastpass(payload, ctx);
        if (!catchall) return payload;
        return handleCatchall([], input, payload, ctx, value, inst);
      }
      return superParse(payload, ctx);
    };
  }
);
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) =>
      result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
    ),
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () =>
    def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0
  );
  defineLazy(inst._zod, "optout", () =>
    def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0
  );
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(
        def.options.flatMap((option) => Array.from(option._zod.values))
      );
    }
    return void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(
        `^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`
      );
    }
    return void 0;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run(
        {
          value: payload.value,
          issues: [],
        },
        ctx
      );
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0) return result;
        results.push(result);
      }
    }
    if (!async) return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor(
  "$ZodDiscriminatedUnion",
  (inst, def) => {
    def.inclusive = false;
    $ZodUnion.init(inst, def);
    const _super = inst._zod.parse;
    defineLazy(inst._zod, "propValues", () => {
      const propValues = {};
      for (const option of def.options) {
        const pv = option._zod.propValues;
        if (!pv || Object.keys(pv).length === 0)
          throw new Error(
            `Invalid discriminated union option at index "${def.options.indexOf(option)}"`
          );
        for (const [k, v] of Object.entries(pv)) {
          if (!propValues[k]) propValues[k] = /* @__PURE__ */ new Set();
          for (const val of v) {
            propValues[k].add(val);
          }
        }
      }
      return propValues;
    });
    const disc = cached(() => {
      const opts = def.options;
      const map = /* @__PURE__ */ new Map();
      for (const o of opts) {
        const values = o._zod.propValues?.[def.discriminator];
        if (!values || values.size === 0)
          throw new Error(
            `Invalid discriminated union option at index "${def.options.indexOf(o)}"`
          );
        for (const v of values) {
          if (map.has(v)) {
            throw new Error(`Duplicate discriminator value "${String(v)}"`);
          }
          map.set(v, o);
        }
      }
      return map;
    });
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!isObject(input)) {
        payload.issues.push({
          code: "invalid_type",
          expected: "object",
          input,
          inst,
        });
        return payload;
      }
      const opt = disc.value.get(input?.[def.discriminator]);
      if (opt) {
        return opt._zod.run(payload, ctx);
      }
      if (def.unionFallback || ctx.direction === "backward") {
        return _super(payload, ctx);
      }
      payload.issues.push({
        code: "invalid_union",
        errors: [],
        note: "No matching discriminator",
        discriminator: def.discriminator,
        options: Array.from(disc.value.keys()),
        input,
        path: [def.discriminator],
        inst,
      });
      return payload;
    };
  }
);
var $ZodIntersection = /* @__PURE__ */ $constructor(
  "$ZodIntersection",
  (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      const left = def.left._zod.run({ value: input, issues: [] }, ctx);
      const right = def.right._zod.run({ value: input, issues: [] }, ctx);
      const async = left instanceof Promise || right instanceof Promise;
      if (async) {
        return Promise.all([left, right]).then(([left2, right2]) => {
          return handleIntersectionResults(payload, left2, right2);
        });
      }
      return handleIntersectionResults(payload, left, right);
    };
  }
);
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter(
      (key2) => bKeys.indexOf(key2) !== -1
    );
    const newObj = { ...a, ...b };
    for (const key2 of sharedKeys) {
      const sharedValue = mergeValues(a[key2], b[key2]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key2, ...sharedValue.mergeErrorPath],
        };
      }
      newObj[key2] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath],
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = /* @__PURE__ */ new Map();
  let unrecIssue;
  for (const iss of left.issues) {
    if (iss.code === "unrecognized_keys") {
      unrecIssue ?? (unrecIssue = iss);
      for (const k of iss.keys) {
        if (!unrecKeys.has(k)) unrecKeys.set(k, {});
        unrecKeys.get(k).l = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  for (const iss of right.issues) {
    if (iss.code === "unrecognized_keys") {
      for (const k of iss.keys) {
        if (!unrecKeys.has(k)) unrecKeys.set(k, {});
        unrecKeys.get(k).r = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length && unrecIssue) {
    result.issues.push({ ...unrecIssue, keys: bothKeys });
  }
  if (aborted(result)) return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(
      `Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`
    );
  }
  result.value = merged.data;
  return result;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst,
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values) {
      payload.value = {};
      const recordKeys = /* @__PURE__ */ new Set();
      for (const key2 of values) {
        if (
          typeof key2 === "string" ||
          typeof key2 === "number" ||
          typeof key2 === "symbol"
        ) {
          recordKeys.add(typeof key2 === "number" ? key2.toString() : key2);
          const keyResult = def.keyType._zod.run(
            { value: key2, issues: [] },
            ctx
          );
          if (keyResult instanceof Promise) {
            throw new Error(
              "Async schemas not supported in object keys currently"
            );
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) =>
                finalizeIssue(iss, ctx, config())
              ),
              input: key2,
              path: [key2],
              inst,
            });
            continue;
          }
          const outKey = keyResult.value;
          const result = def.valueType._zod.run(
            { value: input[key2], issues: [] },
            ctx
          );
          if (result instanceof Promise) {
            proms.push(
              result.then((result2) => {
                if (result2.issues.length) {
                  payload.issues.push(...prefixIssues(key2, result2.issues));
                }
                payload.value[outKey] = result2.value;
              })
            );
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key2, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key2 in input) {
        if (!recordKeys.has(key2)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key2);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized,
        });
      }
    } else {
      payload.value = {};
      for (const key2 of Reflect.ownKeys(input)) {
        if (key2 === "__proto__") continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key2)) continue;
        let keyResult = def.keyType._zod.run({ value: key2, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error(
            "Async schemas not supported in object keys currently"
          );
        }
        const checkNumericKey =
          typeof key2 === "string" &&
          number.test(key2) &&
          keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run(
            { value: Number(key2), issues: [] },
            ctx
          );
          if (retryResult instanceof Promise) {
            throw new Error(
              "Async schemas not supported in object keys currently"
            );
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key2] = input[key2];
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) =>
                finalizeIssue(iss, ctx, config())
              ),
              input: key2,
              path: [key2],
              inst,
            });
          }
          continue;
        }
        const result = def.valueType._zod.run(
          { value: input[key2], issues: [] },
          ctx
        );
        if (result instanceof Promise) {
          proms.push(
            result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key2, result2.issues));
              }
              payload.value[keyResult.value] = result2.value;
            })
          );
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key2, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  inst._zod.pattern = new RegExp(
    `^(${values
      .filter((k) => propertyKeyTypes.has(typeof k))
      .map((o) => (typeof o === "string" ? escapeRegex(o) : o.toString()))
      .join("|")})$`
  );
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst,
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  if (def.values.length === 0) {
    throw new Error("Cannot create literal schema with no valid values");
  }
  const values = new Set(def.values);
  inst._zod.values = values;
  inst._zod.pattern = new RegExp(
    `^(${def.values.map((o) => (typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o))).join("|")})$`
  );
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst,
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor(
  "$ZodTransform",
  (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        throw new $ZodEncodeError(inst.constructor.name);
      }
      const _out = def.transform(payload.value, payload);
      if (ctx.async) {
        const output = _out instanceof Promise ? _out : Promise.resolve(_out);
        return output.then((output2) => {
          payload.value = output2;
          payload.fallback = true;
          return payload;
        });
      }
      if (_out instanceof Promise) {
        throw new $ZodAsyncError();
      }
      payload.value = _out;
      payload.fallback = true;
      return payload;
    };
  }
);
function handleOptionalResult(result, input) {
  if (input === void 0 && (result.issues.length || result.fallback)) {
    return { issues: [], value: void 0 };
  }
  return result;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values
      ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0])
      : void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      const input = payload.value;
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise)
        return result.then((r) => handleOptionalResult(r, input));
      return handleOptionalResult(result, input);
    }
    if (payload.value === void 0) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodExactOptional = /* @__PURE__ */ $constructor(
  "$ZodExactOptional",
  (inst, def) => {
    $ZodOptional.init(inst, def);
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
    inst._zod.parse = (payload, ctx) => {
      return def.innerType._zod.run(payload, ctx);
    };
  }
);
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern
      ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`)
      : void 0;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values
      ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null])
      : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null) return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === void 0) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor(
  "$ZodNonOptional",
  (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "values", () => {
      const v = def.innerType._zod.values;
      return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
    });
    inst._zod.parse = (payload, ctx) => {
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleNonOptionalResult(result2, inst));
      }
      return handleNonOptionalResult(result, inst);
    };
  }
);
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === void 0) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst,
    });
  }
  return payload;
}
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.value;
        if (result2.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result2.issues.map((iss) =>
                finalizeIssue(iss, ctx, config())
              ),
            },
            input: payload.value,
          });
          payload.issues = [];
          payload.fallback = true;
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())),
        },
        input: payload.value,
      });
      payload.issues = [];
      payload.fallback = true;
    }
    return payload;
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handlePipeResult(right2, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run(
    { value: left.value, issues: left.issues, fallback: left.fallback },
    ctx
  );
}
var $ZodPreprocess = /* @__PURE__ */ $constructor(
  "$ZodPreprocess",
  (inst, def) => {
    $ZodPipe.init(inst, def);
  }
);
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
  defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodLazy = /* @__PURE__ */ $constructor("$ZodLazy", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "innerType", () => {
    const d = def;
    if (!d._cachedInner) d._cachedInner = def.getter();
    return d._cachedInner;
  });
  defineLazy(inst._zod, "pattern", () => inst._zod.innerType?._zod?.pattern);
  defineLazy(
    inst._zod,
    "propValues",
    () => inst._zod.innerType?._zod?.propValues
  );
  defineLazy(
    inst._zod,
    "optin",
    () => inst._zod.innerType?._zod?.optin ?? void 0
  );
  defineLazy(
    inst._zod,
    "optout",
    () => inst._zod.innerType?._zod?.optout ?? void 0
  );
  inst._zod.parse = (payload, ctx) => {
    const inner = inst._zod.innerType;
    return inner._zod.run(payload, ctx);
  };
});
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      // incorporates params.error into issue reporting
      path: [...(inst._zod.def.path ?? [])],
      // incorporates params.error into issue reporting
      continue: !inst._zod.def.abort,
      // params: inst._zod.def.params,
    };
    if (inst._zod.def.params) _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/locales/en.js
var error = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" },
    map: { unit: "entries", verb: "to have" },
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    mac: "MAC address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input",
  };
  const TypeDictionary = {
    // Compatibility: "nan" -> "NaN" for display
    nan: "NaN",
    // All other type names omitted - they fall back to raw values via ?? operator
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        return `Invalid input: expected ${expected}, received ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue2.origin}`;
      case "invalid_union":
        if (
          issue2.options &&
          Array.isArray(issue2.options) &&
          issue2.options.length > 0
        ) {
          const opts = issue2.options.map((o) => `'${o}'`).join(" | ");
          return `Invalid discriminator value. Expected ${opts}`;
        }
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue2.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default() {
  return {
    localeError: error(),
  };
}

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
var _a2;
var $ZodRegistry = class {
  constructor() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
  }
  add(schema, ..._meta) {
    const meta2 = _meta[0];
    this._map.set(schema, meta2);
    if (meta2 && typeof meta2 === "object" && "id" in meta2) {
      this._idmap.set(meta2.id, schema);
    }
    return this;
  }
  clear() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
    return this;
  }
  remove(schema) {
    const meta2 = this._map.get(schema);
    if (meta2 && typeof meta2 === "object" && "id" in meta2) {
      this._idmap.delete(meta2.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...(this.get(p) ?? {}) };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : void 0;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
};
function registry() {
  return new $ZodRegistry();
}
(_a2 = globalThis).__zod_globalRegistry ??
  (_a2.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function _string(Class2, params) {
  return new Class2({
    type: "string",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _number(Class2, params) {
  return new Class2({
    type: "number",
    checks: [],
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _null2(Class2, params) {
  return new Class2({
    type: "null",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class2) {
  return new Class2({
    type: "unknown",
  });
}
// @__NO_SIDE_EFFECTS__
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false,
  });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true,
  });
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false,
  });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true,
  });
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value,
  });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum,
  });
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum,
  });
}
// @__NO_SIDE_EFFECTS__
function _length(length2, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length: length2,
  });
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern,
  });
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes,
  });
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix,
  });
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix,
  });
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx,
  });
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
  return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
  return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
  return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class2, element, params) {
  return new Class2({
    type: "array",
    element,
    // get element() {
    //   return element;
    // },
    ...normalizeParams(params),
  });
}
// @__NO_SIDE_EFFECTS__
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params),
  });
  return schema;
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
  const ch = /* @__PURE__ */ _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal) _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params),
  });
  ch._zod.check = fn;
  return ch;
}

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
  let target2 = params?.target ?? "draft-2020-12";
  if (target2 === "draft-4") target2 = "draft-04";
  if (target2 === "draft-7") target2 = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target: target2,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {}),
    io: params?.io ?? "output",
    counter: 0,
    seen: /* @__PURE__ */ new Map(),
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    external: params?.external ?? void 0,
  };
}
function process(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a3;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: void 0, path: _params.path };
  ctx.seen.set(schema, result);
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path,
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(
          `[toJSONSchema]: Non-representable type encountered: ${def.type}`
        );
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref) result.ref = parent;
      process(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta2 = ctx.metadataRegistry.get(schema);
  if (meta2) Object.assign(result.schema, meta2);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a3 = result.schema).default ?? (_a3.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
  const idToSchema = /* @__PURE__ */ new Map();
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(
          `Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`
        );
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment =
      ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id2) => id2);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id =
        entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return {
        defId: id,
        ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}`,
      };
    }
    if (entry[1] === root) {
      return { ref: "#" };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + defId };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId) seen.defId = defId;
    const schema2 = seen.schema;
    for (const key2 in schema2) {
      delete schema2[key2];
    }
    schema2.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null) return;
    const schema2 = seen.def ?? seen.schema;
    const _cached = { ...schema2 };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (
        refSchema.$ref &&
        (ctx.target === "draft-07" ||
          ctx.target === "draft-04" ||
          ctx.target === "openapi-3.0")
      ) {
        schema2.allOf = schema2.allOf ?? [];
        schema2.allOf.push(refSchema);
      } else {
        Object.assign(schema2, refSchema);
      }
      Object.assign(schema2, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key2 in schema2) {
          if (key2 === "$ref" || key2 === "allOf") continue;
          if (!(key2 in _cached)) {
            delete schema2[key2];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key2 in schema2) {
          if (key2 === "$ref" || key2 === "allOf") continue;
          if (
            key2 in refSeen.def &&
            JSON.stringify(schema2[key2]) === JSON.stringify(refSeen.def[key2])
          ) {
            delete schema2[key2];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema2.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key2 in schema2) {
            if (key2 === "$ref" || key2 === "allOf") continue;
            if (
              key2 in parentSeen.def &&
              JSON.stringify(schema2[key2]) ===
                JSON.stringify(parentSeen.def[key2])
            ) {
              delete schema2[key2];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema2,
      path: seen.path ?? [],
    });
  };
  for (const entry of [...ctx.seen.entries()].reverse()) {
    flattenRef(entry[0]);
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {
  } else {
  }
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id) throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  Object.assign(result, root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
  const defs = ctx.external?.defs ?? {};
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (seen.def && seen.defId) {
      if (seen.def.id === seen.defId) delete seen.def.id;
      defs[seen.defId] = seen.def;
    }
  }
  if (ctx.external) {
  } else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(
            schema,
            "input",
            ctx.processors
          ),
          output: createStandardJSONSchemaMethod(
            schema,
            "output",
            ctx.processors
          ),
        },
      },
      enumerable: false,
      writable: false,
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
  if (ctx.seen.has(_schema)) return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform") return true;
  if (def.type === "array") return isTransforming(def.element, ctx);
  if (def.type === "set") return isTransforming(def.valueType, ctx);
  if (def.type === "lazy") return isTransforming(def.getter(), ctx);
  if (
    def.type === "promise" ||
    def.type === "optional" ||
    def.type === "nonoptional" ||
    def.type === "nullable" ||
    def.type === "readonly" ||
    def.type === "default" ||
    def.type === "prefault"
  ) {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return (
      isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx)
    );
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec")) return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key2 in def.shape) {
      if (isTransforming(def.shape[key2], ctx)) return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx)) return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx)) return true;
    }
    if (def.rest && isTransforming(def.rest, ctx)) return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod =
  (schema, processors = {}) =>
  (params) => {
    const ctx = initializeContext({ ...params, processors });
    process(schema, ctx);
    extractDefs(ctx, schema);
    return finalize(ctx, schema);
  };
var createStandardJSONSchemaMethod =
  (schema, io, processors = {}) =>
  (params) => {
    const { libraryOptions, target: target2 } = params ?? {};
    const ctx = initializeContext({
      ...(libraryOptions ?? {}),
      target: target2,
      io,
      processors,
    });
    process(schema, ctx);
    extractDefs(ctx, schema);
    return finalize(ctx, schema);
  };

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
var formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: "",
  // do not set
};
var stringProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  json.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding } =
    schema._zod.bag;
  if (typeof minimum === "number") json.minLength = minimum;
  if (typeof maximum === "number") json.maxLength = maximum;
  if (format) {
    json.format = formatMap[format] ?? format;
    if (json.format === "") delete json.format;
    if (format === "time") {
      delete json.format;
    }
  }
  if (contentEncoding) json.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const regexes = [...patterns];
    if (regexes.length === 1) json.pattern = regexes[0].source;
    else if (regexes.length > 1) {
      json.allOf = [
        ...regexes.map((regex) => ({
          ...(ctx.target === "draft-07" ||
          ctx.target === "draft-04" ||
          ctx.target === "openapi-3.0"
            ? { type: "string" }
            : {}),
          pattern: regex.source,
        })),
      ];
    }
  }
};
var numberProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  const {
    minimum,
    maximum,
    format,
    multipleOf,
    exclusiveMaximum,
    exclusiveMinimum,
  } = schema._zod.bag;
  if (typeof format === "string" && format.includes("int"))
    json.type = "integer";
  else json.type = "number";
  const exMin =
    typeof exclusiveMinimum === "number" &&
    exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax =
    typeof exclusiveMaximum === "number" &&
    exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json.minimum = exclusiveMinimum;
      json.exclusiveMinimum = true;
    } else {
      json.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json.maximum = exclusiveMaximum;
      json.exclusiveMaximum = true;
    } else {
      json.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json.maximum = maximum;
  }
  if (typeof multipleOf === "number") json.multipleOf = multipleOf;
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var nullProcessor = (_schema, ctx, json, _params) => {
  if (ctx.target === "openapi-3.0") {
    json.type = "string";
    json.nullable = true;
    json.enum = [null];
  } else {
    json.type = "null";
  }
};
var neverProcessor = (_schema, _ctx, json, _params) => {
  json.not = {};
};
var unknownProcessor = (_schema, _ctx, _json, _params) => {};
var enumProcessor = (schema, _ctx, json, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.every((v) => typeof v === "number")) json.type = "number";
  if (values.every((v) => typeof v === "string")) json.type = "string";
  json.enum = values;
};
var literalProcessor = (schema, ctx, json, _params) => {
  const def = schema._zod.def;
  const vals = [];
  for (const val of def.values) {
    if (val === void 0) {
      if (ctx.unrepresentable === "throw") {
        throw new Error(
          "Literal `undefined` cannot be represented in JSON Schema"
        );
      } else {
      }
    } else if (typeof val === "bigint") {
      if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt literals cannot be represented in JSON Schema");
      } else {
        vals.push(Number(val));
      }
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) {
  } else if (vals.length === 1) {
    const val = vals[0];
    json.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json.enum = [val];
    } else {
      json.const = val;
    }
  } else {
    if (vals.every((v) => typeof v === "number")) json.type = "number";
    if (vals.every((v) => typeof v === "string")) json.type = "string";
    if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
    if (vals.every((v) => v === null)) json.type = "null";
    json.enum = vals;
  }
};
var customProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Custom types cannot be represented in JSON Schema");
  }
};
var transformProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Transforms cannot be represented in JSON Schema");
  }
};
var arrayProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number") json.minItems = minimum;
  if (typeof maximum === "number") json.maxItems = maximum;
  json.type = "array";
  json.items = process(def.element, ctx, {
    ...params,
    path: [...params.path, "items"],
  });
};
var objectProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  json.properties = {};
  const shape = def.shape;
  for (const key2 in shape) {
    json.properties[key2] = process(shape[key2], ctx, {
      ...params,
      path: [...params.path, "properties", key2],
    });
  }
  const allKeys = new Set(Object.keys(shape));
  const requiredKeys = new Set(
    [...allKeys].filter((key2) => {
      const v = def.shape[key2]._zod;
      if (ctx.io === "input") {
        return v.optin === void 0;
      } else {
        return v.optout === void 0;
      }
    })
  );
  if (requiredKeys.size > 0) {
    json.required = Array.from(requiredKeys);
  }
  if (def.catchall?._zod.def.type === "never") {
    json.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output") json.additionalProperties = false;
  } else if (def.catchall) {
    json.additionalProperties = process(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"],
    });
  }
};
var unionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) =>
    process(x, ctx, {
      ...params,
      path: [...params.path, isExclusive ? "oneOf" : "anyOf", i],
    })
  );
  if (isExclusive) {
    json.oneOf = options;
  } else {
    json.anyOf = options;
  }
};
var intersectionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const a = process(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0],
  });
  const b = process(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1],
  });
  const isSimpleIntersection = (val) =>
    "allOf" in val && Object.keys(val).length === 1;
  const allOf = [
    ...(isSimpleIntersection(a) ? a.allOf : [a]),
    ...(isSimpleIntersection(b) ? b.allOf : [b]),
  ];
  json.allOf = allOf;
};
var recordProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  const keyType = def.keyType;
  const keyBag = keyType._zod.bag;
  const patterns = keyBag?.patterns;
  if (def.mode === "loose" && patterns && patterns.size > 0) {
    const valueSchema2 = process(def.valueType, ctx, {
      ...params,
      path: [...params.path, "patternProperties", "*"],
    });
    json.patternProperties = {};
    for (const pattern of patterns) {
      json.patternProperties[pattern.source] = valueSchema2;
    }
  } else {
    if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
      json.propertyNames = process(def.keyType, ctx, {
        ...params,
        path: [...params.path, "propertyNames"],
      });
    }
    json.additionalProperties = process(def.valueType, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"],
    });
  }
  const keyValues = keyType._zod.values;
  if (keyValues) {
    const validKeyValues = [...keyValues].filter(
      (v) => typeof v === "string" || typeof v === "number"
    );
    if (validKeyValues.length > 0) {
      json.required = validKeyValues;
    }
  }
};
var nullableProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const inner = process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json.nullable = true;
  } else {
    json.anyOf = [inner, { type: "null" }];
  }
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var defaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
var prefaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io === "input")
    json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
var catchProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(void 0);
  } catch {
    throw new Error("Dynamic catch values are not supported in JSON Schema");
  }
  json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType =
    ctx.io === "input" ? (inIsTransform ? def.out : def.in) : def.out;
  process(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.readOnly = true;
};
var optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var lazyProcessor = (schema, ctx, _json, params) => {
  const innerType = schema._zod.innerType;
  process(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/iso.js
var iso_exports = {};
__export(iso_exports, {
  ZodISODate: () => ZodISODate,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODuration: () => ZodISODuration,
  ZodISOTime: () => ZodISOTime,
  date: () => date2,
  datetime: () => datetime2,
  duration: () => duration2,
  time: () => time2,
});
var ZodISODateTime = /* @__PURE__ */ $constructor(
  "ZodISODateTime",
  (inst, def) => {
    $ZodISODateTime.init(inst, def);
    ZodStringFormat.init(inst, def);
  }
);
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date2(params) {
  return _isoDate(ZodISODate, params);
}
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /* @__PURE__ */ $constructor(
  "ZodISODuration",
  (inst, def) => {
    $ZodISODuration.init(inst, def);
    ZodStringFormat.init(inst, def);
  }
);
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/errors.js
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError(inst, mapper),
      // enumerable: false,
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper),
      // enumerable: false,
    },
    addIssue: {
      value: (issue2) => {
        inst.issues.push(issue2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      },
      // enumerable: false,
    },
    addIssues: {
      value: (issues2) => {
        inst.issues.push(...issues2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      },
      // enumerable: false,
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      },
      // enumerable: false,
    },
  });
};
var ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, {
  Parent: Error,
});

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/parse.js
var parse2 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
var _installedGroups = /* @__PURE__ */ new WeakMap();
function _installLazyMethods(inst, group, methods) {
  const proto = Object.getPrototypeOf(inst);
  let installed = _installedGroups.get(proto);
  if (!installed) {
    installed = /* @__PURE__ */ new Set();
    _installedGroups.set(proto, installed);
  }
  if (installed.has(group)) return;
  installed.add(group);
  for (const key2 in methods) {
    const fn = methods[key2];
    Object.defineProperty(proto, key2, {
      configurable: true,
      enumerable: false,
      get() {
        const bound = fn.bind(this);
        Object.defineProperty(this, key2, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: bound,
        });
        return bound;
      },
      set(v) {
        Object.defineProperty(this, key2, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: v,
        });
      },
    });
  }
}
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  Object.assign(inst["~standard"], {
    jsonSchema: {
      input: createStandardJSONSchemaMethod(inst, "input"),
      output: createStandardJSONSchemaMethod(inst, "output"),
    },
  });
  inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
  inst.def = def;
  inst.type = def.type;
  Object.defineProperty(inst, "_def", { value: def });
  inst.parse = (data, params) =>
    parse2(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse2(inst, data, params);
  inst.parseAsync = async (data, params) =>
    parseAsync2(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) =>
    safeParseAsync2(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.encode = (data, params) => encode(inst, data, params);
  inst.decode = (data, params) => decode(inst, data, params);
  inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
  inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
  inst.safeEncode = (data, params) => safeEncode(inst, data, params);
  inst.safeDecode = (data, params) => safeDecode(inst, data, params);
  inst.safeEncodeAsync = async (data, params) =>
    safeEncodeAsync(inst, data, params);
  inst.safeDecodeAsync = async (data, params) =>
    safeDecodeAsync(inst, data, params);
  _installLazyMethods(inst, "ZodType", {
    check(...chks) {
      const def2 = this.def;
      return this.clone(
        util_exports.mergeDefs(def2, {
          checks: [
            ...(def2.checks ?? []),
            ...chks.map((ch) =>
              typeof ch === "function"
                ? {
                    _zod: { check: ch, def: { check: "custom" }, onattach: [] },
                  }
                : ch
            ),
          ],
        }),
        { parent: true }
      );
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def2, params) {
      return clone(this, def2, params);
    },
    brand() {
      return this;
    },
    register(reg, meta2) {
      reg.add(this, meta2);
      return this;
    },
    refine(check, params) {
      return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(_overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d) {
      return _default(this, d);
    },
    prefault(d) {
      return prefault(this, d);
    },
    catch(params) {
      return _catch(this, params);
    },
    pipe(target2) {
      return pipe(this, target2);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0) return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(void 0).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn) {
      return fn(this);
    },
  });
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true,
  });
  return inst;
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    stringProcessor(inst, ctx, json, params);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  _installLazyMethods(inst, "_ZodString", {
    regex(...args) {
      return this.check(_regex(...args));
    },
    includes(...args) {
      return this.check(_includes(...args));
    },
    startsWith(...args) {
      return this.check(_startsWith(...args));
    },
    endsWith(...args) {
      return this.check(_endsWith(...args));
    },
    min(...args) {
      return this.check(_minLength(...args));
    },
    max(...args) {
      return this.check(_maxLength(...args));
    },
    length(...args) {
      return this.check(_length(...args));
    },
    nonempty(...args) {
      return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(_lowercase(params));
    },
    uppercase(params) {
      return this.check(_uppercase(params));
    },
    trim() {
      return this.check(_trim());
    },
    normalize(...args) {
      return this.check(_normalize(...args));
    },
    toLowerCase() {
      return this.check(_toLowerCase());
    },
    toUpperCase() {
      return this.check(_toUpperCase());
    },
    slugify() {
      return this.check(_slugify());
    },
  });
});
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime2(params));
  inst.date = (params) => inst.check(date2(params));
  inst.time = (params) => inst.check(time2(params));
  inst.duration = (params) => inst.check(duration2(params));
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor(
  "ZodStringFormat",
  (inst, def) => {
    $ZodStringFormat.init(inst, def);
    _ZodString.init(inst, def);
  }
);
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function uuid2(params) {
  return _uuid(ZodUUID, params);
}
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    numberProcessor(inst, ctx, json, params);
  _installLazyMethods(inst, "ZodNumber", {
    gt(value, params) {
      return this.check(_gt(value, params));
    },
    gte(value, params) {
      return this.check(_gte(value, params));
    },
    min(value, params) {
      return this.check(_gte(value, params));
    },
    lt(value, params) {
      return this.check(_lt(value, params));
    },
    lte(value, params) {
      return this.check(_lte(value, params));
    },
    max(value, params) {
      return this.check(_lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(_gt(0, params));
    },
    nonnegative(params) {
      return this.check(_gte(0, params));
    },
    negative(params) {
      return this.check(_lt(0, params));
    },
    nonpositive(params) {
      return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(_multipleOf(value, params));
    },
    step(value, params) {
      return this.check(_multipleOf(value, params));
    },
    finite() {
      return this;
    },
  });
  const bag = inst._zod.bag;
  inst.minValue =
    Math.max(
      bag.minimum ?? Number.NEGATIVE_INFINITY,
      bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY
    ) ?? null;
  inst.maxValue =
    Math.min(
      bag.maximum ?? Number.POSITIVE_INFINITY,
      bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY
    ) ?? null;
  inst.isInt =
    (bag.format ?? "").includes("int") ||
    Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor(
  "ZodNumberFormat",
  (inst, def) => {
    $ZodNumberFormat.init(inst, def);
    ZodNumber.init(inst, def);
  }
);
function int(params) {
  return _int(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    booleanProcessor(inst, ctx, json, params);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodNull = /* @__PURE__ */ $constructor("ZodNull", (inst, def) => {
  $ZodNull.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    nullProcessor(inst, ctx, json, params);
});
function _null3(params) {
  return _null2(ZodNull, params);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    unknownProcessor(inst, ctx, json, params);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    neverProcessor(inst, ctx, json, params);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    arrayProcessor(inst, ctx, json, params);
  inst.element = def.element;
  _installLazyMethods(inst, "ZodArray", {
    min(n, params) {
      return this.check(_minLength(n, params));
    },
    nonempty(params) {
      return this.check(_minLength(1, params));
    },
    max(n, params) {
      return this.check(_maxLength(n, params));
    },
    length(n, params) {
      return this.check(_length(n, params));
    },
    unwrap() {
      return this.element;
    },
  });
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    objectProcessor(inst, ctx, json, params);
  util_exports.defineLazy(inst, "shape", () => {
    return def.shape;
  });
  _installLazyMethods(inst, "ZodObject", {
    keyof() {
      return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone({ ...this._zod.def, catchall });
    },
    passthrough() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    loose() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    strict() {
      return this.clone({ ...this._zod.def, catchall: never() });
    },
    strip() {
      return this.clone({ ...this._zod.def, catchall: void 0 });
    },
    extend(incoming) {
      return util_exports.extend(this, incoming);
    },
    safeExtend(incoming) {
      return util_exports.safeExtend(this, incoming);
    },
    merge(other) {
      return util_exports.merge(this, other);
    },
    pick(mask) {
      return util_exports.pick(this, mask);
    },
    omit(mask) {
      return util_exports.omit(this, mask);
    },
    partial(...args) {
      return util_exports.partial(ZodOptional, this, args[0]);
    },
    required(...args) {
      return util_exports.required(ZodNonOptional, this, args[0]);
    },
  });
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...util_exports.normalizeParams(params),
  };
  return new ZodObject(def);
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    unionProcessor(inst, ctx, json, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...util_exports.normalizeParams(params),
  });
}
var ZodDiscriminatedUnion = /* @__PURE__ */ $constructor(
  "ZodDiscriminatedUnion",
  (inst, def) => {
    ZodUnion.init(inst, def);
    $ZodDiscriminatedUnion.init(inst, def);
  }
);
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...util_exports.normalizeParams(params),
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor(
  "ZodIntersection",
  (inst, def) => {
    $ZodIntersection.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) =>
      intersectionProcessor(inst, ctx, json, params);
  }
);
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right,
  });
}
var ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    recordProcessor(inst, ctx, json, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string2(),
      valueType: keyType,
      ...util_exports.normalizeParams(valueType),
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...util_exports.normalizeParams(params),
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    enumProcessor(inst, ctx, json, params);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries,
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries,
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values)
    ? Object.fromEntries(values.map((v) => [v, v]))
    : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...util_exports.normalizeParams(params),
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    literalProcessor(inst, ctx, json, params);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error(
          "This schema contains multiple valid literal values. Use `.values` instead."
        );
      }
      return def.values[0];
    },
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...util_exports.normalizeParams(params),
  });
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    transformProcessor(inst, ctx, json, params);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(util_exports.issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal) _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(util_exports.issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    payload.value = output;
    payload.fallback = true;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn,
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType,
  });
}
var ZodExactOptional = /* @__PURE__ */ $constructor(
  "ZodExactOptional",
  (inst, def) => {
    $ZodExactOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) =>
      optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  }
);
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType,
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    nullableProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType,
  });
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    defaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function"
        ? defaultValue()
        : util_exports.shallowClone(defaultValue);
    },
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    prefaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function"
        ? defaultValue()
        : util_exports.shallowClone(defaultValue);
    },
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor(
  "ZodNonOptional",
  (inst, def) => {
    $ZodNonOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) =>
      nonoptionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  }
);
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...util_exports.normalizeParams(params),
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    catchProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue:
      typeof catchValue === "function" ? catchValue : () => catchValue,
  });
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    pipeProcessor(inst, ctx, json, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out,
    // ...util.normalizeParams(params),
  });
}
var ZodPreprocess = /* @__PURE__ */ $constructor(
  "ZodPreprocess",
  (inst, def) => {
    ZodPipe.init(inst, def);
    $ZodPreprocess.init(inst, def);
  }
);
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    readonlyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType,
  });
}
var ZodLazy = /* @__PURE__ */ $constructor("ZodLazy", (inst, def) => {
  $ZodLazy.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    lazyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.getter();
});
function lazy(getter) {
  return new ZodLazy({
    type: "lazy",
    getter,
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) =>
    customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
function preprocess(fn, schema) {
  return new ZodPreprocess({
    type: "pipe",
    in: transform(fn),
    out: schema,
  });
}

// node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/external.js
config(en_default());

// packages/protocol/src/builder-release-reference.ts
var BuilderReleaseSealReferenceSchema = object({
  checkpointDigest: string2().regex(/^[a-f0-9]{64}$/),
  formatVersion: literal(1),
  sha256: string2().regex(/^[a-f0-9]{64}$/),
}).strict();

// packages/protocol/src/runtime-capabilities.ts
var RUNTIME_CAPABILITIES = ["forms", "motion", "navigation", "tabs"];
var RuntimeCapabilitySchema = _enum(RUNTIME_CAPABILITIES);
var PageRuntimeAssetSchema = object({
  capabilities: array(RuntimeCapabilitySchema)
    .min(1)
    .max(RUNTIME_CAPABILITIES.length)
    .refine(
      (names) =>
        names.every(
          (name, index) => index === 0 || (names[index - 1] ?? "") < name
        ),
      "Capabilities must be unique and sorted"
    ),
  integrity: string2().regex(/^sha256-[A-Za-z0-9+/]{43}=$/),
  key: string2().regex(/^assets\/xeroflow-runtime-[a-f0-9]{64}\.js$/),
}).strict();

// packages/protocol/src/release.ts
var RELEASE_MANIFEST_LIMIT_BYTES = 1024 * 1024;
var RELEASE_BUNDLE_LIMIT_BYTES = 10 * 1024 * 1024;
var RELEASE_FILE_LIMIT = 5e3;
var ReleaseScopedIdSchema = string2()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
var ReleaseSha256Schema = string2().regex(/^[a-f0-9]{64}$/);
var ReleaseEnvironmentSchema = _enum(["preview", "staging", "production"]);
var ReleaseArtifactScopeSchema = object({
  clientId: ReleaseScopedIdSchema,
  siteId: ReleaseScopedIdSchema,
  tenantId: ReleaseScopedIdSchema,
}).strict();
var SAFE_OBJECT_KEY_RE =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
var CANONICAL_ROUTE_RE =
  /^\/(?:[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*)?$/;
var ReleaseArtifactFileSchema = object({
  bytes: number2().int().nonnegative().max(RELEASE_BUNDLE_LIMIT_BYTES),
  contentType: string2().min(1).max(200),
  key: string2().max(1024).regex(SAFE_OBJECT_KEY_RE),
  sha256: ReleaseSha256Schema,
}).strict();
var ReleaseArtifactManifestBaseShape = {
  artifactPrefix: string2().max(1024).regex(SAFE_OBJECT_KEY_RE),
  buildId: ReleaseScopedIdSchema,
  files: array(ReleaseArtifactFileSchema).min(1).max(RELEASE_FILE_LIMIT),
  routes: record(
    string2().min(1).max(240).regex(CANONICAL_ROUTE_RE),
    string2().max(1024).regex(SAFE_OBJECT_KEY_RE)
  ),
  scope: ReleaseArtifactScopeSchema,
  versionDigest: ReleaseSha256Schema,
  versionId: ReleaseScopedIdSchema,
};
var ReleaseArtifactManifestV1Schema = object({
  ...ReleaseArtifactManifestBaseShape,
  schemaVersion: literal(1),
}).strict();
var ReleaseArtifactRedirectSchema = object({
  status: literal(308),
  target: string2().min(1).max(240).regex(CANONICAL_ROUTE_RE),
}).strict();
var ReleaseArtifactManifestV2Schema = object({
  ...ReleaseArtifactManifestBaseShape,
  pageRuntimes: record(
    string2().min(1).max(240).regex(CANONICAL_ROUTE_RE),
    PageRuntimeAssetSchema
  ).optional(),
  redirects: record(
    string2().min(1).max(240).regex(CANONICAL_ROUTE_RE),
    ReleaseArtifactRedirectSchema
  ),
  schemaVersion: literal(2),
}).strict();
var ReleaseArtifactManifestV3Schema = ReleaseArtifactManifestV2Schema.extend({
  featureSeal: BuilderReleaseSealReferenceSchema,
  schemaVersion: literal(3),
}).strict();
var ReleaseArtifactManifestSchema = discriminatedUnion("schemaVersion", [
  ReleaseArtifactManifestV1Schema,
  ReleaseArtifactManifestV2Schema,
  ReleaseArtifactManifestV3Schema,
]);
function canonicalJson(input) {
  if (input === null || typeof input !== "object") {
    const serialized = JSON.stringify(input);
    if (serialized === void 0) {
      throw new TypeError("Unsupported value in canonical JSON");
    }
    return serialized;
  }
  if (Array.isArray(input)) {
    return `[${input.map((value) => canonicalJson(value)).join(",")}]`;
  }
  const object2 = input;
  return `{${Object.keys(object2)
    .sort()
    .map((key2) => `${JSON.stringify(key2)}:${canonicalJson(object2[key2])}`)
    .join(",")}}`;
}
async function sha256Hex(value) {
  const digest2 = await crypto.subtle.digest(
    "SHA-256",
    typeof value === "string" ? new TextEncoder().encode(value) : value
  );
  return Array.from(new Uint8Array(digest2), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

// packages/protocol/src/astro-build-identity.ts
var AstroCompilerToolchainSchema = object({
  formatVersion: literal(1),
  hostPolicyDigest: ReleaseSha256Schema,
  image: string2()
    .max(512)
    .regex(
      /^registry\.cloudflare\.com\/[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9._-]*@sha256:[a-f0-9]{64}$/
    ),
  kind: literal("astro-compiler-toolchain"),
}).strict();
var CheckpointSchema = object({
  digest: ReleaseSha256Schema,
  id: ReleaseScopedIdSchema,
}).strict();
var AstroBuildSourceSchema = discriminatedUnion("kind", [
  object({
    checkpointDigest: ReleaseSha256Schema,
    checkpointId: ReleaseScopedIdSchema,
    kind: literal("checkpoint"),
  }).strict(),
  object({
    checkpoint: CheckpointSchema.nullable(),
    kind: literal("approved-version"),
    versionDigest: ReleaseSha256Schema,
    versionId: ReleaseScopedIdSchema,
  }).strict(),
]);
var AstroBuildIdentityInputSchema = object({
  environment: _enum(["staging", "production"]),
  featureRecoveryDigest: ReleaseSha256Schema.nullable(),
  renderInputDigest: ReleaseSha256Schema,
  scope: ReleaseArtifactScopeSchema,
  source: AstroBuildSourceSchema,
}).strict();
var AstroBuildIdentitySchema = AstroBuildIdentityInputSchema.extend({
  formatVersion: literal(1),
  renderer: literal("astro"),
  toolchainDigest: ReleaseSha256Schema,
}).strict();
var AstroBuildIdentityPinSchema = object({
  buildId: ReleaseScopedIdSchema,
  identity: AstroBuildIdentitySchema,
  identityDigest: ReleaseSha256Schema,
}).strict();
async function verifyAstroBuildIdentityAddress(candidate) {
  const pin2 = AstroBuildIdentityPinSchema.parse(candidate);
  const digest2 = await sha256Hex(canonicalJson(pin2.identity));
  if (
    pin2.identityDigest !== digest2 ||
    pin2.buildId !== `build_astro_${digest2}`
  ) {
    throw new Error("Astro build identity mismatch");
  }
  return pin2;
}
async function createAstroBuildIdentity(input, admittedToolchain) {
  const parsed = AstroBuildIdentityInputSchema.parse(input);
  const toolchain = AstroCompilerToolchainSchema.parse(admittedToolchain);
  const identity5 = {
    ...parsed,
    formatVersion: 1,
    renderer: "astro",
    toolchainDigest: await sha256Hex(canonicalJson(toolchain)),
  };
  const identityDigest = await sha256Hex(canonicalJson(identity5));
  return {
    buildId: `build_astro_${identityDigest}`,
    identity: identity5,
    identityDigest,
  };
}

// packages/protocol/src/astro-compiler-registry.ts
var Environment = _enum(["staging", "production"]);
var Capability = _enum(["build", "verify"]);
var Generation = object({
  binding: string2().regex(/^ASTRO_RELEASE_[A-Z0-9_]{1,100}$/),
  environment: Environment,
  policyDigest: ReleaseSha256Schema,
  toolchain: AstroCompilerToolchainSchema,
  toolchainDigest: ReleaseSha256Schema,
}).strict();
var AstroCompilerRegistrySchema = object({
  capability: Capability,
  formatVersion: literal(1),
  generations: array(Generation).max(32),
})
  .strict()
  .superRefine((registry2, ctx) => {
    const identities = /* @__PURE__ */ new Set();
    const bindings = /* @__PURE__ */ new Set();
    for (const generation of registry2.generations) {
      const identity5 = `${generation.environment}:${generation.toolchainDigest}`;
      if (identities.has(identity5) || bindings.has(generation.binding)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate compiler registration",
        });
      }
      identities.add(identity5);
      bindings.add(generation.binding);
    }
  });
async function selectAstroReleaseGeneration(
  rawRegistry,
  deploymentEnvironment,
  rawToolchainDigest,
  capability
) {
  if (
    typeof rawRegistry !== "string" ||
    new TextEncoder().encode(rawRegistry).byteLength > 65536
  ) {
    throw new Error("Astro compiler registry unavailable");
  }
  const registry2 = AstroCompilerRegistrySchema.parse(JSON.parse(rawRegistry));
  const environment = Environment.parse(deploymentEnvironment);
  const toolchainDigest = ReleaseSha256Schema.parse(rawToolchainDigest);
  if (registry2.capability !== capability) {
    throw new Error("Astro compiler authority mismatch");
  }
  await Promise.all(
    registry2.generations.map(async (generation) => {
      if (
        (await sha256Hex(canonicalJson(generation.toolchain))) !==
        generation.toolchainDigest
      ) {
        throw new Error("Astro compiler registration digest mismatch");
      }
    })
  );
  const registration = registry2.generations.find(
    (generation) =>
      generation.environment === environment &&
      generation.toolchainDigest === toolchainDigest
  );
  if (!registration) {
    throw new Error("Retained Astro compiler generation unavailable");
  }
  return registration;
}

// packages/protocol/src/astro-artifact.ts
var ASTRO_ARTIFACT_BYTE_LIMIT = 32 * 1024 * 1024;
var ASTRO_ARTIFACT_MANIFEST_LIMIT = 1024 * 1024;
var ASTRO_ARTIFACT_FILE_LIMIT = 1e3;
var KEY =
  /^(?:_astro\/)?[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
var ROUTE = /^\/(?:[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*)?$/;
var types = {
  avif: "image/avif",
  css: "text/css; charset=utf-8",
  gif: "image/gif",
  html: "text/html; charset=utf-8",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
};
function astroArtifactContentType(key2) {
  if (key2 === "site-runtime.json") {
    return "application/json; charset=utf-8";
  }
  const extension = key2.split(".").pop() ?? "";
  const type = Object.hasOwn(types, extension) ? types[extension] : void 0;
  if (!(KEY.test(key2) && type)) {
    throw new Error("Unsupported Astro artifact key");
  }
  return type;
}
var AstroBuildContextSchema = object({
  buildId: ReleaseScopedIdSchema,
  checkpointDigest: ReleaseSha256Schema,
  checkpointId: ReleaseScopedIdSchema,
  environment: _enum(["staging", "production"]),
  featureRecoveryDigest: ReleaseSha256Schema.nullable(),
  renderInputDigest: ReleaseSha256Schema,
  scope: ReleaseArtifactScopeSchema,
}).strict();
var AstroFileSchema = object({
  bytes: number2().int().nonnegative().max(ASTRO_ARTIFACT_BYTE_LIMIT),
  contentType: string2().max(100),
  key: string2().max(1024).regex(KEY),
  sha256: ReleaseSha256Schema,
})
  .strict()
  .refine((file) => {
    try {
      return astroArtifactContentType(file.key) === file.contentType;
    } catch {
      return false;
    }
  }, "Unsupported Astro file type");
var AstroArtifactInventorySchema = object({
  compiler: object({
    name: literal("astro"),
    version: literal("7.3.4"),
  }).strict(),
  files: array(AstroFileSchema).min(1).max(ASTRO_ARTIFACT_FILE_LIMIT),
  kind: literal("astro-static-artifact"),
  routes: record(
    string2().max(240).regex(ROUTE),
    string2().max(1024).regex(KEY)
  ),
})
  .strict()
  .superRefine((manifest, ctx) => {
    const keys = new Set(manifest.files.map((file) => file.key.toLowerCase()));
    if (
      keys.size !== manifest.files.length ||
      manifest.files.reduce((sum, file) => sum + file.bytes, 0) >
        ASTRO_ARTIFACT_BYTE_LIMIT
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid Astro file inventory" });
    }
    const routes = Object.entries(manifest.routes);
    const html = new Set(
      manifest.files
        .filter((file) => file.contentType === types.html)
        .map((file) => file.key)
    );
    for (const [route, key2] of routes) {
      if (
        key2 !==
          (route === "/" ? "index.html" : `${route.slice(1)}/index.html`) ||
        !html.delete(key2)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid Astro route artifact",
        });
      }
    }
    if (routes.length === 0 || html.size > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Incomplete Astro route inventory",
      });
    }
  });
var AstroArtifactManifestSchema = AstroArtifactInventorySchema.safeExtend({
  context: AstroBuildContextSchema,
  formatVersion: literal(1),
});
var ExpectedSchema = object({
  context: AstroBuildContextSchema,
  manifestDigest: ReleaseSha256Schema,
}).strict();

// packages/protocol/src/astro-artifact-v2.ts
var AstroArtifactManifestV2Schema = AstroArtifactInventorySchema.safeExtend({
  context: AstroBuildIdentityPinSchema,
  formatVersion: literal(2),
});
var ExpectedSchema2 = object({
  context: AstroBuildIdentityPinSchema,
  manifestDigest: ReleaseSha256Schema,
}).strict();

// packages/protocol/src/astro-release.ts
var HEADER_CONTROL = /[\x00-\x1f\x7f]/;
var AstroReleaseManifestSchema = ReleaseArtifactManifestV2Schema.omit({
  files: true,
  pageRuntimes: true,
})
  .extend({
    astro: object({
      context: AstroBuildIdentityPinSchema,
      manifestDigest: ReleaseSha256Schema,
      pages: record(
        string2().max(240),
        object({
          csp: string2()
            .min(1)
            .max(32768)
            .refine((value) => !HEADER_CONTROL.test(value)),
        }).strict()
      ),
      policyDigest: ReleaseSha256Schema,
    }).strict(),
    files: AstroArtifactManifestV2Schema.shape.files,
    images: array(ReleaseArtifactFileSchema).max(512),
    renderer: literal("astro"),
    schemaVersion: literal(4),
    validationReport: ReleaseArtifactFileSchema.refine(
      (file) =>
        file.key === "validation-report.json" &&
        file.contentType === "application/json; charset=utf-8"
    ),
  })
  .strict();
var ExpectedSchema3 = object({
  context: AstroBuildIdentityPinSchema,
  manifestDigest: ReleaseSha256Schema,
  policyDigest: ReleaseSha256Schema,
}).strict();
var AstroReleaseReferenceSchema = AstroReleaseManifestSchema.shape.astro.omit({
  pages: true,
});
var AstroReleasePointerSchema = AstroReleaseManifestSchema.pick({
  artifactPrefix: true,
  buildId: true,
  scope: true,
  versionDigest: true,
})
  .extend({
    astro: AstroReleaseReferenceSchema,
    environment: ReleaseEnvironmentSchema.optional(),
    manifestDigest: ReleaseSha256Schema,
    manifestKey: string2().max(1100),
    releaseId: ReleaseScopedIdSchema.optional(),
  })
  .strict();
var AstroReleaseBuildResultSchema = AstroReleasePointerSchema.omit({
  environment: true,
  releaseId: true,
  scope: true,
})
  .extend({
    renderer: literal("astro"),
    success: literal(true),
    validationKey: string2().max(1100),
  })
  .strict();
var AstroReleaseVerificationSchema = AstroReleaseManifestSchema.pick({
  artifactPrefix: true,
  files: true,
  images: true,
  routes: true,
})
  .extend({
    ...AstroReleaseManifestSchema.shape.astro.shape,
    manifestKey: string2().max(1100),
    renderer: literal("astro"),
    verified: literal(true),
  })
  .strict();
async function verifyAstroReleasePointer(candidate) {
  const pointer2 = AstroReleasePointerSchema.parse(candidate);
  const context = await verifyAstroBuildIdentityAddress(pointer2.astro.context);
  const { scope, source, environment } = context.identity;
  const prefix = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/astro/${environment}/${context.buildId}/${pointer2.astro.manifestDigest}`;
  if (
    source.kind !== "approved-version" ||
    pointer2.buildId !== context.buildId ||
    canonicalJson(pointer2.scope) !== canonicalJson(scope) ||
    pointer2.versionDigest !== source.versionDigest ||
    pointer2.artifactPrefix !== prefix ||
    pointer2.manifestKey !== `${prefix}/release-manifest.json` ||
    (pointer2.environment &&
      pointer2.environment !== "preview" &&
      pointer2.environment !== environment)
  ) {
    throw new Error("Astro release pointer identity mismatch");
  }
  return pointer2;
}

// packages/protocol/src/industry.ts
var SiteTemplateIdSchema = _enum([
  "limousine-v1",
  "floristry-v1",
  "retail-v1",
  "it-goods-v1",
  "import-export-v1",
]);
var IndustryModuleSchema = _enum([
  "business-content",
  "bookings",
  "catalogue",
  "delivery",
  "enquiries",
  "inventory",
  "orders",
]);
var IndustryTemplateSchema = object({
  defaultModules: array(IndustryModuleSchema).min(1).max(12),
  id: string2().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  label: string2().trim().min(2).max(80),
}).strict();

// packages/protocol/src/builder-form-action.ts
var identifier = string2()
  .min(1)
  .max(64)
  .regex(/^[a-z][A-Za-z0-9_]*$/)
  .refine(
    (key2) => !["constructor", "prototype", "__proto__"].includes(key2),
    "Reserved input key"
  );
var stableId = string2()
  .min(3)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);
var common = { key: identifier, required: boolean2() };
var property = discriminatedUnion("type", [
  object({
    ...common,
    enum: array(string2().max(16384)).min(1).max(50).optional(),
    maxLength: number2().int().min(1).max(16384).optional(),
    type: literal("string"),
  }).strict(),
  object({
    ...common,
    max: number2().finite().optional(),
    min: number2().finite().optional(),
    type: literal("number"),
  }).strict(),
  object({ ...common, type: literal("boolean") }).strict(),
]);
var BuilderActionInputContractSchema = object({
  properties: array(property).max(32),
  version: literal(1),
})
  .strict()
  .superRefine((contract, ctx) => {
    const keys = /* @__PURE__ */ new Set();
    for (const p of contract.properties) {
      if (keys.has(p.key)) {
        ctx.addIssue({ code: "custom", message: "Duplicate input property" });
      }
      keys.add(p.key);
      if (
        p.type === "number" &&
        p.min !== void 0 &&
        p.max !== void 0 &&
        p.min > p.max
      ) {
        ctx.addIssue({ code: "custom", message: "Invalid numeric interval" });
      }
      if (
        p.type === "string" &&
        p.enum &&
        (new Set(p.enum).size !== p.enum.length ||
          p.enum.some((x) => x.length > (p.maxLength ?? 16384)))
      ) {
        ctx.addIssue({ code: "custom", message: "Invalid string choices" });
      }
    }
  });
var BuilderFormActionBindingSchema = object({
  action: object({
    id: stableId,
    kind: literal("action"),
    sha256: string2().regex(/^[a-f0-9]{64}$/),
    version: number2().int().min(1).max(Number.MAX_SAFE_INTEGER),
  }).strict(),
  mappings: array(
    object({
      conversion: _enum(["string", "number", "boolean"]),
      fieldId: stableId,
      inputKey: identifier,
    }).strict()
  )
    .min(1)
    .max(32),
  mode: literal("action"),
  trigger: literal("form-submit"),
  version: literal(1),
})
  .strict()
  .refine(
    (binding) =>
      new Set(binding.mappings.map((x) => x.inputKey)).size ===
      binding.mappings.length,
    "Duplicate action input target"
  );
function validateBuilderActionInput(contractInput, input) {
  const contract = BuilderActionInputContractSchema.parse(contractInput);
  const shape = {};
  for (const p of contract.properties) {
    let schema;
    if (p.type === "string") {
      schema = string2()
        .max(p.maxLength ?? 16384)
        .refine(
          (value) => !p.enum || p.enum.includes(value),
          "Invalid input choice"
        );
    } else if (p.type === "number") {
      schema = number2()
        .finite()
        .refine(
          (value) =>
            (p.min === void 0 || value >= p.min) &&
            (p.max === void 0 || value <= p.max),
          "Input outside bounds"
        );
    } else {
      schema = boolean2();
    }
    shape[p.key] = p.required ? schema : schema.optional();
  }
  const scalars = record(
    identifier,
    union([string2(), number2().finite(), boolean2()])
  ).parse(input);
  const ownScalars = Object.assign(
    /* @__PURE__ */ Object.create(null),
    scalars
  );
  const result = object(shape).strict().parse(ownScalars);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 65536) {
    throw new Error("Action input byte limit exceeded");
  }
  return result;
}

// packages/protocol/src/builder-instance-reference.ts
var identity = string2()
  .min(3)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);
var BuilderInstanceReferenceSchema = object({
  pin: object({
    id: identity,
    kind: literal("component"),
    sha256: string2().regex(/^[a-f0-9]{64}$/),
    version: number2().int().min(1).max(Number.MAX_SAFE_INTEGER),
  }).strict(),
  values: record(
    identity,
    union([string2().max(1e4), number2().finite(), boolean2()])
  ).refine(
    (values) => Object.keys(values).length <= 30,
    "Too many instance values"
  ),
  version: literal(1),
}).strict();

// packages/protocol/src/page.ts
var DUPLICATE_SLASHES_RE = /\/{2,}/g;
var TRAILING_SLASH_RE = /\/$/;
function isSafePolicyUrl(value) {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return !(value.includes("\\") || value.split("/").includes(".."));
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname !== "localhost"
    );
  } catch {
    return false;
  }
}
var ConsentPolicyUrlSchema = string2()
  .trim()
  .min(1)
  .max(2048)
  .refine(isSafePolicyUrl, "Consent policy URL must be relative or HTTPS");
var StableIdSchema = string2()
  .min(3)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);
var SiteIdSchema = union([StableIdSchema, string2().uuid()]);
var JsonValueSchema = lazy(() =>
  union([
    string2(),
    number2().finite(),
    boolean2(),
    _null3(),
    array(JsonValueSchema),
    record(string2(), JsonValueSchema),
  ])
);
var COMPONENT_TYPES = [
  "section",
  "container",
  "stack",
  "columns",
  "heading",
  "richText",
  "buttonGroup",
  "card",
  "cardGrid",
  "video",
  "accordion",
  "tabs",
  "breadcrumbs",
  "contactDetails",
  "map",
  "serviceAreaMap",
  "pricing",
  "team",
  "postList",
  "embed",
  "divider",
  "spacer",
  "navigation",
  "hero",
  "offer",
  "featureGrid",
  "content",
  "image",
  "gallery",
  "logoCloud",
  "testimonial",
  "statistics",
  "comparison",
  "callToAction",
  "leadForm",
  "faq",
  "legalDisclaimer",
  "footer",
];
var ComponentTypeSchema = _enum(COMPONENT_TYPES);
var MAX_COMPONENT_DEPTH = 8;
var ComponentPropsSchema = record(string2(), JsonValueSchema);
var ResponsiveOverrideSchema = object({
  isHidden: boolean2().optional(),
  props: ComponentPropsSchema.optional(),
}).strict();
var componentNodeSchemas = [];
function componentNodeSchemaAtDepth(depth) {
  const cached2 = componentNodeSchemas[depth];
  if (cached2) {
    return cached2;
  }
  const childrenSchema =
    depth >= MAX_COMPONENT_DEPTH
      ? array(never()).max(0)
      : array(lazy(() => componentNodeSchemaAtDepth(depth + 1)));
  const schema = object({
    builderInstance: BuilderInstanceReferenceSchema.optional(),
    children: childrenSchema.default([]),
    id: StableIdSchema,
    props: ComponentPropsSchema.default({}),
    responsive: object({
      desktop: ResponsiveOverrideSchema.optional(),
      mobile: ResponsiveOverrideSchema.optional(),
      tablet: ResponsiveOverrideSchema.optional(),
    })
      .strict()
      .optional(),
    type: ComponentTypeSchema,
  }).strict();
  componentNodeSchemas[depth] = schema;
  return schema;
}
var ComponentNodeSchema = componentNodeSchemaAtDepth(0);
var PageFormSchema = object({
  consent: object({
    label: string2().trim().min(1).max(500),
    policyUrl: ConsentPolicyUrlSchema.optional(),
    required: boolean2(),
  })
    .strict()
    .optional(),
  conversionEventId: StableIdSchema.optional(),
  fields: array(
    object({
      description: string2().max(240).optional(),
      id: StableIdSchema,
      max: number2().finite().optional(),
      min: number2().finite().optional(),
      name: string2().min(1).max(80),
      options: array(string2().trim().min(1).max(120)).max(50).optional(),
      placeholder: string2().max(160).optional(),
      required: boolean2().default(false),
      type: _enum([
        "text",
        "email",
        "tel",
        "date",
        "number",
        "textarea",
        "select",
        "checkbox",
        "hidden",
      ]),
    }).strict()
  ).default([]),
  id: StableIdSchema,
  name: string2().min(1).max(120),
  submission: BuilderFormActionBindingSchema.optional(),
})
  .strict()
  .superRefine((form, context) => {
    const ids = /* @__PURE__ */ new Set();
    form.fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        context.addIssue({
          code: "custom",
          message: `Form field ${field.id} is duplicated`,
          path: ["fields", index, "id"],
        });
      }
      ids.add(field.id);
      if (
        field.type === "select" &&
        (!field.options || field.options.length === 0)
      ) {
        context.addIssue({
          code: "custom",
          message: "Select fields require at least one option",
          path: ["fields", index, "options"],
        });
      }
      if (field.type !== "select" && field.options !== void 0) {
        context.addIssue({
          code: "custom",
          message: "Only select fields may define options",
          path: ["fields", index, "options"],
        });
      }
      if (
        field.type !== "number" &&
        (field.min !== void 0 || field.max !== void 0)
      ) {
        context.addIssue({
          code: "custom",
          message: "Only number fields may define min/max constraints",
          path: ["fields", index],
        });
      }
      if (
        field.min !== void 0 &&
        field.max !== void 0 &&
        field.min > field.max
      ) {
        context.addIssue({
          code: "custom",
          message: "Number field min cannot exceed max",
          path: ["fields", index, "min"],
        });
      }
    });
  });
function normalizeRoute(route) {
  const path = `/${route.trim()}`
    .replace(DUPLICATE_SLASHES_RE, "/")
    .replace(TRAILING_SLASH_RE, "")
    .toLowerCase();
  return path || "/";
}
var RouteSchema = string2()
  .min(1)
  .max(240)
  .transform(normalizeRoute)
  .pipe(
    string2().regex(/^\/(?:[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*)?$/)
  );
var PAGE_TYPES = ["landing", "promotional", "home", "content"];
var PageTypeSchema = _enum(PAGE_TYPES);
var PageVisibilitySchema = _enum(["draft", "public", "hidden"]);
var PageVisibilityV2Schema = _enum(["draft", "public", "hidden", "archived"]);
var SeoMetadataSchema = object({
  description: string2().max(320).optional(),
  title: string2().min(1).max(120),
}).strict();
var PageManifestBaseShape = {
  components: array(ComponentNodeSchema),
  forms: array(PageFormSchema).default([]),
  id: StableIdSchema,
  pageType: PageTypeSchema,
  route: RouteSchema,
  seo: SeoMetadataSchema,
  title: string2().min(1).max(120),
};
var PageManifestV1Schema = object({
  components: array(ComponentNodeSchema),
  forms: array(PageFormSchema).default([]),
  id: StableIdSchema,
  pageType: PageTypeSchema,
  route: RouteSchema,
  schemaVersion: literal(1),
  seo: SeoMetadataSchema,
  title: string2().min(1).max(120),
  visibility: PageVisibilitySchema,
}).strict();
var PageManifestV2Schema = object({
  ...PageManifestBaseShape,
  parentPageId: StableIdSchema.nullable().default(null),
  schemaVersion: literal(2),
  shell: object({
    footer: _enum(["inherit", "hidden"]),
    header: _enum(["inherit", "hidden"]),
  }).strict(),
  visibility: PageVisibilityV2Schema,
}).strict();
var PageManifestSchema = discriminatedUnion("schemaVersion", [
  PageManifestV1Schema,
  PageManifestV2Schema,
]);

// packages/protocol/src/template-selection.ts
var PageKeySchema = _enum([
  "home",
  "about",
  "contact",
  "bookings",
  "catalogue",
  "delivery",
  "orders",
  "enquiries",
  "fleet",
  "occasions",
  "service-areas",
]);
var PageSelectionSchema = preprocess((value) => {
  if (value === "/") {
    return "home";
  }
  return typeof value === "string" && value.startsWith("/")
    ? value.slice(1)
    : value;
}, PageKeySchema);
var MODULE_PAGES = {
  bookings: "bookings",
  catalogue: "catalogue",
  delivery: "delivery",
  enquiries: "enquiries",
  orders: "orders",
};
var TemplateSelectionSchema = object({
  collections: array(string2().regex(/^[a-z][a-z0-9_-]{0,63}$/))
    .min(1)
    .max(20),
  enabledModules: array(union([IndustryModuleSchema, literal("email")])).max(
    12
  ),
  pages: array(PageSelectionSchema).min(1).max(16),
  version: literal(1),
})
  .strict()
  .superRefine((selection, context) => {
    for (const key2 of ["pages", "collections", "enabledModules"]) {
      if (new Set(selection[key2]).size !== selection[key2].length) {
        context.addIssue({
          code: "custom",
          message: "Duplicate accepted selection",
          path: [key2],
        });
      }
    }
    if (!selection.collections.includes("profile")) {
      context.addIssue({
        code: "custom",
        message: "A business profile is required",
        path: ["collections"],
      });
    }
    for (const [page, module] of Object.entries(MODULE_PAGES)) {
      if (
        selection.pages.includes(page) &&
        !selection.enabledModules.includes(module)
      ) {
        context.addIssue({
          code: "custom",
          message: `${page} requires its accepted module`,
          path: ["pages"],
        });
      }
    }
  });

// packages/protocol/src/business-content.ts
var ContentIdSchema = string2().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
var AttributeKeySchema = ContentIdSchema.refine(
  (key2) => !["__proto__", "constructor", "prototype"].includes(key2),
  "Reserved attribute key"
);
var ContentScopeSchema = object({
  businessId: ContentIdSchema,
  clientId: ContentIdSchema,
  environment: _enum(["preview", "staging", "production"]),
  siteId: SiteIdSchema,
  tenantId: ContentIdSchema,
}).strict();
var AttributeValueSchema = union([
  string2().max(4e3),
  number2().finite(),
  boolean2(),
  _null3(),
  array(string2().max(500)).max(30),
]);
var BusinessContentRecordSchema = object({
  attributes: record(AttributeKeySchema, AttributeValueSchema).refine(
    (fields) => Object.keys(fields).length <= 30,
    "Too many attributes"
  ),
  id: ContentIdSchema,
  status: _enum(["draft", "verified"]),
  summary: string2().max(4e3),
  title: string2().trim().min(1).max(120),
}).strict();
var BusinessContentSchema = object({
  collections: array(
    object({
      id: ContentIdSchema,
      records: array(BusinessContentRecordSchema)
        .max(200)
        .refine(
          (records) =>
            new Set(records.map((record2) => record2.id)).size ===
            records.length,
          "Duplicate record IDs"
        ),
    }).strict()
  )
    .max(20)
    .refine(
      (collections) =>
        new Set(collections.map((collection) => collection.id)).size ===
        collections.length,
      "Duplicate collection IDs"
    ),
  schemaVersion: literal(1),
  scope: ContentScopeSchema,
})
  .strict()
  .refine(
    (content) =>
      new TextEncoder().encode(JSON.stringify(content)).byteLength <= 512e3,
    "Content exceeds 512 KB"
  );
var ContentWriteSchema = object({
  actorId: ContentIdSchema,
  content: BusinessContentSchema,
  expectedRevision: number2()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER - 1),
}).strict();
var ContentRevisionSchema = object({
  actorId: ContentIdSchema,
  content: BusinessContentSchema,
  createdAt: string2().min(1).max(64),
  revision: number2().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict();
var ContentReadRevisionSchema = object({
  revision: number2().int().min(1).max(Number.MAX_SAFE_INTEGER),
  scope: ContentScopeSchema,
}).strict();
var ContentBindingSchema = object({
  digest: string2().regex(/^[a-f0-9]{64}$/),
  revision: number2().int().min(1).max(Number.MAX_SAFE_INTEGER),
  scope: ContentScopeSchema,
  selection: TemplateSelectionSchema.optional(),
  templateId: SiteTemplateIdSchema,
}).strict();
function contentScopeKey(input) {
  const scope = ContentScopeSchema.parse(input);
  return JSON.stringify([
    scope.tenantId,
    scope.clientId,
    scope.businessId,
    scope.siteId,
    scope.environment,
  ]);
}

// packages/protocol/src/builder-feature.ts
var BUILDER_FEATURE_MAX_CHANGES = 32;
var BUILDER_FEATURE_MAX_REFERENCES = 128;
var BUILDER_FEATURE_MAX_BYTES = 256e3;
var VersionSchema = number2().int().min(1).max(Number.MAX_SAFE_INTEGER);
var ExpectedVersionSchema = number2()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
var BuilderArtifactPinSchema = object({
  id: StableIdSchema,
  kind: _enum(["collection", "component", "action"]),
  sha256: ReleaseSha256Schema,
  version: VersionSchema,
}).strict();
var BuilderComponentLibrarySchema = object({
  components: array(
    BuilderArtifactPinSchema.extend({
      kind: literal("component"),
    }).strict()
  ).max(BUILDER_FEATURE_MAX_REFERENCES),
  scope: ContentScopeSchema,
})
  .strict()
  .refine(
    (library) =>
      new Set(library.components.map((pin2) => pin2.id)).size ===
      library.components.length,
    "A component library has one selected version per identity"
  );
var BuilderArtifactChangeSchema = BuilderArtifactPinSchema.extend({
  bytes: number2().int().min(1).max(1e7),
  dependencies: array(BuilderArtifactPinSchema).max(
    BUILDER_FEATURE_MAX_REFERENCES
  ),
  expectedVersion: ExpectedVersionSchema,
})
  .strict()
  .refine((change) => change.version === change.expectedVersion + 1, {
    message: "Artifact versions must advance by exactly one",
    path: ["version"],
  });
var pinKey = (pin2) => `${pin2.kind}:${pin2.id}:${pin2.version}`;
var identity2 = (pin2) => `${pin2.kind}:${pin2.id}`;
function validateDependencies(artifacts, pins, issue2) {
  for (const [index, change] of artifacts.entries()) {
    const dependencies = /* @__PURE__ */ new Set();
    for (const [dependencyIndex, dependency] of change.dependencies.entries()) {
      const key2 = pinKey(dependency);
      const path = ["changes", index, "dependencies", dependencyIndex];
      if (dependencies.has(key2)) {
        issue2("Duplicate dependency pin", path);
      }
      if (key2 === pinKey(change)) {
        issue2("Artifact cannot depend on itself", path);
      }
      if (pins.get(key2)?.sha256 !== dependency.sha256) {
        issue2("Missing or mismatched dependency pin", path);
      }
      dependencies.add(key2);
    }
  }
}
var BuilderFeatureProposalSchema = object({
  base: object({
    checkpointDigest: ReleaseSha256Schema,
    checkpointId: ReleaseScopedIdSchema,
    contentRevision: ExpectedVersionSchema,
  }).strict(),
  changes: array(BuilderArtifactChangeSchema)
    .min(1)
    .max(BUILDER_FEATURE_MAX_CHANGES),
  existing: array(BuilderArtifactPinSchema).max(BUILDER_FEATURE_MAX_REFERENCES),
  formatVersion: literal(1),
  id: ReleaseScopedIdSchema,
  scope: ContentScopeSchema,
})
  .strict()
  .superRefine((proposal, ctx) => {
    const issue2 = (message, path) =>
      ctx.addIssue({ code: "custom", message, path });
    if (
      new TextEncoder().encode(JSON.stringify(proposal)).byteLength >
      BUILDER_FEATURE_MAX_BYTES
    ) {
      issue2("Feature proposal exceeds the byte limit", []);
    }
    const pins = /* @__PURE__ */ new Map();
    for (const [index, pin2] of proposal.existing.entries()) {
      const key2 = pinKey(pin2);
      if (pins.has(key2)) {
        issue2("Duplicate existing artifact pin", ["existing", index]);
      }
      pins.set(key2, pin2);
    }
    const identities = /* @__PURE__ */ new Set();
    const changes = /* @__PURE__ */ new Map();
    for (const [index, change] of proposal.changes.entries()) {
      const key2 = pinKey(change);
      if (identities.has(identity2(change))) {
        issue2("Duplicate changed artifact identity", ["changes", index]);
      }
      if (pins.has(key2)) {
        issue2("A proposed version cannot also be an existing version", [
          "changes",
          index,
        ]);
      }
      identities.add(identity2(change));
      pins.set(key2, change);
      changes.set(key2, change);
    }
    validateDependencies(proposal.changes, pins, issue2);
    const visiting = /* @__PURE__ */ new Set();
    const visited = /* @__PURE__ */ new Set();
    function visit(key2) {
      if (visiting.has(key2)) {
        return false;
      }
      if (visited.has(key2)) {
        return true;
      }
      visiting.add(key2);
      for (const dependency of changes.get(key2)?.dependencies ?? []) {
        if (changes.has(pinKey(dependency)) && !visit(pinKey(dependency))) {
          return false;
        }
      }
      visiting.delete(key2);
      visited.add(key2);
      return true;
    }
    for (const key2 of changes.keys()) {
      if (!visit(key2)) {
        issue2("Proposed artifacts contain a dependency cycle", ["changes"]);
        break;
      }
    }
  });
var comparePins = (a, b) => {
  const left = pinKey(a);
  const right = pinKey(b);
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};
async function digestBuilderFeatureProposal(input) {
  const proposal = BuilderFeatureProposalSchema.parse(input);
  return await sha256Hex(
    canonicalJson({
      ...proposal,
      changes: proposal.changes
        .map((change) => ({
          ...change,
          dependencies: [...change.dependencies].sort(comparePins),
        }))
        .sort(comparePins),
      existing: [...proposal.existing].sort(comparePins),
    })
  );
}
var BUILDER_FEATURE_MAX_TEST_EXECUTIONS = 128;
var receiptPinKey = (pin2) => `${pinKey(pin2)}:${pin2.sha256}`;
var BuilderFeatureCandidateBodySchema = object({
  proposal: BuilderFeatureProposalSchema,
  proposalDigest: ReleaseSha256Schema,
  summary: string2().trim().min(1).max(500),
  validation: object({
    actions: array(
      BuilderArtifactPinSchema.extend({
        kind: literal("action"),
        tests: number2().int().min(1).max(16),
      }).strict()
    ).max(BUILDER_FEATURE_MAX_TEST_EXECUTIONS),
    runtimeDigest: ReleaseSha256Schema.nullable(),
  }).strict(),
})
  .strict()
  .superRefine((candidate, ctx) => {
    const actions = [
      ...candidate.proposal.changes,
      ...candidate.proposal.existing,
    ].filter((change) => change.kind === "action");
    const tested = candidate.validation.actions;
    if (
      new Set(tested.map(receiptPinKey)).size !== tested.length ||
      actions.length !== tested.length ||
      tested.some(
        (test) =>
          !actions.some(
            (action) => receiptPinKey(action) === receiptPinKey(test)
          )
      ) ||
      tested.reduce((total, test) => total + test.tests, 0) >
        BUILDER_FEATURE_MAX_TEST_EXECUTIONS ||
      actions.length > 0 !== (candidate.validation.runtimeDigest !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Candidate action validation does not match its graph",
      });
    }
  });
var BuilderFeatureCandidateSchema =
  BuilderFeatureCandidateBodySchema.safeExtend({ digest: ReleaseSha256Schema });
async function digestBuilderFeatureCandidate(input) {
  return await sha256Hex(
    canonicalJson(BuilderFeatureCandidateBodySchema.parse(input))
  );
}

// packages/protocol/src/builder-json.ts
var BUILDER_ARTIFACT_MAX_BYTES = 262144;
var encoder = new TextEncoder();
var reserved = /* @__PURE__ */ new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
function parseBuilderJson(raw) {
  if (encoder.encode(raw).byteLength > BUILDER_ARTIFACT_MAX_BYTES) {
    throw new Error("Builder JSON exceeds byte limit");
  }
  const value = JSON.parse(raw);
  const pending = [{ depth: 0, value }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) {
      break;
    }
    count += 1;
    if (current.depth > 32 || count > 16384) {
      throw new Error("Builder JSON exceeds structural limit");
    }
    if (current.value && typeof current.value === "object") {
      for (const [key2, child] of Object.entries(current.value)) {
        if (reserved.has(key2)) {
          throw new Error("Reserved builder JSON key");
        }
        pending.push({ depth: current.depth + 1, value: child });
      }
    }
  }
  return value;
}

// packages/protocol/src/collection-definition.ts
var CollectionIdentitySchema = StableIdSchema.refine(
  (id) => !["__proto__", "constructor", "prototype"].includes(id),
  "Reserved collection or field identity"
);
var label = string2().trim().min(1).max(120);
var safeInteger = number2()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
var common2 = {
  id: CollectionIdentitySchema,
  label,
  required: boolean2(),
  visibility: _enum(["private", "public"]),
};
var CollectionFieldSchema = discriminatedUnion("type", [
  object({
    ...common2,
    maxLength: number2().int().min(1).max(4e3).optional(),
    minLength: number2().int().min(0).max(4e3).optional(),
    type: literal("text"),
  }).strict(),
  object({
    ...common2,
    max: safeInteger.optional(),
    min: safeInteger.optional(),
    type: literal("integer"),
  }).strict(),
  object({ ...common2, type: literal("boolean") }).strict(),
  object({ ...common2, type: literal("date") }).strict(),
  object({ ...common2, type: literal("instant") }).strict(),
  object({
    ...common2,
    precision: number2().int().min(1).max(18),
    scale: number2().int().min(0).max(6),
    type: literal("decimal"),
  }).strict(),
  object({
    ...common2,
    options: array(object({ id: CollectionIdentitySchema, label }).strict())
      .min(1)
      .max(100),
    type: literal("enum"),
  }).strict(),
]).superRefine((field, ctx) => {
  const issue2 = (message) => ctx.addIssue({ code: "custom", message });
  if (
    field.type === "text" &&
    (field.minLength ?? 0) > (field.maxLength ?? 4e3)
  ) {
    issue2("Invalid text bounds");
  }
  if (
    field.type === "integer" &&
    (field.min ?? Number.MIN_SAFE_INTEGER) >
      (field.max ?? Number.MAX_SAFE_INTEGER)
  ) {
    issue2("Invalid integer bounds");
  }
  if (field.type === "decimal" && field.scale > field.precision) {
    issue2("Decimal scale exceeds precision");
  }
  if (
    field.type === "enum" &&
    new Set(field.options.map((option) => option.id)).size !==
      field.options.length
  ) {
    issue2("Duplicate enum option identity");
  }
});
var CollectionDefinitionSchema = object({
  displayFieldId: CollectionIdentitySchema,
  fields: array(CollectionFieldSchema).min(1).max(30),
  formatVersion: literal(1),
  id: CollectionIdentitySchema,
  label,
  scope: ContentScopeSchema,
  version: number2().int().min(1).max(Number.MAX_SAFE_INTEGER),
})
  .strict()
  .superRefine((definition, ctx) => {
    const issue2 = (message) => ctx.addIssue({ code: "custom", message });
    if (
      new Set(definition.fields.map((field) => field.id)).size !==
      definition.fields.length
    ) {
      issue2("Duplicate field identity");
    }
    if (
      !definition.fields.some((field) => field.id === definition.displayFieldId)
    ) {
      issue2("Missing display field");
    }
    if (
      new TextEncoder().encode(JSON.stringify(definition)).byteLength > 128e3
    ) {
      issue2("Collection definition exceeds byte limit");
    }
  });
var DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
function validDecimal(value, field) {
  if (!DECIMAL_PATTERN.test(value)) {
    return false;
  }
  const [whole = "", fraction = ""] = value.replace("-", "").split(".");
  if (
    fraction.length !== field.scale ||
    (field.scale === 0 && value.includes("."))
  ) {
    return false;
  }
  if (whole !== "0" && whole.length > field.precision - field.scale) {
    return false;
  }
  return !(value.startsWith("-") && BigInt(`${whole}${fraction}`) === 0n);
}
function valueSchema(field) {
  switch (field.type) {
    case "text":
      return string2()
        .min(field.minLength ?? 0)
        .max(field.maxLength ?? 4e3)
        .refine(
          (value) => !field.required || value.trim().length > 0,
          "Required text is empty"
        );
    case "integer":
      return safeInteger
        .min(field.min ?? Number.MIN_SAFE_INTEGER)
        .max(field.max ?? Number.MAX_SAFE_INTEGER);
    case "boolean":
      return boolean2();
    case "date":
      return iso_exports.date();
    case "instant":
      return iso_exports.datetime({ precision: 3 });
    case "decimal":
      return string2()
        .max(20)
        .refine(
          (value) => validDecimal(value, field),
          "Invalid canonical decimal"
        );
    case "enum":
      return string2().refine(
        (value) => field.options.some((option) => option.id === value),
        "Unknown enum option"
      );
    default:
      throw new Error("Unsupported field type");
  }
}
function parseCollectionValues(input, values) {
  const definition = CollectionDefinitionSchema.parse(input);
  const shape = Object.fromEntries(
    definition.fields.map((field) => {
      const schema = valueSchema(field);
      return [field.id, field.required ? schema : schema.optional()];
    })
  );
  const parsed = object(shape).strict().parse(values);
  if (Object.values(parsed).some((value) => value === void 0)) {
    throw new Error("Omit absent optional fields");
  }
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 128e3) {
    throw new Error("Record exceeds byte limit");
  }
  return parsed;
}
function narrowerBounds(beforeMin, beforeMax, afterMin, afterMax) {
  return afterMin > beforeMin || afterMax < beforeMax;
}
function narrows(before, after) {
  if (before.type !== after.type || (!before.required && after.required)) {
    return true;
  }
  if (before.type === "text" && after.type === "text") {
    return narrowerBounds(
      before.minLength ?? 0,
      before.maxLength ?? 4e3,
      after.minLength ?? 0,
      after.maxLength ?? 4e3
    );
  }
  if (before.type === "integer" && after.type === "integer") {
    return narrowerBounds(
      before.min ?? Number.MIN_SAFE_INTEGER,
      before.max ?? Number.MAX_SAFE_INTEGER,
      after.min ?? Number.MIN_SAFE_INTEGER,
      after.max ?? Number.MAX_SAFE_INTEGER
    );
  }
  if (before.type === "enum" && after.type === "enum") {
    return before.options.some(
      (option) => !after.options.some((next) => next.id === option.id)
    );
  }
  if (before.type === "decimal" && after.type === "decimal") {
    return after.scale !== before.scale || after.precision < before.precision;
  }
  return false;
}
function classifyCollectionChange(beforeInput, afterInput) {
  const before = CollectionDefinitionSchema.parse(beforeInput);
  const after = CollectionDefinitionSchema.parse(afterInput);
  if (
    before.id !== after.id ||
    contentScopeKey(before.scope) !== contentScopeKey(after.scope)
  ) {
    return "migration-required";
  }
  let visibilityChange = false;
  for (const field of before.fields) {
    const next = after.fields.find((candidate) => candidate.id === field.id);
    if (!next || narrows(field, next)) {
      return "migration-required";
    }
    if (next.visibility !== field.visibility) {
      visibilityChange = true;
    }
  }
  if (
    after.fields.some(
      (field) =>
        field.required && !before.fields.some((old) => old.id === field.id)
    )
  ) {
    return "migration-required";
  }
  return visibilityChange ? "review-required" : "compatible";
}
function projectBoundCollectionValues(
  storedInput,
  pinnedInput,
  currentInput,
  input,
  fields
) {
  const stored = CollectionDefinitionSchema.parse(storedInput);
  const pinned = CollectionDefinitionSchema.parse(pinnedInput);
  const current = CollectionDefinitionSchema.parse(currentInput);
  for (const definition of [stored, current]) {
    if (
      definition.id !== pinned.id ||
      contentScopeKey(definition.scope) !== contentScopeKey(pinned.scope)
    ) {
      throw new Error("Collection scope denied");
    }
  }
  if (
    fields.length > 30 ||
    new Set(fields).size !== fields.length ||
    fields.some((id) => !pinned.fields.some((field) => field.id === id))
  ) {
    throw new Error("Invalid collection field selection");
  }
  const values = parseCollectionValues(stored, input);
  return Object.fromEntries(
    fields.flatMap((id) => {
      const definitions = [stored, pinned, current].map((definition) =>
        definition.fields.find((field) => field.id === id)
      );
      if (
        !Object.hasOwn(values, id) ||
        definitions.some(
          (field) =>
            field?.visibility !== "public" ||
            field.type !== definitions[0]?.type ||
            !valueSchema(field).safeParse(values[id]).success
        )
      ) {
        return [];
      }
      return [[id, values[id]]];
    })
  );
}

// packages/protocol/src/collection-api.ts
var version2 = number2().int().min(1).max(Number.MAX_SAFE_INTEGER);
var expectedVersion = number2()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
var CollectionDefinitionReadSchema = object({
  id: CollectionIdentitySchema,
  scope: ContentScopeSchema,
  version: version2.optional(),
}).strict();
var CollectionDefinitionWriteSchema = object({
  actorId: ReleaseScopedIdSchema,
  definition: CollectionDefinitionSchema,
  expectedVersion,
  sha256: ReleaseSha256Schema,
})
  .strict()
  .refine(
    (request) => request.definition.version === request.expectedVersion + 1,
    "Definition version conflict"
  );
var CollectionRecordReadSchema = object({
  collectionId: CollectionIdentitySchema,
  id: CollectionIdentitySchema,
  revision: version2.optional(),
  scope: ContentScopeSchema,
}).strict();
var CollectionRecordValuesSchema = record(
  CollectionIdentitySchema,
  union([string2().max(4e3), number2().finite(), boolean2()])
).refine((values) => Object.keys(values).length <= 30, "Too many values");
var recordShape = {
  archived: boolean2(),
  collectionId: CollectionIdentitySchema,
  id: CollectionIdentitySchema,
  schemaVersion: version2,
  scope: ContentScopeSchema,
  values: CollectionRecordValuesSchema,
};
var CollectionRecordWriteSchema = object({
  ...recordShape,
  actorId: ReleaseScopedIdSchema,
  expectedRevision: expectedVersion,
}).strict();
var CollectionRecordSchema = object({
  ...recordShape,
  revision: version2,
}).strict();
var CollectionListSchema = object({
  after: CollectionIdentitySchema.optional(),
  limit: number2().int().min(1).max(100).default(50),
  scope: ContentScopeSchema,
}).strict();
var CollectionRecordListSchema = CollectionListSchema.extend({
  collectionId: CollectionIdentitySchema,
  includeArchived: boolean2().default(false),
}).strict();
var metadata = {
  actorId: ReleaseScopedIdSchema,
  createdAt: string2().min(1).max(64),
  sha256: ReleaseSha256Schema,
};
var CollectionDefinitionRevisionSchema = object({
  ...metadata,
  definition: CollectionDefinitionSchema,
}).strict();
var CollectionRecordRevisionSchema = object({
  ...metadata,
  record: CollectionRecordSchema,
}).strict();
var CollectionDefinitionPageSchema = object({
  items: array(CollectionDefinitionRevisionSchema).max(100),
  nextCursor: CollectionIdentitySchema.nullable(),
}).strict();
var CollectionRecordPageSchema = object({
  items: array(CollectionRecordRevisionSchema).max(100),
  nextCursor: CollectionIdentitySchema.nullable(),
}).strict();

// packages/protocol/src/builder-action-effects.ts
var operations = _enum(["create", "update", "archive"]);
var BuilderActionEffectsSchema = object({
  maxCommands: number2().int().min(1).max(32),
  permissions: array(
    object({
      collection: BuilderArtifactPinSchema.extend({
        kind: literal("collection"),
      }).strict(),
      fields: array(CollectionIdentitySchema).max(30),
      operations: array(operations).min(1).max(3),
    })
      .strict()
      .refine(
        (permission) =>
          new Set(permission.operations).size ===
            permission.operations.length &&
          new Set(permission.fields).size === permission.fields.length &&
          (permission.operations.every((op) => op === "archive") ||
            permission.fields.length > 0),
        "Invalid action effect permission"
      )
  )
    .min(1)
    .max(16),
  version: literal(1),
})
  .strict()
  .refine(
    (declaration) =>
      new Set(declaration.permissions.map((p) => p.collection.id)).size ===
      declaration.permissions.length,
    "Duplicate effect collection"
  );
var target = {
  collectionId: CollectionIdentitySchema,
  recordId: CollectionIdentitySchema,
};
var revision = number2()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER - 1);
var BuilderEffectPlanSchema = object({
  commands: array(
    discriminatedUnion("type", [
      object({
        ...target,
        expectedRevision: literal(0),
        type: literal("create"),
        values: CollectionRecordValuesSchema,
      }).strict(),
      object({
        ...target,
        expectedRevision: revision,
        type: literal("update"),
        values: CollectionRecordValuesSchema,
      }).strict(),
      object({
        ...target,
        expectedRevision: revision,
        type: literal("archive"),
      }).strict(),
    ])
  ).max(32),
  result: JsonValueSchema,
  version: literal(1),
}).strict();
var CollectionArtifact = object({
  definition: CollectionDefinitionSchema,
  kind: literal("collection"),
}).strict();
var ContextSchema = object({
  definitions: array(CollectionArtifact).min(1).max(16),
  records: array(CollectionRecordRevisionSchema).max(32),
  scope: ContentScopeSchema,
}).strict();
async function verifyDefinitions(declaration, context, scopeKey) {
  const definitions = /* @__PURE__ */ new Map();
  for (const artifact of context.definitions) {
    const { definition } = artifact;
    const permission = declaration.permissions.find(
      (p) => p.collection.id === definition.id
    );
    if (
      !permission ||
      definitions.has(definition.id) ||
      contentScopeKey(definition.scope) !== scopeKey ||
      definition.version !== permission.collection.version || // biome-ignore lint/performance/noAwaitInLoops: Bound and verify each immutable pin before admitting it.
      (await sha256Hex(canonicalJson(artifact))) !==
        permission.collection.sha256 ||
      permission.fields.some(
        (id) => !definition.fields.some((field) => field.id === id)
      )
    ) {
      throw new Error("Unverified action effect collection");
    }
    definitions.set(definition.id, definition);
  }
  if (definitions.size !== declaration.permissions.length) {
    throw new Error("Missing action effect collection");
  }
  return definitions;
}
async function verifyRecords(context, definitions, scopeKey) {
  const records = /* @__PURE__ */ new Map();
  for (const saved of context.records) {
    const { record: record2 } = saved;
    const key2 = canonicalJson([record2.collectionId, record2.id]);
    const definition = definitions.get(record2.collectionId);
    if (
      !definition ||
      records.has(key2) ||
      contentScopeKey(record2.scope) !== scopeKey ||
      record2.schemaVersion > definition.version || // biome-ignore lint/performance/noAwaitInLoops: Verify each bounded trusted record snapshot.
      (await sha256Hex(canonicalJson(record2))) !== saved.sha256
    ) {
      throw new Error("Unverified action effect record");
    }
    records.set(key2, record2);
  }
  return records;
}
async function validateBuilderEffectPlan(raw, declarationInput, contextInput) {
  if (new TextEncoder().encode(raw).byteLength > 65536) {
    throw new Error("Action effect output exceeds byte limit");
  }
  const plan = BuilderEffectPlanSchema.parse(parseBuilderJson(raw));
  const declaration = BuilderActionEffectsSchema.parse(declarationInput);
  const context = ContextSchema.parse(contextInput);
  const scopeKey = contentScopeKey(context.scope);
  if (plan.commands.length > declaration.maxCommands) {
    throw new Error("Action effect command limit");
  }
  const definitions = await verifyDefinitions(declaration, context, scopeKey);
  const records = await verifyRecords(context, definitions, scopeKey);
  const seen = /* @__PURE__ */ new Set();
  const commands = [];
  for (const command of plan.commands) {
    const key2 = canonicalJson([command.collectionId, command.recordId]);
    const permission = declaration.permissions.find(
      (p) => p.collection.id === command.collectionId
    );
    const definition = definitions.get(command.collectionId);
    if (
      seen.has(key2) ||
      !permission ||
      !definition ||
      !permission.operations.includes(command.type)
    ) {
      throw new Error("Undeclared or duplicate action effect");
    }
    seen.add(key2);
    const prior = records.get(key2);
    if (
      command.type === "create"
        ? prior !== void 0
        : !prior ||
          prior.archived ||
          prior.revision !== command.expectedRevision
    ) {
      throw new Error("Action effect record conflict");
    }
    if (
      command.type !== "archive" &&
      (Object.keys(command.values).length === 0 ||
        Object.keys(command.values).some(
          (field) => !permission.fields.includes(field)
        ))
    ) {
      throw new Error("Undeclared action effect field");
    }
    const values =
      command.type === "archive"
        ? { ...prior?.values }
        : { ...(prior?.values ?? {}), ...command.values };
    const validated = parseCollectionValues(definition, values);
    commands.push({
      archived: command.type === "archive",
      collectionId: command.collectionId,
      expectedRevision: command.expectedRevision,
      recordId: command.recordId,
      schemaVersion: definition.version,
      type: command.type,
      values: validated,
    });
  }
  return { commands, result: plan.result, version: 1 };
}

// packages/protocol/src/builder-record-bindings.ts
var BuilderCmsDataSchema = record(
  CollectionIdentitySchema,
  array(
    object({
      id: CollectionIdentitySchema,
      values: CollectionRecordValuesSchema,
    }).strict()
  ).max(100)
).refine(
  (data) =>
    Object.values(data).reduce((sum, rows) => sum + rows.length, 0) <= 100,
  "CMS record budget exceeded"
);
var BuilderRecordBindingSchema = object({
  bindingId: CollectionIdentitySchema,
  fields: array(
    object({
      fieldId: CollectionIdentitySchema,
      format: literal("text").optional(),
      nodeId: CollectionIdentitySchema,
      prop: string2()
        .min(1)
        .max(64)
        .regex(/^[a-z][A-Za-z0-9_]*$/)
        .refine(
          (key2) => !["__proto__", "constructor", "prototype"].includes(key2)
        ),
    }).strict()
  )
    .min(1)
    .max(30),
  templateId: CollectionIdentitySchema,
}).strict();
function validateRecordFields(artifact, mapping, fields, subtree, nodes) {
  const targets = /* @__PURE__ */ new Set();
  for (const field of mapping.fields) {
    const target2 = `${field.nodeId}:${field.prop}`,
      node = nodes.get(field.nodeId);
    if (
      !(subtree.has(field.nodeId) && fields.includes(field.fieldId)) ||
      targets.has(target2)
    ) {
      throw new Error("Invalid CMS record field mapping");
    }
    if (
      artifact.propertyBindings.some(
        (item) => item.nodeId === field.nodeId && item.prop === field.prop
      ) ||
      Object.values(node?.responsive ?? {}).some((override) =>
        Object.hasOwn(override.props ?? {}, field.prop)
      )
    ) {
      throw new Error("CMS record field cannot have static overrides");
    }
    targets.add(target2);
  }
}
function validateRepeatableNode(artifact, node) {
  if (
    Object.hasOwn(node.props, "anchor") ||
    Object.values(node.responsive ?? {}).some((override) =>
      Object.hasOwn(override.props ?? {}, "anchor")
    ) ||
    artifact.propertyBindings.some(
      (binding) => binding.nodeId === node.id && binding.prop === "anchor"
    )
  ) {
    throw new Error("CMS repeated nodes cannot declare an anchor");
  }
}
function validateRecordBindings(artifact, nodes) {
  if (artifact.recordBindings === void 0) {
    return;
  }
  const bindings = /* @__PURE__ */ new Set(),
    claimed = /* @__PURE__ */ new Set();
  for (const mapping of artifact.recordBindings) {
    const binding = artifact.dataBindings.find(
      (item) => item.id === mapping.bindingId
    );
    const template = nodes.get(mapping.templateId);
    if (
      !(binding && template) ||
      template === artifact.root ||
      bindings.has(mapping.bindingId)
    ) {
      throw new Error("Invalid CMS record template");
    }
    bindings.add(mapping.bindingId);
    const subtree = /* @__PURE__ */ new Set(),
      pending = [template];
    while (pending.length) {
      const node = pending.pop();
      if (!node) {
        break;
      }
      if (claimed.has(node.id)) {
        throw new Error("Overlapping CMS record templates");
      }
      validateRepeatableNode(artifact, node);
      subtree.add(node.id);
      claimed.add(node.id);
      pending.push(...node.children);
    }
    validateRecordFields(artifact, mapping, binding.fields, subtree, nodes);
  }
  if (bindings.size !== artifact.dataBindings.length) {
    throw new Error("CMS record mapping missing");
  }
}

// packages/protocol/src/builder-artifact.ts
var encoder2 = new TextEncoder();
var reserved2 = /* @__PURE__ */ new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
var common3 = {
  formatVersion: literal(1),
  id: CollectionIdentitySchema,
  label: string2().trim().min(1).max(120),
  scope: ContentScopeSchema,
  version: number2().int().min(1).max(Number.MAX_SAFE_INTEGER),
};
var CollectionPinSchema = BuilderArtifactPinSchema.extend({
  kind: literal("collection"),
});
var ActionPinSchema = BuilderArtifactPinSchema.extend({
  kind: literal("action"),
});
var ComponentFieldKeySchema = string2()
  .min(1)
  .max(64)
  .regex(/^[a-z][A-Za-z0-9_]*$/)
  .refine((key2) => !reserved2.has(key2), "Reserved component field");
var PropertyValuesSchema = record(
  CollectionIdentitySchema,
  union([string2(), number2().finite(), boolean2()])
);
var BuilderDataBindingSchema = object({
  collection: CollectionPinSchema,
  fields: array(CollectionIdentitySchema).min(1).max(30),
  id: CollectionIdentitySchema,
  limit: number2().int().min(1).max(100),
})
  .strict()
  .refine(
    (binding) => new Set(binding.fields).size === binding.fields.length,
    "Duplicate selected field"
  );
var CompositionSchema = object({
  ...common3,
  actions: array(ActionPinSchema).max(16),
  dataBindings: array(BuilderDataBindingSchema).max(16),
  defaults: PropertyValuesSchema,
  kind: literal("component"),
  properties: array(CollectionFieldSchema).max(30),
  propertyBindings: array(
    object({
      nodeId: CollectionIdentitySchema,
      prop: ComponentFieldKeySchema,
      propertyId: CollectionIdentitySchema,
    }).strict()
  ).max(100),
  recordBindings: array(BuilderRecordBindingSchema).max(16).optional(),
  root: ComponentNodeSchema,
}).strict();
var LegacyActionSchema = object({
  ...common3,
  collections: array(BuilderDataBindingSchema).max(16),
  kind: literal("action"),
  source: string2().trim().min(1).max(65536),
  tests: array(
    object({
      data: JsonValueSchema,
      expected: JsonValueSchema,
      input: JsonValueSchema,
    }).strict()
  )
    .min(1)
    .max(16),
}).strict();
var ActionSchema = discriminatedUnion("formatVersion", [
  LegacyActionSchema,
  LegacyActionSchema.extend({
    effects: BuilderActionEffectsSchema,
    formatVersion: literal(2),
    inputContract: BuilderActionInputContractSchema.optional(),
    tests: array(
      object({
        data: JsonValueSchema,
        expected: BuilderEffectPlanSchema,
        input: JsonValueSchema,
      }).strict()
    )
      .min(1)
      .max(16),
  }).strict(),
]);
var ArtifactSchema = discriminatedUnion("kind", [
  CompositionSchema,
  ActionSchema,
  object({
    definition: CollectionDefinitionSchema,
    kind: literal("collection"),
  }).strict(),
]);
function propertyValues(artifact, values) {
  if (artifact.properties.length === 0) {
    return object({}).strict().parse(values);
  }
  return parseCollectionValues(
    {
      displayFieldId: artifact.properties[0]?.id,
      fields: artifact.properties,
      formatVersion: 1,
      id: artifact.id,
      label: artifact.label,
      scope: artifact.scope,
      version: artifact.version,
    },
    values
  );
}
function componentNodes(root) {
  const result = /* @__PURE__ */ new Map();
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node) {
      break;
    }
    if (result.has(node.id) || result.size >= 200) {
      throw new Error("Duplicate or excessive component nodes");
    }
    if (node.builderInstance) {
      throw new Error("Artifact templates cannot contain a saved instance");
    }
    if (["navigation", "footer", "leadForm", "embed"].includes(node.type)) {
      throw new Error("Component requires site-level admission");
    }
    result.set(node.id, node);
    pending.push(...node.children);
  }
  return result;
}
function builderArtifactDependencies(artifact) {
  let dependencies = [];
  if (artifact.kind === "action") {
    dependencies = [
      ...artifact.collections.map((binding) => binding.collection),
      ...(artifact.formatVersion === 2
        ? artifact.effects.permissions.map(
            (permission) => permission.collection
          )
        : []),
    ];
  }
  if (artifact.kind === "component") {
    dependencies = [
      ...artifact.dataBindings.map((binding) => binding.collection),
      ...artifact.actions,
    ];
  }
  const pins = /* @__PURE__ */ new Map();
  for (const pin2 of dependencies) {
    const key2 = `${pin2.kind}:${pin2.id}:${pin2.version}`;
    const existing = pins.get(key2);
    if (existing && existing.sha256 !== pin2.sha256) {
      throw new Error("Conflicting dependency digests");
    }
    pins.set(key2, pin2);
  }
  return [...pins.values()].sort((a, b) =>
    `${a.kind}:${a.id}:${a.version}`.localeCompare(
      `${b.kind}:${b.id}:${b.version}`,
      "en"
    )
  );
}
function parseBuilderArtifact(raw) {
  const artifact = ArtifactSchema.parse(parseBuilderJson(raw));
  if (artifact.kind === "collection") {
    return artifact;
  }
  const bindings =
    artifact.kind === "component"
      ? artifact.dataBindings
      : artifact.collections;
  if (new Set(bindings.map((binding) => binding.id)).size !== bindings.length) {
    throw new Error("Duplicate data binding identity");
  }
  builderArtifactDependencies(artifact);
  if (artifact.kind === "action") {
    return artifact;
  }
  propertyValues(artifact, artifact.defaults);
  const nodes = componentNodes(artifact.root);
  validateRecordBindings(artifact, nodes);
  const targets = /* @__PURE__ */ new Set();
  for (const binding of artifact.propertyBindings) {
    const target2 = `${binding.nodeId}:${binding.prop}`;
    if (
      !(
        nodes.has(binding.nodeId) &&
        artifact.properties.some(
          (property2) => property2.id === binding.propertyId
        )
      ) ||
      targets.has(target2)
    ) {
      throw new Error("Invalid component property binding");
    }
    targets.add(target2);
  }
  return artifact;
}
async function describeBuilderArtifact(input) {
  const artifact = parseBuilderArtifact(JSON.stringify(input));
  const identity5 =
    artifact.kind === "collection" ? artifact.definition : artifact;
  const body = canonicalJson(artifact);
  return {
    artifact,
    body,
    change: BuilderArtifactChangeSchema.parse({
      bytes: encoder2.encode(body).byteLength,
      dependencies: builderArtifactDependencies(artifact),
      expectedVersion: identity5.version - 1,
      id: identity5.id,
      kind: artifact.kind,
      sha256: await sha256Hex(body),
      version: identity5.version,
    }),
  };
}
async function instantiateBuilderComponent(input, values, instanceId) {
  const parsed = parseBuilderArtifact(JSON.stringify(input));
  if (parsed.kind !== "component") {
    throw new Error("Component artifact required");
  }
  CollectionIdentitySchema.parse(instanceId);
  const properties = propertyValues(parsed, {
    ...parsed.defaults,
    ...PropertyValuesSchema.parse(values),
  });
  const root = structuredClone(parsed.root);
  const nodes = componentNodes(root);
  for (const binding of parsed.propertyBindings) {
    const node = nodes.get(binding.nodeId);
    if (node && Object.hasOwn(properties, binding.propertyId)) {
      node.props[binding.prop] = properties[binding.propertyId];
    }
  }
  const rootId = root.id;
  await Promise.all(
    [...nodes.values()].map(async (node) => {
      node.id = await builderComponentNodeId(instanceId, node.id, rootId);
    })
  );
  if (new Set([...nodes.values()].map((node) => node.id)).size !== nodes.size) {
    throw new Error("Component instance identity collision");
  }
  return ComponentNodeSchema.parse(root);
}
async function builderComponentNodeId(instanceId, sourceId, rootId) {
  return sourceId === rootId
    ? instanceId
    : `component_${(await sha256Hex(canonicalJson([instanceId, sourceId]))).slice(0, 54)}`;
}

// packages/protocol/src/builder-form-action-validation.ts
async function validateBuilderFormActionBinding(formInput, actionInput) {
  const form = PageFormSchema.parse(formInput);
  const binding = form.submission;
  const action = parseBuilderArtifact(JSON.stringify(actionInput));
  if (
    !binding ||
    action.kind !== "action" ||
    action.formatVersion !== 2 ||
    !action.inputContract
  ) {
    throw new Error("Form action requires a finite action input contract");
  }
  const { change } = await describeBuilderArtifact(action);
  if (
    binding.action.id !== change.id ||
    binding.action.version !== change.version ||
    binding.action.sha256 !== change.sha256
  ) {
    throw new Error("Form action artifact pin mismatch");
  }
  if (form.fields.length > 32) {
    throw new Error("Action form field limit exceeded");
  }
  const mapped = /* @__PURE__ */ new Set();
  for (const mapping of binding.mappings) {
    const field = form.fields.find((x) => x.id === mapping.fieldId);
    const property2 = action.inputContract.properties.find(
      (x) => x.key === mapping.inputKey
    );
    let type = "string";
    if (field?.type === "number") {
      type = "number";
    }
    if (field?.type === "checkbox") {
      type = "boolean";
    }
    if (
      !(field && property2) ||
      type !== mapping.conversion ||
      property2.type !== mapping.conversion ||
      (property2.required && !field.required && type !== "boolean")
    ) {
      throw new Error("Incompatible form action mapping");
    }
    if (
      field.type === "select" &&
      property2.type === "string" &&
      property2.enum &&
      field.options?.some((x) => !property2.enum?.includes(x))
    ) {
      throw new Error("Form choices exceed action input choices");
    }
    mapped.add(property2.key);
  }
  if (
    action.inputContract.properties.some(
      (x) => x.required && !mapped.has(x.key)
    )
  ) {
    throw new Error("Required action input is not mapped");
  }
  return { action, binding, form };
}
var NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
var PHONE = /^[+0-9() .-]{6,30}$/;
var DATE = /^\d{4}-\d{2}-\d{2}$/;
function checkboxValue(field, raw) {
  if (
    raw !== void 0 &&
    raw !== "" &&
    !["true", "on", "accepted", "false"].includes(raw)
  ) {
    throw new Error("Invalid checkbox value");
  }
  const checked = raw === "true" || raw === "on" || raw === "accepted";
  if (field.required && !checked) {
    throw new Error("Required checkbox is unchecked");
  }
  return checked;
}
function numericValue(field, raw) {
  if (!NUMBER.test(raw)) {
    throw new Error("Invalid numeric field");
  }
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    (field.min !== void 0 && value < field.min) ||
    (field.max !== void 0 && value > field.max)
  ) {
    throw new Error("Numeric field outside bounds");
  }
  return value;
}
function validateText(field, raw) {
  if (field.type === "select" && !field.options?.includes(raw)) {
    throw new Error("Invalid form choice");
  }
  if (field.type === "email" && !EMAIL.test(raw)) {
    throw new Error("Invalid email field");
  }
  if (field.type === "tel" && !PHONE.test(raw)) {
    throw new Error("Invalid telephone field");
  }
  if (field.type === "date") {
    if (!DATE.test(raw)) {
      throw new Error("Invalid date field");
    }
    const date3 = /* @__PURE__ */ new Date(`${raw}T00:00:00.000Z`);
    if (
      !Number.isFinite(date3.getTime()) ||
      date3.toISOString().slice(0, 10) !== raw
    ) {
      throw new Error("Invalid date field");
    }
  }
}
function fieldValue(field, raw) {
  if (field.type === "checkbox") {
    return checkboxValue(field, raw);
  }
  if (raw === void 0 || raw === "") {
    if (field.required) {
      throw new Error("Required form field missing");
    }
    return void 0;
  }
  if (raw.length > (field.type === "textarea" ? 1e4 : 1e3)) {
    throw new Error("Form field length exceeded");
  }
  if (field.type === "number") {
    return numericValue(field, raw);
  }
  validateText(field, raw);
  return raw;
}
async function convertBuilderFormActionInput(
  formInput,
  actionInput,
  valuesInput
) {
  const { form, action, binding } = await validateBuilderFormActionBinding(
    formInput,
    actionInput
  );
  if (
    !valuesInput ||
    typeof valuesInput !== "object" ||
    Array.isArray(valuesInput)
  ) {
    throw new Error("Invalid form values");
  }
  const values = valuesInput;
  const fieldIds = new Set(form.fields.map((x) => x.id));
  if (
    Object.getOwnPropertySymbols(values).length > 0 ||
    Object.getOwnPropertyNames(values).some(
      (key2) => !fieldIds.has(key2) || typeof values[key2] !== "string"
    )
  ) {
    throw new Error("Unknown or invalid form value");
  }
  const converted = /* @__PURE__ */ new Map();
  for (const field of form.fields) {
    converted.set(
      field.id,
      fieldValue(
        field,
        Object.hasOwn(values, field.id) ? values[field.id] : void 0
      )
    );
  }
  const input = {};
  for (const mapping of binding.mappings) {
    const value = converted.get(mapping.fieldId);
    if (value !== void 0) {
      input[mapping.inputKey] = value;
    }
  }
  return validateBuilderActionInput(action.inputContract, input);
}

// packages/protocol/src/content-attachment.ts
var ScopedId = string2().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/);
var OperationId = string2().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
var Digest = string2().regex(/^[a-f0-9]{64}$/);
var Scope = object({
  businessId: ScopedId,
  clientId: ScopedId,
  environment: _enum(["preview", "staging", "production"]),
  siteId: union([
    string2()
      .min(3)
      .max(64)
      .regex(/^[a-z][a-z0-9_-]*$/),
    string2().uuid(),
  ]),
  tenantId: ScopedId,
}).strict();
var ContentAttachmentRequestSchema = object({
  actor: object({
    kind: _enum(["client-user", "agency-user"]),
    loginSessionHash: Digest,
    userId: string2().uuid(),
  }).strict(),
  anchor: object({ checkpointId: OperationId, digest: Digest }).strict(),
  mode: literal("attach-existing-content"),
  operationId: OperationId,
  policyVersion: OperationId,
  runtimeDigest: Digest,
  schemaDigest: Digest,
  scope: Scope,
  version: literal(1),
}).strict();
var ContentAttachmentCompletionSchema = object({
  activationId: string2().uuid(),
  identity: string2().regex(/^cms_attach_[a-f0-9]{64}$/),
  operationId: OperationId,
  proofDigest: Digest,
  scope: Scope,
  version: literal(1),
}).strict();

// packages/protocol/src/cms-managed.ts
var CMS_PREPARATION_MAX_ITEMS = 32;
var CMS_PREPARATION_MAX_BYTES = 15e5;
var CMS_INVENTORY_MAX_ROWS = 20;
var version3 = number2().int().min(1).max(Number.MAX_SAFE_INTEGER);
var { actor } = ContentAttachmentRequestSchema.shape;
var CmsStorageTargetSchema = object({
  accountId: string2().regex(/^[a-f0-9]{32}$/),
  collectionReceiptDigest: ReleaseSha256Schema,
  databaseId: uuid2(),
  name: string2().regex(/^ps-content-[a-f0-9]{32}$/),
  routeId: ReleaseScopedIdSchema,
  runtimeDigest: ReleaseSha256Schema,
  stagingReceiptDigest: ReleaseSha256Schema,
  workflowReceiptDigest: ReleaseSha256Schema,
}).strict();
var CmsFreezeRequestSchema = object({
  actor,
  adoptionId: ReleaseScopedIdSchema,
  formatVersion: literal(1),
  scope: ContentScopeSchema,
  target: CmsStorageTargetSchema,
}).strict();
var CmsFreezeReceiptBodySchema = object({
  createdAt: iso_exports.datetime(),
  request: CmsFreezeRequestSchema,
  state: literal("frozen"),
}).strict();
var CmsFreezeReceiptSchema = CmsFreezeReceiptBodySchema.extend({
  digest: ReleaseSha256Schema,
}).strict();
var logicalIdentity = {
  collectionId: union([literal(""), CollectionIdentitySchema]),
  kind: _enum(["content", "schema", "record"]),
  recordId: union([literal(""), CollectionIdentitySchema]),
  version: version3,
};
function validIdentity(value) {
  if (value.kind === "content") {
    return value.collectionId === "" && value.recordId === "";
  }
  return (
    value.collectionId !== "" &&
    (value.kind === "schema" ? value.recordId === "" : value.recordId !== "")
  );
}
var CmsObjectPinSchema = object({
  ...logicalIdentity,
  bytes: number2().int().min(1).max(512e3),
  freezeDigest: ReleaseSha256Schema,
  operationId: ReleaseScopedIdSchema,
  origin: _enum(["legacy", "prepared"]),
  sha256: ReleaseSha256Schema,
})
  .strict()
  .refine(validIdentity, "Invalid CMS logical identity");
var commonItem = {
  expectedBase: CmsObjectPinSchema.nullable(),
  version: version3,
};
var CmsPreparedItemSchema = discriminatedUnion("kind", [
  object({
    ...commonItem,
    body: BusinessContentSchema,
    kind: literal("content"),
  }).strict(),
  object({
    ...commonItem,
    body: CollectionDefinitionSchema,
    kind: literal("schema"),
  }).strict(),
  object({
    ...commonItem,
    body: CollectionRecordSchema,
    kind: literal("record"),
    schema: CmsObjectPinSchema,
  }).strict(),
]);
function cmsItemIdentity(item) {
  let collectionId = "";
  if (item.kind === "schema") {
    collectionId = item.body.id;
  }
  if (item.kind === "record") {
    ({ collectionId } = item.body);
  }
  return {
    collectionId,
    kind: item.kind,
    recordId: item.kind === "record" ? item.body.id : "",
    version: item.version,
  };
}
function cmsLogicalKey(pin2) {
  return JSON.stringify([pin2.kind, pin2.collectionId, pin2.recordId]);
}
var CmsHumanPreparationSchema = object({
  action: BuilderArtifactPinSchema.extend({ kind: literal("action") })
    .strict()
    .nullable(),
  actor,
  candidateDigest: ReleaseSha256Schema.nullable(),
  formatVersion: literal(1),
  freezeDigest: ReleaseSha256Schema,
  items: array(CmsPreparedItemSchema).min(1).max(CMS_PREPARATION_MAX_ITEMS),
  operationId: ReleaseScopedIdSchema,
  scope: ContentScopeSchema,
}).strict();
var CmsPublishedFormActorSchema = object({
  activationId: uuid2(),
  identityDigest: ReleaseSha256Schema,
  invocationId: uuid2(),
  kind: literal("published-form"),
  pointerVersion: version3,
  releaseId: uuid2(),
}).strict();
var CmsPublishedPreparationSchema = CmsHumanPreparationSchema.extend({
  action: BuilderArtifactPinSchema.extend({
    kind: literal("action"),
  }).strict(),
  actor: CmsPublishedFormActorSchema,
  candidateDigest: _null3(),
  formatVersion: literal(2),
}).strict();
function isNewPublicRecord(item) {
  return (
    item.kind === "record" &&
    item.expectedBase === null &&
    item.version === 1 &&
    item.body.revision === 1 &&
    item.body.archived === false
  );
}
var CmsPreparationSchema = discriminatedUnion("formatVersion", [
  CmsHumanPreparationSchema,
  CmsPublishedPreparationSchema,
])
  .superRefine((request, ctx) => {
    if (
      request.formatVersion === 2 &&
      !request.items.every(isNewPublicRecord)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Published preparations permit only new unarchived records",
      });
    }
  })
  .superRefine((request, ctx) => {
    const issue2 = (message) => ctx.addIssue({ code: "custom", message });
    const keys = /* @__PURE__ */ new Set();
    for (const item of request.items) {
      const identity5 = cmsItemIdentity(item);
      const key2 = cmsLogicalKey(identity5);
      if (keys.has(key2)) {
        issue2("Duplicate CMS effect identity");
      }
      keys.add(key2);
      if (contentScopeKey(item.body.scope) !== contentScopeKey(request.scope)) {
        issue2("CMS body scope mismatch");
      }
      if (item.version !== (item.expectedBase?.version ?? 0) + 1) {
        issue2("CMS version must advance exactly once");
      }
      if (
        item.expectedBase &&
        (cmsLogicalKey(item.expectedBase) !== key2 ||
          item.expectedBase.freezeDigest !== request.freezeDigest)
      ) {
        issue2("CMS expected base identity mismatch");
      }
      if (item.kind === "schema" && item.version !== item.body.version) {
        issue2("Schema version mismatch");
      }
      if (
        item.kind === "record" &&
        (item.version !== item.body.revision ||
          item.schema.kind !== "schema" ||
          item.schema.collectionId !== item.body.collectionId ||
          item.schema.version !== item.body.schemaVersion ||
          item.schema.freezeDigest !== request.freezeDigest)
      ) {
        issue2("Record schema pin mismatch");
      }
    }
    if (
      new TextEncoder().encode(JSON.stringify(request)).byteLength >
      CMS_PREPARATION_MAX_BYTES
    ) {
      issue2("CMS preparation byte limit exceeded");
    }
  });
var CmsPreparationReceiptBodySchema = object({
  createdAt: iso_exports.datetime(),
  freezeDigest: ReleaseSha256Schema,
  items: array(CmsObjectPinSchema).min(1).max(CMS_PREPARATION_MAX_ITEMS),
  operationId: ReleaseScopedIdSchema,
  requestDigest: ReleaseSha256Schema,
  scope: ContentScopeSchema,
  state: literal("prepared"),
}).strict();
var CmsPreparationReceiptSchema = CmsPreparationReceiptBodySchema.extend({
  digest: ReleaseSha256Schema,
}).strict();
var CmsInventoryCursorSchema = object({
  ...logicalIdentity,
  formatVersion: literal(1),
  freezeDigest: ReleaseSha256Schema,
})
  .strict()
  .refine(validIdentity, "Invalid inventory cursor identity");
var CmsInventoryReadSchema = object({
  adoptionId: ReleaseScopedIdSchema,
  cursor: CmsInventoryCursorSchema.nullable(),
  freezeDigest: ReleaseSha256Schema,
  limit: number2()
    .int()
    .min(1)
    .max(CMS_INVENTORY_MAX_ROWS)
    .default(CMS_INVENTORY_MAX_ROWS),
  scope: ContentScopeSchema,
}).strict();

// packages/protocol/src/builder-application.ts
var identity3 = string2()
  .min(3)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);
var scopedId = string2().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
var pin = object({
  id: identity3,
  sha256: string2().regex(/^[a-f0-9]{64}$/),
  version: number2().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
var BuilderApplicationSchema = object({
  actions: array(pin.extend({ kind: literal("action") }).strict()).max(128),
  collections: array(pin.extend({ kind: literal("collection") }).strict()).max(
    128
  ),
  scope: object({
    businessId: scopedId,
    clientId: scopedId,
    environment: _enum(["preview", "staging", "production"]),
    siteId: union([identity3, uuid2()]),
    tenantId: scopedId,
  }).strict(),
  version: literal(1),
})
  .strict()
  .superRefine((value, ctx) => {
    for (const pins of [value.collections, value.actions]) {
      if (new Set(pins.map((item) => item.id)).size !== pins.length) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate application selection",
        });
      }
    }
  });

// packages/protocol/src/integrations.ts
var AnalyticsProviderSchema = discriminatedUnion("provider", [
  object({
    measurementId: string2().regex(/^G-[A-Z0-9]{6,20}$/),
    provider: literal("ga4"),
  }).strict(),
  object({
    containerId: string2().regex(/^GTM-[A-Z0-9]{4,20}$/),
    provider: literal("google-tag-manager"),
  }).strict(),
  object({
    pixelId: string2().regex(/^[0-9]{5,32}$/),
    provider: literal("meta-pixel"),
  }).strict(),
]);
var AnalyticsSettingsSchema = object({
  conversionEvents: array(
    object({
      id: StableIdSchema,
      name: string2().trim().min(1).max(80),
    }).strict()
  )
    .max(50)
    .default([]),
  providers: array(AnalyticsProviderSchema).max(3).default([]),
})
  .strict()
  .superRefine((settings, context) => {
    const providers = /* @__PURE__ */ new Set();
    settings.providers.forEach((provider, index) => {
      if (providers.has(provider.provider)) {
        context.addIssue({
          code: "custom",
          message: `Analytics provider ${provider.provider} is duplicated`,
          path: ["providers", index, "provider"],
        });
      }
      providers.add(provider.provider);
    });
    const events = /* @__PURE__ */ new Set();
    settings.conversionEvents.forEach((event, index) => {
      if (events.has(event.id)) {
        context.addIssue({
          code: "custom",
          message: `Conversion event ${event.id} is duplicated`,
          path: ["conversionEvents", index, "id"],
        });
      }
      events.add(event.id);
    });
  });
var SiteIntegrationsSchema = object({
  analytics: AnalyticsSettingsSchema.optional(),
}).strict();
var PublicSiteRuntimeSchema = object({
  analytics: AnalyticsSettingsSchema.optional(),
  forms: array(
    object({
      form: PageFormSchema,
      pageId: StableIdSchema,
      route: RouteSchema,
    }).strict()
  ).max(500),
  schemaVersion: literal(1),
  siteId: SiteIdSchema,
}).strict();

// packages/site-icons/src/index.ts
var SITE_ICON_NAMES = [
  "analytics",
  "automations",
  "engagement",
  "integrations",
  "security",
];

// packages/protocol/src/urls.ts
var SAFE_MAILTO_RE =
  /^mailto:[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
var SAFE_TEL_RE = /^tel:\+?[0-9][0-9(). -]{2,31}$/;
function isCredentialFreeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname !== "localhost"
    );
  } catch {
    return false;
  }
}
function isCanonicalOrigin(value) {
  if (!isCredentialFreeHttpsUrl(value)) {
    return false;
  }
  const url = new URL(value);
  return url.pathname === "/" && url.search === "" && url.hash === "";
}
function isSafeActionHref(value) {
  return SAFE_MAILTO_RE.test(value) || SAFE_TEL_RE.test(value);
}
function isOwnedAssetPath(value) {
  return (
    value.startsWith("/assets/") &&
    !value.includes("\\") &&
    !value.includes("?") &&
    !value.includes("#") &&
    !value.split("/").includes("..")
  );
}
var SafeExternalUrlSchema = string2()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    isCredentialFreeHttpsUrl,
    "External URL must be credential-free HTTPS"
  );
var SafeCanonicalOriginSchema = string2()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    isCanonicalOrigin,
    "Canonical origin must be credential-free HTTPS without a path, query, or fragment"
  )
  .transform((value) => new URL(value).origin);
var SafeActionHrefSchema = string2()
  .trim()
  .min(1)
  .max(320)
  .refine(
    isSafeActionHref,
    "Action href must be a telephone or email address without parameters"
  );
var OwnedAssetPathSchema = string2()
  .trim()
  .min(9)
  .max(2048)
  .refine(isOwnedAssetPath, "Asset must use an owned /assets/ path");

// packages/protocol/src/shell.ts
var NavigationLabelSchema = string2().trim().min(1).max(80);
var SiteIconNameSchema = _enum(SITE_ICON_NAMES);
var NavigationPresentationSchema = object({
  description: string2().trim().min(1).max(160).optional(),
  icon: object({
    kind: literal("library"),
    name: SiteIconNameSchema,
  })
    .strict()
    .optional(),
})
  .strict()
  .refine(
    (presentation) => Object.keys(presentation).length > 0,
    "Navigation presentation cannot be empty"
  );
var PageNavigationTargetSchema = object({
  kind: literal("page"),
  pageId: StableIdSchema,
}).strict();
var ExternalNavigationTargetSchema = object({
  href: SafeExternalUrlSchema,
  kind: literal("external"),
  newTab: boolean2().default(false),
}).strict();
var ActionNavigationTargetSchema = object({
  href: SafeActionHrefSchema,
  kind: literal("action"),
}).strict();
var NavigationTargetSchema = discriminatedUnion("kind", [
  PageNavigationTargetSchema,
  ExternalNavigationTargetSchema,
  ActionNavigationTargetSchema,
]);
var NavigationChildItemSchema = object({
  id: StableIdSchema,
  label: NavigationLabelSchema,
  presentation: NavigationPresentationSchema.optional(),
  target: NavigationTargetSchema,
}).strict();
var NavigationItemSchema = object({
  children: array(NavigationChildItemSchema).max(12).default([]),
  id: StableIdSchema,
  label: NavigationLabelSchema,
  presentation: NavigationPresentationSchema.optional(),
  target: NavigationTargetSchema,
}).strict();
var ShellActionSchema = object({
  label: NavigationLabelSchema,
  target: NavigationTargetSchema,
}).strict();
var HeaderManifestSchema = object({
  announcement: ShellActionSchema.optional(),
  brand: object({
    logo: object({
      alt: string2().trim().max(160),
      src: OwnedAssetPathSchema,
    })
      .strict()
      .optional(),
    name: string2().trim().min(1).max(120),
  }).strict(),
  breakpoint: _enum(["sm", "md", "lg"]).optional(),
  enabled: boolean2(),
  layout: _enum(["logo-left", "logo-centred", "split"]),
  primaryAction: ShellActionSchema.optional(),
  sticky: boolean2(),
  tone: _enum(["default", "brand", "dark", "transparent"]).optional(),
  transparent: boolean2().optional(),
  width: _enum(["narrow", "standard", "wide", "full"]).optional(),
}).strict();
var NavigationManifestSchema = object({
  enabled: boolean2(),
  items: array(NavigationItemSchema).max(16),
}).strict();
var MobileNavigationManifestSchema = object({
  closeButton: _enum(["icon", "label", "icon-label"]).optional(),
  contact: object({
    email: string2().trim().email().max(320).optional(),
    phone: string2().trim().min(3).max(80).optional(),
  })
    .strict()
    .optional(),
  direction: _enum(["left", "right"]).optional(),
  nestedItems: _enum(["accordion", "stacked"]).optional(),
  overlay: boolean2().optional(),
  presentation: _enum(["drawer", "overlay", "dropdown"]),
  primaryAction: ShellActionSchema.optional(),
  socialLinks: array(NavigationChildItemSchema).max(12).optional(),
  tone: _enum(["default", "brand", "dark"]).optional(),
  width: _enum(["compact", "standard", "wide", "full"]).optional(),
}).strict();
var FooterManifestSchema = object({
  brandCopy: string2().trim().max(1e3).optional(),
  columns: array(
    object({
      id: StableIdSchema,
      label: string2().trim().min(1).max(80),
      links: array(NavigationChildItemSchema).max(12),
    }).strict()
  ).max(8),
  contact: object({
    email: string2().trim().email().max(320).optional(),
    phone: string2().trim().min(3).max(80).optional(),
  })
    .strict()
    .optional(),
  copyright: string2().trim().max(240).optional(),
  enabled: boolean2(),
  layout: _enum([
    "minimal",
    "centred",
    "two-column",
    "three-column",
    "four-column",
    "cta",
    "locations",
    "legal",
  ]).optional(),
  legalText: string2().trim().max(2e3).optional(),
  locations: array(
    object({
      addressLines: array(string2().trim().min(1).max(160)).max(4),
      id: StableIdSchema,
      label: string2().trim().min(1).max(80),
      openingHours: string2().trim().max(500).optional(),
    }).strict()
  )
    .max(12)
    .optional(),
  primaryAction: ShellActionSchema.optional(),
  socialLinks: array(NavigationChildItemSchema).max(12).default([]),
}).strict();
var SiteShellManifestSchema = object({
  footer: FooterManifestSchema,
  header: HeaderManifestSchema,
  mobileNavigation: MobileNavigationManifestSchema,
  navigation: NavigationManifestSchema,
}).strict();
var ShellVisibilitySchema = _enum(["inherit", "hidden"]);

// packages/protocol/src/site.ts
var SITE_PRESENTATION_TOKEN = "style.presentation";
var SITE_PRESENTATIONS = ["standard", "poster"];
var ThemeManifestSchema = object({
  id: StableIdSchema,
  schemaVersion: literal(1),
  tokens: record(string2().min(1).max(120), string2().max(2e3)),
}).strict();
var SiteManifestV1Schema = object({
  defaultLocale: string2().min(2).max(35),
  id: SiteIdSchema,
  integrations: SiteIntegrationsSchema.optional(),
  name: string2().min(1).max(120),
  pages: array(PageManifestV1Schema).min(1).max(200),
  schemaVersion: literal(1),
  theme: ThemeManifestSchema,
}).strict();
var SiteRedirectSchema = object({
  from: RouteSchema,
  status: literal(308),
  toPageId: StableIdSchema,
}).strict();
var SiteManifestV2Schema = object({
  builderApplication: BuilderApplicationSchema.optional(),
  builderLibrary: BuilderComponentLibrarySchema.optional(),
  contentBinding: ContentBindingSchema.optional(),
  defaultLocale: string2().min(2).max(35),
  id: SiteIdSchema,
  integrations: SiteIntegrationsSchema.optional(),
  name: string2().min(1).max(120),
  pages: array(PageManifestV2Schema).min(1).max(200),
  redirects: array(SiteRedirectSchema).max(500),
  schemaVersion: literal(2),
  seo: object({
    canonicalOrigin: SafeCanonicalOriginSchema.optional(),
    defaultDescription: string2().max(320).optional(),
    siteName: string2().trim().min(1).max(120),
  }).strict(),
  shell: SiteShellManifestSchema,
  theme: ThemeManifestSchema,
}).strict();
var SiteManifestSchema = discriminatedUnion("schemaVersion", [
  SiteManifestV1Schema,
  SiteManifestV2Schema,
]);

// packages/protocol/src/component-design.ts
var COMPONENT_DESIGN_FIELDS = [
  {
    defaultValue: "normal",
    key: "textWrap",
    label: "Text wrapping",
    options: [
      { label: "Normal", value: "normal" },
      { label: "Balanced", value: "balance" },
      { label: "Pretty", value: "pretty" },
    ],
    types: ["heading", "richText"],
  },
  {
    defaultValue: "start",
    key: "textAlign",
    label: "Text alignment",
    options: [
      { label: "Start", value: "start" },
      { label: "Centre", value: "center" },
      { label: "End", value: "end" },
    ],
    types: ["heading", "richText"],
  },
  {
    defaultValue: "none",
    key: "textDecoration",
    label: "Text decoration",
    options: [
      { label: "None", value: "none" },
      { label: "Underline", value: "underline" },
      { label: "Strikethrough", value: "line-through" },
    ],
    types: ["heading", "richText"],
  },
  {
    defaultValue: "grid",
    key: "gridLayout",
    label: "Card layout",
    options: [
      { label: "Regular grid", value: "grid" },
      { label: "Bento", value: "bento" },
      { label: "Masonry", value: "masonry" },
    ],
    types: ["cardGrid"],
  },
  {
    defaultValue: "3",
    key: "gridColumns",
    label: "Grid columns",
    options: [
      { label: "Two", value: "2" },
      { label: "Three", value: "3" },
      { label: "Four", value: "4" },
    ],
    types: ["cardGrid"],
  },
  {
    defaultValue: "default",
    key: "cornerShape",
    label: "Corners",
    options: [
      { label: "Theme default", value: "default" },
      { label: "Square", value: "square" },
      { label: "Rounded", value: "rounded" },
      { label: "Squircle", value: "squircle" },
    ],
    types: ["card", "image"],
  },
  {
    defaultValue: "none",
    key: "imageMask",
    label: "Image mask",
    options: [
      { label: "None", value: "none" },
      { label: "Circle", value: "circle" },
      { label: "Arch", value: "arch" },
      { label: "Diamond", value: "diamond" },
    ],
    types: ["image"],
  },
  {
    defaultValue: "none",
    key: "imageFilter",
    label: "Image filter",
    options: [
      { label: "None", value: "none" },
      { label: "Greyscale", value: "grayscale" },
      { label: "Sepia", value: "sepia" },
      { label: "High contrast", value: "high-contrast" },
    ],
    types: ["image"],
  },
  {
    defaultValue: "normal",
    key: "imageBlend",
    label: "Image blend",
    options: [
      { label: "Normal", value: "normal" },
      { label: "Multiply", value: "multiply" },
      { label: "Screen", value: "screen" },
      { label: "Luminosity", value: "luminosity" },
    ],
    types: ["image"],
  },
  {
    defaultValue: "default",
    key: "linkStyle",
    label: "Link style",
    options: [
      { label: "Theme default", value: "default" },
      { label: "Underline", value: "underline" },
      { label: "Underline on hover or focus", value: "interactive" },
    ],
    types: ["card", "buttonGroup", "contactDetails"],
  },
];
function componentDesignFields(type) {
  return COMPONENT_DESIGN_FIELDS.filter((field) => field.types.includes(type));
}

// packages/protocol/src/editor-sizing.ts
var LENGTH = /^(-?\d+(?:\.\d+)?)(px|rem|em|ch|vw|vh|%|dvh|svh)?$/;
var NUMBER2 = /^\d+(?:\.\d+)?$/;
var RATIO_SEPARATOR = /\s*\/\s*/;
var SIZE_PROPERTIES = /* @__PURE__ */ new Set([
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "flex-basis",
]);
var INSETS = /* @__PURE__ */ new Set(["top", "right", "bottom", "left"]);
var SIZE_WORDS = /* @__PURE__ */ new Set([
  "auto",
  "min-content",
  "max-content",
  "fit-content",
]);
function length(value, negative = false) {
  const match = LENGTH.exec(value);
  if (!match || (!match[2] && Number(match[1]) !== 0)) {
    return false;
  }
  const number3 = Number(match[1]);
  return (
    Number.isFinite(number3) &&
    Math.abs(number3) <= 1e5 &&
    (negative || number3 >= 0)
  );
}
function sizeValue(property2, value) {
  if (property2.startsWith("max-")) {
    return (
      value === "none" ||
      (value !== "auto" && (length(value) || SIZE_WORDS.has(value)))
    );
  }
  return length(value) || SIZE_WORDS.has(value);
}
function isEditorSizingValue(property2, value) {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    value !== value.trim()
  ) {
    return false;
  }
  if (SIZE_PROPERTIES.has(property2)) {
    return sizeValue(property2, value);
  }
  if (INSETS.has(property2)) {
    return value === "auto" || length(value, true);
  }
  if (property2 === "translate") {
    const parts = value.split(" ");
    return (
      value === "none" ||
      (parts.length >= 1 &&
        parts.length <= 2 &&
        parts.every((part) => length(part, true)))
    );
  }
  if (property2 === "flex") {
    return ["0 0 auto", "1 1 0%", "none", "auto", "initial"].includes(value);
  }
  if (property2 === "flex-grow" || property2 === "flex-shrink") {
    return NUMBER2.test(value) && Number(value) <= 100;
  }
  if (property2 === "align-self") {
    return [
      "auto",
      "stretch",
      "start",
      "end",
      "center",
      "flex-start",
      "flex-end",
      "baseline",
    ].includes(value);
  }
  if (property2 === "aspect-ratio") {
    const parts = value.split(RATIO_SEPARATOR);
    return (
      value === "auto" ||
      (parts.length <= 2 &&
        parts.every(
          (part) =>
            NUMBER2.test(part) && Number(part) > 0 && Number(part) <= 1e5
        ))
    );
  }
  return false;
}
var HERO_PARTS = {
  actions: ":scope > .xf-copy > .xf-actions",
  copy: ":scope > .xf-copy",
  eyebrow: ":scope > .xf-copy > .xf-kicker",
  heading: ":scope > .xf-copy > :is(h1,h2)",
  image: ":scope > .xf-hero-image",
  lead: ":scope > .xf-copy > .xf-lead",
};
function editorSizingSelector(type, part) {
  if (part === "root") {
    return ":scope";
  }
  return type === "hero" && Object.hasOwn(HERO_PARTS, part)
    ? HERO_PARTS[part]
    : null;
}
var EDITOR_SIZING_PARTS = ["root", ...Object.keys(HERO_PARTS)];
var EditorSizingSchema = record(
  string2(),
  record(string2(), string2())
).superRefine((parts, context) => {
  for (const [part, declarations] of Object.entries(parts)) {
    if (!EDITOR_SIZING_PARTS.includes(part)) {
      context.addIssue({
        code: "custom",
        message: "Unsupported sizing part",
        path: [part],
      });
    }
    for (const [property2, value] of Object.entries(declarations)) {
      if (!isEditorSizingValue(property2, value)) {
        context.addIssue({
          code: "custom",
          message: "Unsupported sizing declaration",
          path: [part, property2],
        });
      }
    }
  }
});

// packages/protocol/src/section-motion.ts
var SectionMotionPropsSchema = object({
  entrance: _enum(["none", "fade", "rise"]).optional(),
  motionSpeed: _enum(["fast", "normal", "slow"]).optional(),
  scrollEffect: _enum(["none", "stack"]).optional(),
});

// packages/protocol/src/service-area-map.ts
var ServiceAreaMarkerSchema = object({
  label: string2().trim().min(1).max(120),
  pageId: StableIdSchema,
  x: number2().finite().min(0).max(100),
  y: number2().finite().min(0).max(100),
}).strict();
var ServiceAreaMapPropsSchema = object({
  alt: string2().trim().max(320),
  body: string2().max(2e3).optional(),
  heading: string2().trim().min(1).max(160),
  items: array(ServiceAreaMarkerSchema).max(50),
  src: union([
    literal(""),
    string2()
      .refine(
        (value) => value === value.trim(),
        "Map asset path must not contain surrounding whitespace"
      )
      .pipe(OwnedAssetPathSchema),
  ]),
})
  .strict()
  .superRefine((props, context) => {
    if (props.src && !props.alt) {
      context.addIssue({
        code: "custom",
        message: "Map image requires alternative text",
        path: ["alt"],
      });
    }
    const pages = /* @__PURE__ */ new Set();
    props.items.forEach((item, index) => {
      if (pages.has(item.pageId)) {
        context.addIssue({
          code: "custom",
          message: "Map destinations must be unique",
          path: ["items", index, "pageId"],
        });
      }
      pages.add(item.pageId);
    });
  });

// packages/protocol/src/validation.ts
var ValidationIssueSchema = object({
  code: string2().min(1),
  message: string2().min(1),
  path: string2().startsWith("/"),
  severity: _enum(["error", "warning"]),
}).strict();
var ReleaseDigestSchema = object({
  algorithm: literal("sha256"),
  value: string2().regex(/^[a-f0-9]{64}$/),
}).strict();
function pointer(path) {
  return `/${path
    .map(String)
    .map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateRawComponentDepth(input) {
  if (!(isRecord(input) && Array.isArray(input.pages))) {
    return [];
  }
  const issues = [];
  const stack = [];
  input.pages.forEach((page, pageIndex) => {
    if (!(isRecord(page) && Array.isArray(page.components))) {
      return;
    }
    page.components.forEach((component, componentIndex) => {
      stack.push({
        depth: 0,
        path: `/pages/${pageIndex}/components/${componentIndex}`,
        value: component,
      });
    });
  });
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    if (current.depth > MAX_COMPONENT_DEPTH) {
      issues.push({
        code: "component_depth_exceeded",
        message: `Component nesting cannot exceed ${MAX_COMPONENT_DEPTH} levels`,
        path: current.path,
        severity: "error",
      });
      continue;
    }
    if (!(isRecord(current.value) && Array.isArray(current.value.children))) {
      continue;
    }
    current.value.children.forEach((child, childIndex) => {
      stack.push({
        depth: current.depth + 1,
        path: `${current.path}/children/${childIndex}`,
        value: child,
      });
    });
  }
  return sortIssues(issues);
}
function sortIssues(issues) {
  return issues.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );
}
function validateSectionMotion(component, componentPath, issues) {
  if (component.type === "section") {
    const result = SectionMotionPropsSchema.safeParse(component.props);
    if (!result.success) {
      for (const issue2 of result.error.issues) {
        issues.push({
          code: "invalid_section_motion",
          message: issue2.message,
          path: `${componentPath}/props${pointer(issue2.path)}`,
          severity: "error",
        });
      }
    }
    for (const [device, override] of Object.entries(
      component.responsive ?? {}
    )) {
      for (const key2 of ["entrance", "motionSpeed", "scrollEffect"]) {
        if (override.props?.[key2] !== void 0) {
          issues.push({
            code: "unsupported_responsive_motion",
            message:
              "Motion uses section settings; stacking automatically falls back to normal flow on small screens.",
            path: `${componentPath}/responsive/${device}/props/${key2}`,
            severity: "error",
          });
        }
      }
    }
  }
}
function validateComponentDesign(component, componentPath, issues) {
  if (component.props.editorSizing !== void 0) {
    const parsed = EditorSizingSchema.safeParse(component.props.editorSizing);
    if (
      !parsed.success ||
      Object.keys(parsed.data).some(
        (part) => !editorSizingSelector(component.type, part)
      )
    ) {
      issues.push({
        code: "invalid_editor_sizing",
        message: "Unsupported component sizing",
        path: `${componentPath}/props/editorSizing`,
        severity: "error",
      });
    }
  }
  for (const [device, override] of Object.entries(component.responsive ?? {})) {
    if (override.props?.editorSizing !== void 0) {
      issues.push({
        code: "unsupported_responsive_sizing",
        message:
          "Editor sizing applies to all devices; device overrides are not supported.",
        path: `${componentPath}/responsive/${device}/props/editorSizing`,
        severity: "error",
      });
    }
  }
  for (const field of componentDesignFields(component.type)) {
    const value = component.props[field.key];
    if (
      value !== void 0 &&
      !field.options.some((option) => option.value === value)
    ) {
      issues.push({
        code: "invalid_component_design",
        message: `Unsupported ${field.label.toLowerCase()} value`,
        path: `${componentPath}/props/${field.key}`,
        severity: "error",
      });
    }
    for (const [device, override] of Object.entries(
      component.responsive ?? {}
    )) {
      if (override.props?.[field.key] !== void 0) {
        issues.push({
          code: "unsupported_responsive_design",
          message:
            "Design settings apply to every device; layouts adapt automatically to available width.",
          path: `${componentPath}/responsive/${device}/props/${field.key}`,
          severity: "error",
        });
      }
    }
  }
}
function validateComponentReferences(
  component,
  componentPath,
  formIds,
  pageId,
  issues,
  pages,
  depth = 0
) {
  if (depth > MAX_COMPONENT_DEPTH) {
    issues.push({
      code: "component_depth_exceeded",
      message: `Component nesting cannot exceed ${MAX_COMPONENT_DEPTH} levels`,
      path: componentPath,
      severity: "error",
    });
    return;
  }
  if (component.type === "leadForm") {
    const { formId } = component.props;
    if (typeof formId !== "string") {
      issues.push({
        code: "invalid_form_reference",
        message: "Lead-form components must reference a page form",
        path: `${componentPath}/props/formId`,
        severity: "error",
      });
    } else if (!formIds.has(formId)) {
      issues.push({
        code: "missing_form_reference",
        message: `Form ${formId} is not defined on page ${pageId}`,
        path: `${componentPath}/props/formId`,
        severity: "error",
      });
    }
  }
  validateSectionMotion(component, componentPath, issues);
  validateComponentDesign(component, componentPath, issues);
  if (component.type === "serviceAreaMap") {
    const variants = [
      { path: `${componentPath}/props`, props: component.props },
      ...Object.entries(component.responsive ?? {}).map(([key2, override]) => ({
        path: `${componentPath}/responsive/${key2}/props`,
        props: { ...component.props, ...override.props },
      })),
    ];
    for (const variant of variants) {
      const parsed = ServiceAreaMapPropsSchema.safeParse(variant.props);
      if (!parsed.success) {
        for (const issue2 of parsed.error.issues) {
          issues.push({
            code: "invalid_service_area_map",
            message: issue2.message,
            path: `${variant.path}${pointer(issue2.path)}`,
            severity: "error",
          });
        }
        continue;
      }
      parsed.data.items.forEach((item, index) => {
        const target2 = pages.find((page) => page.id === item.pageId);
        if (target2?.visibility !== "public") {
          issues.push({
            code: "invalid_map_page",
            message: `Map destination ${item.pageId} must reference a public page in this site`,
            path: `${variant.path}/items/${index}/pageId`,
            severity: "error",
          });
        }
      });
    }
  }
  component.children.forEach((child, childIndex) => {
    validateComponentReferences(
      child,
      `${componentPath}/children/${childIndex}`,
      formIds,
      pageId,
      issues,
      pages,
      depth + 1
    );
  });
}
function shellTargetEntries(site) {
  const entries = [];
  site.shell.navigation.items.forEach((item, itemIndex) => {
    const itemPath = `/shell/navigation/items/${itemIndex}`;
    entries.push({
      id: item.id,
      idPath: `${itemPath}/id`,
      target: item.target,
      targetPath: `${itemPath}/target`,
    });
    item.children.forEach((child, childIndex) => {
      const childPath = `${itemPath}/children/${childIndex}`;
      entries.push({
        id: child.id,
        idPath: `${childPath}/id`,
        target: child.target,
        targetPath: `${childPath}/target`,
      });
    });
  });
  const shellActions = [
    {
      action: site.shell.header.announcement,
      path: "/shell/header/announcement/target",
    },
    {
      action: site.shell.header.primaryAction,
      path: "/shell/header/primaryAction/target",
    },
    {
      action: site.shell.mobileNavigation.primaryAction,
      path: "/shell/mobileNavigation/primaryAction/target",
    },
  ];
  for (const { action, path } of shellActions) {
    if (action) {
      entries.push({ target: action.target, targetPath: path });
    }
  }
  site.shell.footer.columns.forEach((column, columnIndex) => {
    column.links.forEach((link, linkIndex) => {
      const linkPath = `/shell/footer/columns/${columnIndex}/links/${linkIndex}`;
      entries.push({
        id: link.id,
        idPath: `${linkPath}/id`,
        target: link.target,
        targetPath: `${linkPath}/target`,
      });
    });
  });
  site.shell.footer.socialLinks.forEach((link, linkIndex) => {
    const linkPath = `/shell/footer/socialLinks/${linkIndex}`;
    entries.push({
      id: link.id,
      idPath: `${linkPath}/id`,
      target: link.target,
      targetPath: `${linkPath}/target`,
    });
  });
  return entries;
}
function validatePageHierarchy(site, pageById, issues) {
  site.pages.forEach((page, pageIndex) => {
    const parentPath = `/pages/${pageIndex}/parentPageId`;
    const parentId = page.parentPageId;
    if (page.route === "/" && parentId !== null) {
      issues.push({
        code: "home_page_has_parent",
        message: "The home page cannot have a parent",
        path: parentPath,
        severity: "error",
      });
    }
    if (parentId === null) {
      return;
    }
    if (parentId === page.id) {
      issues.push({
        code: "self_page_parent",
        message: `Page ${page.id} cannot be its own parent`,
        path: parentPath,
        severity: "error",
      });
      return;
    }
    if (!pageById.has(parentId)) {
      issues.push({
        code: "missing_page_parent",
        message: `Parent ${parentId} does not exist`,
        path: parentPath,
        severity: "error",
      });
      return;
    }
    const visited = /* @__PURE__ */ new Set([page.id]);
    let currentId = parentId;
    while (currentId !== null) {
      if (visited.has(currentId)) {
        issues.push({
          code: "cyclic_page_parent",
          message: `Page ${page.id} has a cyclic parent hierarchy`,
          path: parentPath,
          severity: "error",
        });
        break;
      }
      visited.add(currentId);
      currentId = pageById.get(currentId)?.parentPageId ?? null;
    }
  });
}
function validateShellTargets(site, pageById, issues) {
  const navigationIds = /* @__PURE__ */ new Set();
  for (const entry of shellTargetEntries(site)) {
    if (entry.id && entry.idPath) {
      if (navigationIds.has(entry.id)) {
        issues.push({
          code: "duplicate_navigation_id",
          message: `Navigation ID ${entry.id} is already in use`,
          path: entry.idPath,
          severity: "error",
        });
      } else {
        navigationIds.add(entry.id);
      }
    }
    if (entry.target.kind !== "page") {
      continue;
    }
    const page = pageById.get(entry.target.pageId);
    if (!page) {
      issues.push({
        code: "missing_navigation_page",
        message: `Navigation target ${entry.target.pageId} does not exist`,
        path: `${entry.targetPath}/pageId`,
        severity: "error",
      });
    } else if (page.visibility !== "public") {
      issues.push({
        code: "navigation_target_not_public",
        message: `Navigation target ${entry.target.pageId} is not public`,
        path: `${entry.targetPath}/pageId`,
        severity: "error",
      });
    }
  }
}
function validateRedirects(site, pageById, pageByRoute, issues) {
  const redirectBySource = /* @__PURE__ */ new Map();
  site.redirects.forEach((redirect, redirectIndex) => {
    const redirectPath = `/redirects/${redirectIndex}`;
    if (redirectBySource.has(redirect.from)) {
      issues.push({
        code: "duplicate_redirect_source",
        message: `Redirect source ${redirect.from} is already in use`,
        path: `${redirectPath}/from`,
        severity: "error",
      });
    } else {
      redirectBySource.set(redirect.from, { index: redirectIndex, redirect });
    }
    const collidingPage = pageByRoute.get(redirect.from);
    if (collidingPage) {
      issues.push({
        code: "redirect_route_collision",
        message: `Redirect source ${redirect.from} collides with page ${collidingPage.id}`,
        path: `${redirectPath}/from`,
        severity: "error",
      });
    }
    if (!pageById.has(redirect.toPageId)) {
      issues.push({
        code: "missing_redirect_page",
        message: `Redirect target ${redirect.toPageId} does not exist`,
        path: `${redirectPath}/toPageId`,
        severity: "error",
      });
    }
  });
  site.redirects.forEach((redirect, redirectIndex) => {
    let targetPage = pageById.get(redirect.toPageId);
    if (!(targetPage && redirectBySource.has(targetPage.route))) {
      return;
    }
    const visitedSources = /* @__PURE__ */ new Set([redirect.from]);
    let isLoop = false;
    while (targetPage) {
      const nextEntry = redirectBySource.get(targetPage.route);
      if (!nextEntry) {
        break;
      }
      if (visitedSources.has(targetPage.route)) {
        isLoop = true;
        break;
      }
      visitedSources.add(targetPage.route);
      targetPage = pageById.get(nextEntry.redirect.toPageId);
    }
    issues.push({
      code: "redirect_chain",
      message: isLoop
        ? `Redirect ${redirect.from} targets a redirect loop`
        : `Redirect ${redirect.from} targets page ${redirect.toPageId} whose route also redirects`,
      path: `/redirects/${redirectIndex}/toPageId`,
      severity: "error",
    });
  });
}
function validateSiteManifest(input) {
  const depthIssues = validateRawComponentDepth(input);
  if (depthIssues.length > 0) {
    return { issues: depthIssues, success: false };
  }
  const parsed = SiteManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      issues: sortIssues(
        parsed.error.issues.map((issue2) => ({
          code: `schema.${issue2.code}`,
          message: issue2.message,
          path: pointer(issue2.path),
          severity: "error",
        }))
      ),
      success: false,
    };
  }
  const issues = [];
  const presentation = parsed.data.theme.tokens[SITE_PRESENTATION_TOKEN];
  if (
    presentation !== void 0 &&
    !SITE_PRESENTATIONS.some((value) => value === presentation)
  ) {
    issues.push({
      code: "invalid_site_presentation",
      message: "Website presentation must be standard or poster",
      path: `/theme/tokens/${SITE_PRESENTATION_TOKEN}`,
      severity: "error",
    });
  }
  if (
    parsed.data.schemaVersion === 2 &&
    parsed.data.contentBinding &&
    parsed.data.contentBinding.scope.siteId !== parsed.data.id
  ) {
    issues.push({
      code: "content_scope_mismatch",
      message: "Content reference belongs to a different site",
      path: "/contentBinding/scope/siteId",
      severity: "error",
    });
  }
  const routes = /* @__PURE__ */ new Map();
  if (
    parsed.data.schemaVersion === 2 &&
    parsed.data.builderLibrary &&
    parsed.data.builderLibrary.scope.siteId !== parsed.data.id
  ) {
    issues.push({
      code: "builder_scope_mismatch",
      message: "Component library belongs to a different site",
      path: "/builderLibrary/scope/siteId",
      severity: "error",
    });
  }
  const formOwners = /* @__PURE__ */ new Map();
  const conversionEvents = new Set(
    parsed.data.integrations?.analytics?.conversionEvents.map(
      (event) => event.id
    ) ?? []
  );
  for (const [index, page] of parsed.data.pages.entries()) {
    const previousPageId = routes.get(page.route);
    if (previousPageId) {
      issues.push({
        code: "duplicate_route",
        message: `Route ${page.route} is already used by page ${previousPageId}`,
        path: `/pages/${index}/route`,
        severity: "error",
      });
    } else {
      routes.set(page.route, page.id);
    }
    const formIds = new Set(page.forms.map((form) => form.id));
    page.forms.forEach((form, formIndex) => {
      const formPath = `/pages/${index}/forms/${formIndex}`;
      const owner = formOwners.get(form.id);
      if (owner) {
        issues.push({
          code: "duplicate_form_id",
          message: `Form ${form.id} is already defined on page ${owner}`,
          path: `${formPath}/id`,
          severity: "error",
        });
      } else {
        formOwners.set(form.id, page.id);
      }
      if (
        form.conversionEventId &&
        !conversionEvents.has(form.conversionEventId)
      ) {
        issues.push({
          code: "missing_conversion_event",
          message: `Conversion event ${form.conversionEventId} is not defined by this site`,
          path: `${formPath}/conversionEventId`,
          severity: "error",
        });
      }
      const fieldIds = /* @__PURE__ */ new Set();
      form.fields.forEach((field, fieldIndex) => {
        if (fieldIds.has(field.id)) {
          issues.push({
            code: "duplicate_form_field",
            message: `Field ${field.id} is duplicated in form ${form.id}`,
            path: `${formPath}/fields/${fieldIndex}/id`,
            severity: "error",
          });
        }
        fieldIds.add(field.id);
      });
    });
    page.components.forEach((component, componentIndex) => {
      validateComponentReferences(
        component,
        `/pages/${index}/components/${componentIndex}`,
        formIds,
        page.id,
        issues,
        parsed.data.pages
      );
    });
  }
  if (parsed.data.schemaVersion === 2) {
    const pageById = new Map(parsed.data.pages.map((page) => [page.id, page]));
    const pageByRoute = new Map(
      parsed.data.pages.map((page) => [page.route, page])
    );
    validatePageHierarchy(parsed.data, pageById, issues);
    validateShellTargets(parsed.data, pageById, issues);
    validateRedirects(parsed.data, pageById, pageByRoute, issues);
  }
  return issues.length
    ? { issues: sortIssues(issues), success: false }
    : { data: parsed.data, issues: [], success: true };
}

// packages/protocol/src/builder-release-seal.ts
var BUILDER_RECOVERY_MAX_BYTES = 8e6;
var encoder3 = new TextEncoder();
var bounded = (max) =>
  string2()
    .max(max)
    .refine((value) => encoder3.encode(value).byteLength <= max);
var BuilderRecoveryBundleSchema = object({
  application: object({
    digest: ReleaseSha256Schema,
    id: ReleaseScopedIdSchema,
  }).strict(),
  artifacts: array(
    object({ bytes: bounded(262144), pin: BuilderArtifactPinSchema }).strict()
  ).max(128),
  checkpoint: object({
    bytes: bounded(1e6),
    id: ReleaseScopedIdSchema,
    sha256: ReleaseSha256Schema,
  }).strict(),
  contentScope: ContentScopeSchema,
  formatVersion: literal(1),
  freezeDigest: ReleaseSha256Schema,
  generation: uuid2(),
  runtimeDigest: ReleaseSha256Schema,
  schemas: array(
    object({ bytes: bounded(512e3), pin: CmsObjectPinSchema }).strict()
  ).max(128),
  target: CmsStorageTargetSchema,
})
  .strict()
  .refine(
    (value) =>
      encoder3.encode(canonicalJson(value)).byteLength <=
      BUILDER_RECOVERY_MAX_BYTES,
    "Recovery bundle exceeds byte limit"
  );
var equal = (a, b) => canonicalJson(a) === canonicalJson(b);
var pinKey2 = (pin2) => `${pin2.kind}:${pin2.id}`;
async function verifyBuilderRecoveryBundle(raw) {
  const bundle = BuilderRecoveryBundleSchema.parse(raw);
  const validated = validateSiteManifest(JSON.parse(bundle.checkpoint.bytes));
  if (!validated.success || validated.data.schemaVersion !== 2) {
    throw new Error("Invalid recovery checkpoint semantics");
  }
  const checkpoint2 = SiteManifestV2Schema.parse(validated.data);
  if (
    canonicalJson(checkpoint2) !== bundle.checkpoint.bytes ||
    (await sha256Hex(bundle.checkpoint.bytes)) !== bundle.checkpoint.sha256 ||
    checkpoint2.id !== bundle.contentScope.siteId
  ) {
    throw new Error("Recovery checkpoint mismatch");
  }
  for (const section of [
    checkpoint2.builderApplication,
    checkpoint2.builderLibrary,
  ]) {
    if (section && !equal(section.scope, bundle.contentScope)) {
      throw new Error("Recovery authoring scope mismatch");
    }
  }
  if (!checkpoint2.builderApplication) {
    throw new Error("Recovery requires accepted application selections");
  }
  const selections = [
    ...checkpoint2.builderApplication.actions,
    ...checkpoint2.builderApplication.collections,
    ...(checkpoint2.builderLibrary?.components ?? []),
  ];
  if (selections.length !== bundle.artifacts.length) {
    throw new Error("Recovery artifact inventory mismatch");
  }
  const selected = new Map(selections.map((pin2) => [pinKey2(pin2), pin2]));
  if (selected.size !== selections.length) {
    throw new Error("Duplicate recovery selection");
  }
  const artifacts = await verifyArtifacts(bundle, selected);
  await verifySchemas(
    bundle,
    artifacts,
    checkpoint2.builderApplication.collections.length
  );
  const forms = await verifyForms(checkpoint2, artifacts);
  const instances = await verifyInstances(checkpoint2, artifacts, selected);
  return {
    bundle,
    checkpoint: checkpoint2,
    digest: await sha256Hex(canonicalJson(bundle)),
    forms,
    instances,
  };
}
async function verifyArtifacts(bundle, selected) {
  const artifacts = /* @__PURE__ */ new Map();
  for (const entry of bundle.artifacts) {
    const artifact = parseBuilderArtifact(entry.bytes);
    const described = await describeBuilderArtifact(artifact);
    const { id, kind, version: version4, sha256 } = described.change;
    if (
      entry.bytes !== described.body ||
      !equal(entry.pin, { id, kind, sha256, version: version4 }) ||
      !equal(selected.get(pinKey2(entry.pin)), entry.pin) ||
      artifacts.has(pinKey2(entry.pin))
    ) {
      throw new Error("Recovery artifact mismatch");
    }
    const artifactScope =
      artifact.kind === "collection"
        ? artifact.definition.scope
        : artifact.scope;
    if (
      contentScopeKey(artifactScope) !== contentScopeKey(bundle.contentScope)
    ) {
      throw new Error("Recovery artifact scope mismatch");
    }
    artifacts.set(pinKey2(entry.pin), artifact);
  }
  for (const artifact of artifacts.values()) {
    for (const dependency of builderArtifactDependencies(artifact)) {
      if (!equal(selected.get(pinKey2(dependency)), dependency)) {
        throw new Error("Recovery dependency absent or conflicting");
      }
    }
  }
  return artifacts;
}
async function verifySchemas(bundle, artifacts, expectedCount) {
  const definitions = /* @__PURE__ */ new Map();
  for (const entry of bundle.schemas) {
    const definition = CollectionDefinitionSchema.parse(
      JSON.parse(entry.bytes)
    );
    const { pin: pin2 } = entry;
    const artifact = artifacts.get(`collection:${definition.id}`);
    if (
      canonicalJson(definition) !== entry.bytes ||
      (await sha256Hex(entry.bytes)) !== pin2.sha256 ||
      encoder3.encode(entry.bytes).byteLength !== pin2.bytes ||
      pin2.kind !== "schema" ||
      pin2.recordId !== "" ||
      pin2.collectionId !== definition.id ||
      pin2.version !== definition.version ||
      pin2.freezeDigest !== bundle.freezeDigest ||
      contentScopeKey(definition.scope) !==
        contentScopeKey(bundle.contentScope) ||
      artifact?.kind !== "collection" ||
      !equal(artifact.definition, definition) ||
      definitions.has(definition.id)
    ) {
      throw new Error("Recovery schema mismatch");
    }
    definitions.set(definition.id, definition);
  }
  if (definitions.size !== expectedCount) {
    throw new Error("Recovery schema inventory mismatch");
  }
}
async function verifyForms(checkpoint2, artifacts) {
  const forms = [];
  for (const page of checkpoint2.pages) {
    for (const form of page.forms) {
      if (form.submission?.mode !== "action") {
        continue;
      }
      const action = artifacts.get(pinKey2(form.submission.action));
      if (action?.kind !== "action") {
        throw new Error("Recovery form action absent");
      }
      await validateBuilderFormActionBinding(form, action);
      const createOnly =
        action.formatVersion === 2 &&
        action.collections.length === 0 &&
        action.effects.permissions.every((permission) =>
          permission.operations.every((operation) => operation === "create")
        );
      forms.push({
        action: form.submission.action,
        bindingDigest: await sha256Hex(canonicalJson(form.submission)),
        formDigest: await sha256Hex(canonicalJson(form)),
        formId: form.id,
        pageId: page.id,
        publicCreateEligible: createOnly,
      });
    }
  }
  return forms;
}
async function verifyInstances(checkpoint2, artifacts, selected) {
  const instances = [];
  for (const page of checkpoint2.pages) {
    const pending = page.components.map((node) => ({
      node,
      withinInstance: false,
    }));
    const ids = /* @__PURE__ */ new Set();
    while (pending.length) {
      const entry = pending.pop();
      if (!entry) {
        break;
      }
      const { node, withinInstance } = entry;
      if (ids.has(node.id)) {
        throw new Error("Recovery component identity duplicated");
      }
      ids.add(node.id);
      const descriptor = node.builderInstance;
      if (descriptor) {
        const artifact = artifacts.get(pinKey2(descriptor.pin));
        if (
          withinInstance ||
          artifact?.kind !== "component" ||
          !equal(selected.get(pinKey2(descriptor.pin)), descriptor.pin)
        ) {
          throw new Error("Recovery instance pin mismatch");
        }
        await instantiateBuilderComponent(artifact, descriptor.values, node.id);
        instances.push({
          pageId: page.id,
          pin: descriptor.pin,
          rootId: node.id,
        });
      }
      pending.push(
        ...node.children.map((child) => ({
          node: child,
          withinInstance: withinInstance || Boolean(descriptor),
        }))
      );
    }
  }
  return instances;
}

// packages/protocol/src/builder-graph-verifier.ts
async function createAstroCompilerBuildIdentity(input, admittedToolchain) {
  return await createAstroBuildIdentity(input, admittedToolchain);
}
async function verifyAstroCompilerBuildIdentity(candidate, admittedToolchain) {
  const pin2 = object({
    buildId: ReleaseScopedIdSchema,
    identity: AstroBuildIdentitySchema,
    identityDigest: ReleaseSha256Schema,
  })
    .strict()
    .parse(candidate);
  const expected = await createAstroBuildIdentity(
    {
      environment: pin2.identity.environment,
      featureRecoveryDigest: pin2.identity.featureRecoveryDigest,
      renderInputDigest: pin2.identity.renderInputDigest,
      scope: pin2.identity.scope,
      source: pin2.identity.source,
    },
    admittedToolchain
  );
  if (canonicalJson(pin2) !== canonicalJson(expected)) {
    throw new Error("Astro build identity mismatch");
  }
  return expected;
}
async function selectNativeAstroCompilerGeneration(
  registry2,
  environment,
  toolchainDigest
) {
  const generation = await selectAstroReleaseGeneration(
    registry2,
    environment,
    toolchainDigest,
    "build"
  );
  return {
    environment: generation.environment,
    policyDigest: generation.policyDigest,
    toolchain: generation.toolchain,
    toolchainDigest: generation.toolchainDigest,
  };
}
async function verifyAstroCompilerReleaseReceipt(candidate, retained) {
  const result = AstroReleaseBuildResultSchema.parse(candidate);
  const authority = object({
    context: AstroBuildIdentityPinSchema,
    policyDigest: ReleaseSha256Schema,
    toolchain: AstroCompilerToolchainSchema,
  })
    .strict()
    .parse(retained);
  const context = await verifyAstroCompilerBuildIdentity(
    authority.context,
    authority.toolchain
  );
  if (
    canonicalJson(result.astro.context) !== canonicalJson(context) ||
    result.astro.policyDigest !== authority.policyDigest ||
    result.validationKey !== `${result.artifactPrefix}/validation-report.json`
  ) {
    throw new Error("Astro release receipt authority mismatch");
  }
  await verifyAstroReleasePointer({
    artifactPrefix: result.artifactPrefix,
    astro: result.astro,
    buildId: result.buildId,
    manifestDigest: result.manifestDigest,
    manifestKey: result.manifestKey,
    scope: context.identity.scope,
    versionDigest: result.versionDigest,
  });
  return result;
}
var BuilderGraphVerificationError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "BuilderGraphVerificationError";
    this.code = code;
  }
};
var byteLength = (raw) => new TextEncoder().encode(raw).byteLength;
var key = (pin2) => `${pin2.kind}:${pin2.id}:${pin2.version}:${pin2.sha256}`;
var identity4 = (pin2) => `${pin2.kind}:${pin2.id}`;
var equal2 = (a, b) => canonicalJson(a) === canonicalJson(b);
var digest = (body) => sha256Hex(canonicalJson(body));
function fail(code, message) {
  throw new BuilderGraphVerificationError(code, message);
}
function requireEqual(a, b, code) {
  if (!equal2(a, b)) {
    fail(code, "Graph identity mismatch");
  }
}
function sorted(pins) {
  return [...pins].sort((a, b) => {
    if (key(a) === key(b)) {
      return 0;
    }
    return key(a) < key(b) ? -1 : 1;
  });
}
function samePins(a, b) {
  return equal2(sorted(a), sorted(b));
}
function pinOf(artifact) {
  const { id, kind, version: version4, sha256 } = artifact.change;
  return { id, kind, sha256, version: version4 };
}
function scopeOf(artifact) {
  return artifact.kind === "collection"
    ? artifact.definition.scope
    : artifact.scope;
}
async function guarded(run) {
  try {
    return await run();
  } catch (error2) {
    if (error2 instanceof BuilderGraphVerificationError) {
      throw error2;
    }
    fail("GRAPH_INVALID", "Invalid graph contract");
  }
}
var checkpointPin = object({
  digest: ReleaseSha256Schema,
  id: ReleaseScopedIdSchema,
}).strict();
var applicationManifest = object({
  actions: array(
    BuilderArtifactPinSchema.extend({ kind: literal("action") })
  ).max(128),
  applicationId: uuid2(),
  checkpoint: checkpointPin,
  components: array(
    BuilderArtifactPinSchema.extend({ kind: literal("component") })
  ).max(128),
  formatVersion: literal(1),
  generation: uuid2(),
  previousApplicationId: uuid2().nullable(),
  schemas: array(
    object({ collectionId: string2(), objectId: uuid2() }).strict()
  ).max(128),
  scope: ContentScopeSchema,
}).strict();
var checkpoint = object({
  digest: ReleaseSha256Schema,
  id: ReleaseScopedIdSchema,
  manifest: unknown(),
}).strict();
var baseSchema = object({
  application: object({
    digest: ReleaseSha256Schema,
    manifest: applicationManifest,
  }).strict(),
  checkpoint,
  content: object({
    pin: CmsObjectPinSchema.nullable(),
    revision: number2().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).strict(),
  freezeDigest: ReleaseSha256Schema,
  generation: uuid2(),
  schemas: array(
    object({
      bodyBytes: string2().max(128e3),
      objectId: uuid2(),
      pin: CmsObjectPinSchema,
    }).strict()
  ).max(128),
  scope: ContentScopeSchema,
  target: CmsStorageTargetSchema,
}).strict();
var checkpointRequest = object({
  contentRevision: number2().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expectedApplication: object({
    digest: ReleaseSha256Schema,
    id: uuid2(),
  }).strict(),
  expectedCheckpoint: checkpointPin,
  expectedContent: CmsObjectPinSchema.nullable(),
  freezeDigest: ReleaseSha256Schema,
  generation: uuid2(),
  nextCheckpoint: checkpointPin,
  operationId: ReleaseScopedIdSchema,
  scope: ContentScopeSchema,
  target: CmsStorageTargetSchema,
  version: literal(1),
}).strict();
var preparationRef = object({
  operationId: ReleaseScopedIdSchema,
  receiptDigest: ReleaseSha256Schema,
  requestDigest: ReleaseSha256Schema,
}).strict();
var transitionRequest = checkpointRequest
  .extend({
    candidateDigest: ReleaseSha256Schema,
    candidateId: ReleaseScopedIdSchema,
    preparations: array(preparationRef).max(32),
  })
  .strict();
async function loadArtifacts(raws, scope) {
  if (!Array.isArray(raws) || raws.length > 288) {
    fail("GRAPH_BUDGET", "Artifact count exceeded");
  }
  const result = /* @__PURE__ */ new Map();
  let total = 0;
  const identities = /* @__PURE__ */ new Map();
  for (const raw of raws) {
    if (typeof raw !== "string") {
      fail("GRAPH_INVALID", "Artifact must contain bytes");
    }
    total += byteLength(raw);
    if (total > 2e6) {
      fail("GRAPH_BUDGET", "Feature proposal artifact budget exceeded");
    }
    const described = await describeBuilderArtifact(parseBuilderArtifact(raw));
    const pin2 = pinOf(described);
    if (described.body !== raw || (await sha256Hex(raw)) !== pin2.sha256) {
      fail("GRAPH_ARTIFACT", "Noncanonical artifact bytes");
    }
    if (
      contentScopeKey(scopeOf(described.artifact)) !== contentScopeKey(scope)
    ) {
      fail("GRAPH_SCOPE", "Feature artifact scope denied");
    }
    const versionKey = `${identity4(pin2)}:${pin2.version}`;
    if (
      result.has(key(pin2)) ||
      (identities.has(versionKey) && identities.get(versionKey) !== pin2.sha256)
    ) {
      fail("GRAPH_ARTIFACT", "Duplicate or conflicting artifact bytes");
    }
    identities.set(versionKey, pin2.sha256);
    result.set(key(pin2), {
      artifact: described.artifact,
      body: raw,
      pin: pin2,
    });
  }
  return result;
}
function verifyBindings(artifact, artifacts) {
  if (artifact.kind === "collection") {
    return;
  }
  const bindings =
    artifact.kind === "action"
      ? [
          ...artifact.collections,
          ...(artifact.formatVersion === 2 ? artifact.effects.permissions : []),
        ]
      : artifact.dataBindings;
  for (const binding of bindings) {
    const collection = artifacts.get(key(binding.collection))?.artifact;
    if (collection?.kind !== "collection") {
      fail("GRAPH_BINDING", "Collection binding requires a collection");
    }
    for (const id of binding.fields) {
      const field = collection.definition.fields.find((x) => x.id === id);
      if (
        !field ||
        (artifact.kind === "component" && field.visibility !== "public")
      ) {
        fail("GRAPH_BINDING", "Collection binding field denied");
      }
    }
  }
}
function graphClosure(pins, artifacts) {
  const visiting = /* @__PURE__ */ new Set(),
    visited = /* @__PURE__ */ new Set();
  const visit = (pin2) => {
    const k = key(pin2);
    if (visiting.has(k)) {
      fail("GRAPH_DEPENDENCY", "Feature artifact dependency cycle");
    }
    if (visited.has(k)) {
      return;
    }
    const entry = artifacts.get(k);
    if (!entry) {
      fail("GRAPH_DEPENDENCY", "Feature artifact dependency missing");
    }
    visiting.add(k);
    for (const dep of builderArtifactDependencies(entry.artifact)) {
      visit(dep);
    }
    visiting.delete(k);
    visited.add(k);
    verifyBindings(entry.artifact, artifacts);
  };
  for (const pin2 of pins) {
    visit(pin2);
  }
  return visited;
}
async function verifyProposal(proposal, artifacts) {
  const pins = [...proposal.changes, ...proposal.existing];
  const needed = graphClosure(pins, artifacts);
  for (const change of proposal.changes) {
    const entry = artifacts.get(key(change));
    if (!entry) {
      fail("GRAPH_DEPENDENCY", "Feature artifact dependency missing");
    }
    const described = await describeBuilderArtifact(entry.artifact);
    if (
      change.bytes !== described.change.bytes ||
      !samePins(change.dependencies, described.change.dependencies)
    ) {
      fail("GRAPH_ARTIFACT", "Feature proposal descriptor mismatch");
    }
  }
  return { digest: await digestBuilderFeatureProposal(proposal), needed };
}
async function verifyBuilderArtifactSet(input) {
  return await guarded(async () => {
    const scope = ContentScopeSchema.parse(input.scope);
    const proposal = BuilderFeatureProposalSchema.parse(
      parseBuilderJson(input.proposalBytes)
    );
    requireEqual(proposal.scope, scope, "GRAPH_SCOPE");
    const artifacts = await loadArtifacts(input.artifactBytes, scope);
    const checked = await verifyProposal(proposal, artifacts);
    if (checked.needed.size !== artifacts.size) {
      fail("GRAPH_ARTIFACT", "Unexpected artifact bytes");
    }
    return {
      digest: checked.digest,
      pins: sorted([...artifacts.values()].map((x) => x.pin)),
    };
  });
}
async function checkedCheckpoint(input, scope) {
  const raw = canonicalJson(input.manifest);
  if (byteLength(raw) > 8 * 1024 * 1024) {
    fail("GRAPH_BUDGET", "Checkpoint byte limit exceeded");
  }
  if ((await sha256Hex(raw)) !== input.digest) {
    fail("GRAPH_CHECKPOINT", "Checkpoint digest mismatch");
  }
  const validated = validateSiteManifest(input.manifest);
  if (!validated.success) {
    fail("GRAPH_CHECKPOINT", "Invalid checkpoint manifest");
  }
  const manifest = validated.data;
  if (manifest.id !== scope.siteId) {
    fail("GRAPH_SCOPE", "Checkpoint site mismatch");
  }
  if (manifest.schemaVersion === 2) {
    if (manifest.builderLibrary) {
      requireEqual(manifest.builderLibrary.scope, scope, "GRAPH_SCOPE");
    }
    if (manifest.builderApplication) {
      requireEqual(manifest.builderApplication.scope, scope, "GRAPH_SCOPE");
    }
    if (manifest.contentBinding) {
      requireEqual(manifest.contentBinding.scope, scope, "GRAPH_SCOPE");
    }
  }
  return manifest;
}
function uniqueSelections(pins) {
  if (pins.length > 128 || new Set(pins.map(identity4)).size !== pins.length) {
    fail("GRAPH_SELECTION", "Duplicate or excessive graph selections");
  }
}
function requireArtifact(artifacts, pin2) {
  const value = artifacts.get(key(pin2));
  if (!value) {
    fail("GRAPH_DEPENDENCY", "Feature artifact dependency missing");
  }
  return value.artifact;
}
function exactGraph(pins, artifacts) {
  uniqueSelections(pins);
  const selected = new Map(pins.map((p) => [identity4(p), p]));
  const visited = graphClosure(pins, artifacts);
  for (const pin2 of pins) {
    for (const dep of builderArtifactDependencies(
      requireArtifact(artifacts, pin2)
    )) {
      if (key(selected.get(identity4(dep)) ?? pin2) !== key(dep)) {
        fail(
          "GRAPH_SELECTION",
          "Dependency must match selected artifact exactly"
        );
      }
    }
  }
  return visited;
}
async function checkForms(manifest, actions, artifacts) {
  for (const page of manifest.pages) {
    for (const form of page.forms) {
      const binding = form.submission;
      if (!binding) {
        continue;
      }
      if (!actions.some((pin2) => key(pin2) === key(binding.action))) {
        fail("GRAPH_BINDING", "Form action is not selected");
      }
      try {
        await validateBuilderFormActionBinding(
          form,
          requireArtifact(artifacts, binding.action)
        );
      } catch {
        fail("GRAPH_BINDING", "Invalid form action mapping");
      }
    }
  }
}
async function checkInstances(manifest, components, artifacts) {
  const visit = async (node, inInstance) => {
    const reference = node.builderInstance;
    if (reference) {
      if (
        inInstance ||
        !components.some((pin2) => key(pin2) === key(reference.pin))
      ) {
        fail(
          "GRAPH_BINDING",
          "Saved component instance is not selected or is nested"
        );
      }
      const artifact = requireArtifact(artifacts, reference.pin);
      if (artifact.kind !== "component") {
        fail("GRAPH_BINDING", "Component instance artifact required");
      }
      try {
        await instantiateBuilderComponent(artifact, reference.values, node.id);
      } catch {
        fail("GRAPH_BINDING", "Invalid saved component properties");
      }
    }
    for (const child of node.children) {
      await visit(child, inInstance || !!reference);
    }
  };
  for (const page of manifest.pages) {
    for (const root of page.components) {
      await visit(root, false);
    }
  }
}
async function checkPageGraph(manifest, pins, artifacts, allowLegacy) {
  const components = pins.filter((p) => p.kind === "component"),
    collections = pins.filter((p) => p.kind === "collection"),
    actions = pins.filter((p) => p.kind === "action");
  const library =
    manifest.schemaVersion === 2 ? manifest.builderLibrary : void 0;
  const application =
    manifest.schemaVersion === 2 ? manifest.builderApplication : void 0;
  if (!samePins(library?.components ?? [], components)) {
    fail("GRAPH_SELECTION", "Checkpoint component selection mismatch");
  }
  if (application) {
    if (
      !(
        samePins(application.collections, collections) &&
        samePins(application.actions, actions)
      )
    ) {
      fail("GRAPH_SELECTION", "Checkpoint application selection mismatch");
    }
  } else if (!allowLegacy || actions.length > 0) {
    fail("GRAPH_SELECTION", "Checkpoint application selection required");
  }
  await checkForms(manifest, actions, artifacts);
  await checkInstances(manifest, components, artifacts);
}
async function loadBase(request, input, artifacts) {
  const base = baseSchema.parse(input),
    app = base.application.manifest;
  requireEqual(
    {
      freezeDigest: request.freezeDigest,
      generation: request.generation,
      scope: request.scope,
      target: request.target,
    },
    {
      freezeDigest: base.freezeDigest,
      generation: base.generation,
      scope: base.scope,
      target: base.target,
    },
    "GRAPH_BASE"
  );
  requireEqual(
    request.expectedApplication,
    { digest: base.application.digest, id: app.applicationId },
    "GRAPH_BASE"
  );
  requireEqual(
    request.expectedCheckpoint,
    { digest: base.checkpoint.digest, id: base.checkpoint.id },
    "GRAPH_BASE"
  );
  requireEqual(
    { pin: request.expectedContent, revision: request.contentRevision },
    base.content,
    "GRAPH_BASE"
  );
  requireEqual(app.scope, base.scope, "GRAPH_BASE");
  requireEqual(app.generation, base.generation, "GRAPH_BASE");
  requireEqual(app.checkpoint, request.expectedCheckpoint, "GRAPH_BASE");
  if ((await digest(app)) !== base.application.digest) {
    fail("GRAPH_BASE", "Application manifest digest mismatch");
  }
  if (
    (base.content.pin?.kind ?? "content") !== "content" ||
    (base.content.pin?.version ?? 0) !== base.content.revision ||
    (base.content.pin && base.content.pin.freezeDigest !== base.freezeDigest)
  ) {
    fail("GRAPH_BASE", "Content base mismatch");
  }
  const schemas = [];
  let artifactBytes = [...artifacts.values()].reduce(
    (sum, entry) => sum + byteLength(entry.body),
    0
  );
  if (
    base.schemas.length !== app.schemas.length ||
    new Set(app.schemas.map((x) => x.collectionId)).size !==
      app.schemas.length ||
    new Set(base.schemas.map((x) => x.objectId)).size !== base.schemas.length
  ) {
    fail("GRAPH_BASE", "Invalid accepted schema map");
  }
  for (const entry of base.schemas) {
    const definition = CollectionDefinitionSchema.parse(
      parseBuilderJson(entry.bodyBytes)
    );
    const { pin: pin2 } = entry;
    if (
      pin2.kind !== "schema" ||
      pin2.collectionId !== definition.id ||
      pin2.version !== definition.version ||
      pin2.freezeDigest !== base.freezeDigest ||
      !app.schemas.some(
        (x) => x.collectionId === definition.id && x.objectId === entry.objectId
      )
    ) {
      fail("GRAPH_BASE", "Accepted schema identity mismatch");
    }
    requireEqual(definition.scope, base.scope, "GRAPH_SCOPE");
    if (
      canonicalJson(definition) !== entry.bodyBytes ||
      byteLength(entry.bodyBytes) !== pin2.bytes ||
      (await sha256Hex(entry.bodyBytes)) !== pin2.sha256
    ) {
      fail("GRAPH_BASE", "Accepted schema bytes mismatch");
    }
    const described = await describeBuilderArtifact({
      definition,
      kind: "collection",
    });
    const artifact = pinOf(described);
    if (!artifacts.has(key(artifact))) {
      artifactBytes += byteLength(described.body);
      if (artifactBytes > 2e6) {
        fail("GRAPH_BUDGET", "Feature proposal artifact budget exceeded");
      }
      artifacts.set(key(artifact), {
        artifact: described.artifact,
        body: described.body,
        pin: artifact,
      });
    }
    schemas.push({ artifact, objectId: entry.objectId, storage: pin2 });
  }
  const pins = [
    ...schemas.map((x) => x.artifact),
    ...app.components,
    ...app.actions,
  ];
  const needed = exactGraph(pins, artifacts);
  const manifest = await checkedCheckpoint(base.checkpoint, base.scope);
  await checkPageGraph(manifest, pins, artifacts, true);
  return { base, needed, pins, schemas };
}
async function finalProof(
  request,
  pins,
  schemas,
  candidateDigest,
  proposalDigest
) {
  const body = {
    actions: sorted(pins.filter((p) => p.kind === "action")),
    candidateDigest,
    components: sorted(pins.filter((p) => p.kind === "component")),
    expectedApplication: request.expectedApplication,
    expectedCheckpoint: request.expectedCheckpoint,
    expectedContent: request.expectedContent,
    nextCheckpoint: request.nextCheckpoint,
    proposalDigest,
    requestDigest: await digest(request),
    schemas: [...schemas].sort((a, b) =>
      a.artifact.id < b.artifact.id ? -1 : 1
    ),
    version: 1,
  };
  return { ...body, proofDigest: await digest(body) };
}
async function verifyBuilderApplicationCheckpoint(input) {
  return await guarded(async () => {
    const request = checkpointRequest.parse(input.request);
    const artifacts = await loadArtifacts(input.artifactBytes, request.scope);
    const base = await loadBase(request, input.base, artifacts);
    const next = checkpoint.parse(input.nextCheckpoint);
    requireEqual(
      request.nextCheckpoint,
      { digest: next.digest, id: next.id },
      "GRAPH_CHECKPOINT"
    );
    if (next.id === request.expectedCheckpoint.id) {
      fail("GRAPH_CHECKPOINT", "New checkpoint identity required");
    }
    const manifest = await checkedCheckpoint(next, request.scope);
    const previous = SiteManifestSchema.parse(base.base.checkpoint.manifest);
    await checkPageGraph(
      manifest,
      base.pins,
      artifacts,
      previous.schemaVersion === 1 || !previous.builderApplication
    );
    if (artifacts.size !== base.needed.size) {
      fail("GRAPH_ARTIFACT", "Unexpected artifact bytes");
    }
    return await finalProof(request, base.pins, base.schemas, null, null);
  });
}
async function checkPreparation(entry, request, candidate) {
  if (
    byteLength(entry.requestBytes) > 15e5 ||
    byteLength(entry.receiptBytes) > 1e5
  ) {
    fail("GRAPH_BUDGET", "Preparation byte limit exceeded");
  }
  const prep = CmsPreparationSchema.parse(JSON.parse(entry.requestBytes));
  const receipt = CmsPreparationReceiptSchema.parse(
    JSON.parse(entry.receiptBytes)
  );
  const reference = request.preparations.find(
    (x) => x.operationId === prep.operationId
  );
  const { digest: receiptDigest, ...receiptBody } = receipt;
  if (
    !reference ||
    prep.action !== null ||
    prep.candidateDigest !== candidate.digest ||
    prep.freezeDigest !== request.freezeDigest ||
    !equal2(prep.scope, request.scope) ||
    canonicalJson(prep) !== entry.requestBytes ||
    canonicalJson(receipt) !== entry.receiptBytes ||
    (await digest(prep)) !== reference.requestDigest ||
    receipt.requestDigest !== reference.requestDigest ||
    receiptDigest !== reference.receiptDigest ||
    (await digest(receiptBody)) !== receiptDigest ||
    receipt.operationId !== prep.operationId ||
    receipt.freezeDigest !== request.freezeDigest ||
    !equal2(receipt.scope, request.scope) ||
    receipt.items.length !== prep.items.length
  ) {
    fail("GRAPH_PREPARATION", "Preparation identity mismatch");
  }
  return { prep, receipt };
}
async function checkPreparedItem(
  item,
  operationId,
  request,
  base,
  candidate,
  artifacts
) {
  const change = candidate.proposal.changes.find(
    (x) => x.kind === "collection" && x.id === item.body.id
  );
  if (!change) {
    fail("GRAPH_PREPARATION", "Unexpected prepared schema");
  }
  const artifact = artifacts.get(key(change))?.artifact;
  if (
    artifact?.kind !== "collection" ||
    !equal2(item.body, artifact.definition)
  ) {
    fail("GRAPH_PREPARATION", "Prepared schema differs from artifact");
  }
  const old = base.schemas.find((x) => x.artifact.id === item.body.id);
  requireEqual(item.expectedBase, old?.storage ?? null, "GRAPH_PREPARATION");
  if (old) {
    const before = requireArtifact(artifacts, old.artifact);
    if (before.kind !== "collection") {
      fail("GRAPH_BASE", "Missing accepted definition");
    }
    if (
      classifyCollectionChange(before.definition, item.body) !== "compatible"
    ) {
      fail(
        "GRAPH_SCHEMA_CHANGE",
        "Schema migration or visibility review required"
      );
    }
  }
  const storage = {
    ...cmsItemIdentity(item),
    bytes: byteLength(canonicalJson(item.body)),
    freezeDigest: request.freezeDigest,
    operationId,
    origin: "prepared",
    sha256: await digest(item.body),
  };
  return {
    artifact: pinOf(await describeBuilderArtifact(artifact)),
    objectId: null,
    storage,
  };
}
async function preparedSchemas(input, request, base, candidate, artifacts) {
  const entries = array(
    object({
      receiptBytes: string2().max(1e5),
      requestBytes: string2().max(15e5),
    }).strict()
  )
    .max(32)
    .parse(input);
  if (
    entries.length !== request.preparations.length ||
    new Set(request.preparations.map((x) => x.operationId)).size !==
      entries.length
  ) {
    fail("GRAPH_PREPARATION", "Preparation set mismatch");
  }
  const result = [...base.schemas],
    seen = /* @__PURE__ */ new Set(),
    operations2 = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    const { prep, receipt } = await checkPreparation(entry, request, candidate);
    if (operations2.has(prep.operationId)) {
      fail("GRAPH_PREPARATION", "Duplicate preparation");
    }
    operations2.add(prep.operationId);
    const expectedPins = [];
    for (const item of prep.items) {
      if (item.kind !== "schema" || seen.has(item.body.id)) {
        fail(
          "GRAPH_PREPARATION",
          "Only unique candidate schemas may be prepared"
        );
      }
      seen.add(item.body.id);
      const selected = await checkPreparedItem(
        item,
        prep.operationId,
        request,
        base,
        candidate,
        artifacts
      );
      expectedPins.push(selected.storage);
      const index = result.findIndex((x) => x.artifact.id === item.body.id);
      if (index < 0) {
        result.push(selected);
      } else {
        result[index] = selected;
      }
    }
    requireEqual(receipt.items, expectedPins, "GRAPH_PREPARATION");
  }
  if (
    candidate.proposal.changes.filter((x) => x.kind === "collection").length !==
    seen.size
  ) {
    fail("GRAPH_PREPARATION", "Missing schema preparation");
  }
  return result;
}
async function checkCandidate(input, request, artifacts) {
  const candidate = BuilderFeatureCandidateSchema.parse(
    parseBuilderJson(input.candidateBytes)
  );
  const { digest: candidateDigest, ...candidateBody } = candidate;
  if (
    canonicalJson(candidate) !== input.candidateBytes ||
    candidateDigest !== request.candidateDigest ||
    candidate.proposal.id !== request.candidateId ||
    (await digestBuilderFeatureCandidate(candidateBody)) !== candidateDigest
  ) {
    fail("GRAPH_CANDIDATE", "Candidate identity mismatch");
  }
  requireEqual(candidate.proposal.scope, request.scope, "GRAPH_SCOPE");
  requireEqual(
    candidate.proposal.base,
    {
      checkpointDigest: request.expectedCheckpoint.digest,
      checkpointId: request.expectedCheckpoint.id,
      contentRevision: request.contentRevision,
    },
    "GRAPH_BASE"
  );
  ReleaseSha256Schema.parse(input.expectedRuntimeDigest);
  if (
    candidate.validation.actions.length &&
    candidate.validation.runtimeDigest !== input.expectedRuntimeDigest
  ) {
    fail("GRAPH_RUNTIME", "Candidate test runtime differs from host policy");
  }
  const checked = await verifyProposal(candidate.proposal, artifacts);
  if (checked.digest !== candidate.proposalDigest) {
    fail("GRAPH_CANDIDATE", "Proposal digest mismatch");
  }
  for (const test of candidate.validation.actions) {
    const action = artifacts.get(key(test))?.artifact;
    if (action?.kind !== "action" || action.tests.length !== test.tests) {
      fail("GRAPH_CANDIDATE", "Candidate action test evidence mismatch");
    }
  }
  return { candidate, candidateDigest, checked };
}
async function verifyBuilderApplicationTransition(input) {
  return await guarded(async () => {
    const request = transitionRequest.parse(input.request);
    const artifacts = await loadArtifacts(input.artifactBytes, request.scope);
    const base = await loadBase(request, input.base, artifacts);
    const { candidate, candidateDigest, checked } = await checkCandidate(
      input,
      request,
      artifacts
    );
    const selections = new Map(base.pins.map((p) => [identity4(p), p]));
    for (const existing of candidate.proposal.existing) {
      const current = selections.get(identity4(existing));
      if (!current || key(current) !== key(existing)) {
        fail(
          "GRAPH_BASE",
          "Existing artifact is not selected in accepted base"
        );
      }
    }
    for (const change of candidate.proposal.changes) {
      const current = selections.get(identity4(change));
      if (change.expectedVersion !== (current?.version ?? 0)) {
        fail("GRAPH_BASE", "Changed artifact base version mismatch");
      }
      selections.set(identity4(change), {
        id: change.id,
        kind: change.kind,
        sha256: change.sha256,
        version: change.version,
      });
    }
    const pins = [...selections.values()];
    const nextNeeded = exactGraph(pins, artifacts);
    const allowed = /* @__PURE__ */ new Set([...base.needed, ...nextNeeded]);
    if (allowed.size !== artifacts.size) {
      fail("GRAPH_ARTIFACT", "Unexpected artifact bytes");
    }
    const schemas = await preparedSchemas(
      input.preparations,
      request,
      base,
      candidate,
      artifacts
    );
    if (
      !samePins(
        schemas.map((x) => x.artifact),
        pins.filter((x) => x.kind === "collection")
      )
    ) {
      fail("GRAPH_SELECTION", "Selected schema map mismatch");
    }
    const next = checkpoint.parse(input.nextCheckpoint);
    requireEqual(
      request.nextCheckpoint,
      { digest: next.digest, id: next.id },
      "GRAPH_CHECKPOINT"
    );
    if (next.id === request.expectedCheckpoint.id) {
      fail("GRAPH_CHECKPOINT", "New checkpoint identity required");
    }
    const manifest = await checkedCheckpoint(next, request.scope);
    await checkPageGraph(manifest, pins, artifacts, false);
    return await finalProof(
      request,
      pins,
      schemas,
      candidateDigest,
      checked.digest
    );
  });
}
async function checkedAction(input) {
  const scope = ContentScopeSchema.parse(input.scope);
  const pin2 = BuilderArtifactPinSchema.extend({ kind: literal("action") })
    .strict()
    .parse(input.actionPin);
  const artifacts = await loadArtifacts([input.artifactBytes], scope);
  const action = artifacts.get(key(pin2))?.artifact;
  if (action?.kind !== "action") {
    fail("GRAPH_ARTIFACT", "Action artifact pin mismatch");
  }
  return { action, pin: pin2 };
}
async function verifyBuilderActionInput(input) {
  return await guarded(async () => {
    const { action, pin: pin2 } = await checkedAction(input);
    const raw = canonicalJson(input.input);
    if (byteLength(raw) > 65536) {
      fail("GRAPH_BUDGET", "Action input byte limit exceeded");
    }
    const value =
      action.formatVersion === 2 && action.inputContract
        ? validateBuilderActionInput(action.inputContract, input.input)
        : JsonValueSchema.parse(parseBuilderJson(raw));
    return {
      action: pin2,
      collections: action.collections,
      effects: action.formatVersion === 2 ? action.effects : null,
      formatVersion: action.formatVersion,
      input: value,
    };
  });
}
async function verifyBuilderPublishedFormInput(input) {
  return await guarded(async () => {
    const { action, pin: pin2 } = await checkedAction(input);
    if (
      action.formatVersion !== 2 ||
      !action.inputContract ||
      action.collections.length !== 0 ||
      action.effects.permissions.some((permission) =>
        permission.operations.some((operation) => operation !== "create")
      )
    ) {
      fail(
        "GRAPH_BINDING",
        "Public forms require a finite create-only action without collection reads"
      );
    }
    const form = PageFormSchema.parse(input.form);
    const fields = record(string2().min(1).max(128), string2().max(1e4)).parse(
      input.fields
    );
    if (
      Object.keys(fields).length > 32 ||
      byteLength(canonicalJson(fields)) > 65536
    ) {
      fail("GRAPH_BUDGET", "Public form input byte limit exceeded");
    }
    const value = await convertBuilderFormActionInput(form, action, fields);
    return {
      action: pin2,
      bindingDigest: await sha256Hex(canonicalJson(form.submission)),
      collections: [],
      effects: action.effects,
      formatVersion: 2,
      formDigest: await sha256Hex(canonicalJson(form)),
      formId: form.id,
      input: value,
    };
  });
}
async function verifyBuilderActionResult(input) {
  return await guarded(async () => {
    const { action } = await checkedAction(input);
    if (byteLength(input.resultBytes) > 65536) {
      fail("GRAPH_BUDGET", "Action result byte limit exceeded");
    }
    if (action.formatVersion === 1) {
      return {
        commands: [],
        result: JsonValueSchema.parse(parseBuilderJson(input.resultBytes)),
        version: 1,
      };
    }
    return await validateBuilderEffectPlan(
      input.resultBytes,
      action.effects,
      input.context
    );
  });
}
function projectBuilderActionRecord(input) {
  return projectBoundCollectionValues(
    input.storedDefinition,
    input.pinnedDefinition,
    input.currentDefinition,
    input.values,
    input.fields
  );
}
function parseBuilderActionRuntimeResultJson(raw) {
  if (byteLength(raw) > 65536) {
    fail("GRAPH_BUDGET", "Action result byte limit exceeded");
  }
  return JsonValueSchema.parse(parseBuilderJson(raw));
}
function parseBuilderArtifactJson(raw) {
  return JsonValueSchema.parse(parseBuilderJson(raw));
}
async function verifyBuilderFormActionDescriptor(input) {
  return await guarded(async () => {
    const { action, pin: pin2 } = await checkedAction(input);
    if (action.formatVersion !== 2 || !action.inputContract) {
      return null;
    }
    return {
      inputContract: action.inputContract,
      label: action.label,
      pin: pin2,
    };
  });
}
async function inspectBuilderActionEffectTargets(input) {
  return await guarded(async () => {
    const { action } = await checkedAction(input);
    const parsed = parseBuilderActionRuntimeResultJson(input.resultBytes);
    if (action.formatVersion === 1) {
      return { result: parsed, targets: [] };
    }
    const plan = BuilderEffectPlanSchema.parse(parsed);
    if (plan.commands.length > action.effects.maxCommands) {
      fail("GRAPH_EFFECT", "Action command limit exceeded");
    }
    const seen = /* @__PURE__ */ new Set();
    const targets = [];
    for (const command of plan.commands) {
      const target2 = canonicalJson([command.collectionId, command.recordId]);
      const permission = action.effects.permissions.find(
        (p) => p.collection.id === command.collectionId
      );
      if (
        seen.has(target2) ||
        !permission ||
        !permission.operations.includes(command.type) ||
        ("values" in command &&
          Object.keys(command.values).some(
            (field) => !permission.fields.includes(field)
          ))
      ) {
        fail("GRAPH_EFFECT", "Undeclared or duplicate action effect");
      }
      seen.add(target2);
      targets.push({
        collectionId: command.collectionId,
        expectedRevision: command.expectedRevision,
        recordId: command.recordId,
        type: command.type,
      });
    }
    return { result: plan.result, targets };
  });
}
async function verifyBuilderComponentDataBindings(input) {
  return await guarded(async () => {
    const scope = ContentScopeSchema.parse(input.scope);
    const pin2 = BuilderArtifactPinSchema.parse(input.componentPin);
    if (
      pin2.kind !== "component" ||
      !Array.isArray(input.definitionBytes) ||
      input.definitionBytes.length > 16
    ) {
      fail("GRAPH_BINDING", "Component collection budget or pin denied");
    }
    const definitions = input.definitionBytes.map((raw) =>
      canonicalJson({
        definition: CollectionDefinitionSchema.parse(parseBuilderJson(raw)),
        kind: "collection",
      })
    );
    const artifacts = await loadArtifacts(
      [input.artifactBytes, ...definitions],
      scope
    );
    const component = artifacts.get(key(pin2))?.artifact;
    if (component?.kind !== "component") {
      fail("GRAPH_ARTIFACT", "Component bytes do not match the selected pin");
    }
    verifyBindings(component, artifacts);
    const required2 = new Set(
      component.dataBindings.map((binding) => key(binding.collection))
    );
    if (definitions.length !== required2.size) {
      fail(
        "GRAPH_BINDING",
        "Component definitions must match its exact bindings"
      );
    }
    return { bindings: component.dataBindings, pin: pin2 };
  });
}
async function verifyBuilderReleaseRecovery(raw) {
  return await guarded(async () => {
    const verified = await verifyBuilderRecoveryBundle(raw);
    return {
      ...verified,
      bundle: JsonValueSchema.parse(verified.bundle),
      checkpoint: JsonValueSchema.parse(verified.checkpoint),
    };
  });
}
export {
  BuilderGraphVerificationError,
  createAstroCompilerBuildIdentity,
  inspectBuilderActionEffectTargets,
  parseBuilderActionRuntimeResultJson,
  parseBuilderArtifactJson,
  projectBuilderActionRecord,
  selectNativeAstroCompilerGeneration,
  verifyAstroCompilerBuildIdentity,
  verifyAstroCompilerReleaseReceipt,
  verifyBuilderActionInput,
  verifyBuilderActionResult,
  verifyBuilderApplicationCheckpoint,
  verifyBuilderApplicationTransition,
  verifyBuilderArtifactSet,
  verifyBuilderComponentDataBindings,
  verifyBuilderFormActionDescriptor,
  verifyBuilderPublishedFormInput,
  verifyBuilderReleaseRecovery,
};
