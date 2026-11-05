// Nitro's method-specific GET route does not register HEAD. Reuse the same
// capability checks and metadata response instead of falling through to Nuxt.
export { default } from './[token].get'
