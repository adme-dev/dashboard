/**
 * Zero Cache Server Configuration
 * Configuration for the Rocicorp Zero sync engine
 *
 * To run the Zero cache server:
 * npx @rocicorp/zero-cache serve --config zero.config.ts
 */

import { schema, permissions } from './app/zero/schema'

export default {
  // Server configuration
  server: {
    // Port for the Zero cache server
    port: parseInt(process.env.ZERO_PORT || '4848', 10),

    // Host binding (0.0.0.0 for Docker/production)
    host: process.env.ZERO_HOST || 'localhost',
  },

  // Database configuration - connects to Neon Postgres
  upstream: {
    // Use the same DATABASE_URL as the Nuxt app
    db: process.env.DATABASE_URL,

    // Connection pool settings
    poolSize: 5,

    // SSL configuration for Neon
    ssl: {
      rejectUnauthorized: false,
    },
  },

  // Schema and permissions
  schema,
  permissions,

  // Replication settings
  replication: {
    // Tables to sync
    tables: [
      'chart_of_accounts',
      'agency_clients',
      'team_members',
      'projects',
      'time_entries',
      'project_expenses',
      'media_spend',
      'agency_invoices',
      'retainer_periods',
    ],

    // Publication name in Postgres (must be created)
    publicationName: 'zero_publication',

    // Replication slot name
    slotName: 'zero_slot',
  },

  // Authentication (optional - can be handled by your app)
  auth: {
    // For development, allow anonymous access
    // In production, implement JWT validation
    anonymous: process.env.NODE_ENV !== 'production',
  },

  // Logging
  log: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
}
