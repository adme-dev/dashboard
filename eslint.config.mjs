// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    'vue/no-multiple-template-root': 'off',
    'vue/max-attributes-per-line': ['error', { singleline: 3 }],
    // Ban single-arg z.record(value): INVALID in Zod 4. It compiles but throws
    // "Cannot read properties of undefined (reading '_zod')" at parse time → HTTP
    // 500. Use z.record(keySchema, valueSchema), e.g. z.record(z.string(), value).
    // (Bit 6 endpoints this cycle; fixed in #84.)
    'no-restricted-syntax': ['error', {
      selector: "CallExpression[callee.object.name='z'][callee.property.name='record'][arguments.length=1]",
      message: "Single-arg z.record(value) is invalid in Zod 4 (runtime 500: '_zod' undefined). Use z.record(z.string(), value)."
    }]
  }
})
