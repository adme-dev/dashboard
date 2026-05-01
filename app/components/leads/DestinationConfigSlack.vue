<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({}) })
</script>

<template>
  <div class="space-y-3">
    <UFormField label="Slack incoming webhook URL" required>
      <UInput v-model="config.webhook_url" placeholder="https://hooks.slack.com/services/T0/B0/xxx" class="w-full" />
    </UFormField>
    <UFormField label="Mention" hint="Optional — e.g. @here or <@U123>">
      <UInput v-model="config.mention" placeholder="@here" class="w-full" />
    </UFormField>
    <UFormField label="Message template" hint="Optional — leave blank for the default 'New lead' formatter. Use {{ field.x }} tokens.">
      <UTextarea
        v-model="config.message_template"
        :rows="4"
        class="w-full font-mono text-xs"
        placeholder="🆕 *New lead* — {{ field.full_name }}&#10;✉️ {{ field.email }} · 📞 {{ field.phone_number }}&#10;Form: {{ form_name }}"
      />
    </UFormField>
  </div>
</template>
