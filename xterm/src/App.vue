<template>
  <main class="app-shell">
    <h1>日志终端 (Xterm.js)</h1>
    <LogTerminal />
  </main>
</template>

<script setup lang="ts">
import LogTerminal from "@/components/terminal.vue";
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background-color: #1b1b1b;
  color: #f5f5f5;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
h1 {
  margin-bottom: 16px;
  font-weight: 600;
  color: #9cdcfe;
}
</style>
