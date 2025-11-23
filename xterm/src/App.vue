<template>
  <main class="app-shell">
    <h1>日志终端</h1>
    <LogTerminal />
  </main>
</template>

<script setup lang="ts">
import LogTerminal from "@/components/terminal.vue";
</script>

<style scoped>
.app-shell {
  height: 100%;
  background-color: #FFF;
  color: #f5f5f5;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}
h1 {
  margin-bottom: 16px;
  font-weight: 600;
  color: #9cdcfe;
}
</style>
