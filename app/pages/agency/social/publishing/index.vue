<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()

await navigateTo({
  path: '/agency/social/publishing/calendar',
  query: route.query,
}, { replace: true })
</script>
