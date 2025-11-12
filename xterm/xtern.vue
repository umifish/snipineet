<template>
  <div class="log-terminal-wrapper">
    <div class="controls">
      <label
        >Client ID:
        <input
          v-model="logStore.filterClientId"
          placeholder="Client ID"
          type="text"
      /></label>
      <label
        >User ID:
        <input
          v-model="logStore.filterUserId"
          placeholder="User ID"
          type="text"
      /></label>

      <label
        >起始时间:
        <input
          v-model="logStore.filterStartTime"
          placeholder="YYYY-MM-DD HH:MM:SS"
          type="text"
          title="支持任何能被 Date() 解析的格式"
          style="width: 150px"
        />
      </label>
      <label
        >结束时间:
        <input
          v-model="logStore.filterEndTime"
          placeholder="YYYY-MM-DD HH:MM:SS"
          type="text"
          title="支持任何能被 Date() 解析的格式"
          style="width: 150px"
        />
      </label>

      <label>聚合模式:</label>
      <select
        :value="logStore.currentMode"
        @change="e => logStore.setAggregationMode((e.target as HTMLSelectElement).value as AggregationMode)"
      >
        <option value="NONE">无分组</option>
        <option value="GROUP_ID">按 Group ID</option>
        <option value="CLIENT_ID">按 Client ID</option>
        <option value="USER_ID">按 User ID</option>
      </select>

      <button
        @click="logStore.clearTerminal"
        :disabled="logStore.isLoadingHistory"
      >
        清空日志
      </button>
      <button
        @click="logStore.reRenderTerminal"
        :disabled="logStore.isLoadingHistory"
      >
        重新渲染
      </button>

      <span class="status-error-stats">
        错误/警告:
        <span class="error-count">{{ logStore.errorLogStats.errorCount }}</span>
        /
        <span class="warn-count">{{ logStore.errorLogStats.warnCount }}</span>
      </span>

      <span class="status-log-count">
        日志数量:
        <span
          :class="{
            'limit-warning': logStore.allLogsLength >= logStore.MAX_LOG_COUNT,
          }"
        >
          {{ logStore.allLogsLength }} / {{ logStore.MAX_LOG_COUNT }}
        </span>
      </span>

      <span v-if="logStore.isLoadingHistory" class="status-loading"
        >正在加载历史...</span
      >
      <span
        :class="{
          'status-connected': logStore.isPolling,
          'status-disconnected': !logStore.isPolling,
        }"
      >
        轮询状态: {{ logStore.isPolling ? "运行中" : "已停止" }}
      </span>

      <span class="status-mode">
        模式:
        <span class="mode-key">{{
          logStore.currentMode === "NONE"
            ? logStore.viewingGroupKey
              ? "详情"
              : "列表"
            : logStore.currentMode
        }}</span>
      </span>
    </div>

    <div
      v-if="logStore.currentMode !== 'NONE' && !logStore.viewingGroupKey"
      class="aggregation-list"
    >
      <h3>
        按 {{ logStore.currentMode.replace("_", " ") }} 聚合结果 (点击查看详情)
      </h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{{ logStore.currentMode.replace("_ID", " ID") }}</th>
            <th>日志条数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(group, index) in (logStore.displayContent as any)"
            :key="group.key"
          >
            <td>{{ index + 1 }}</td>
            <td>{{ group.key }}</td>
            <td>{{ group.count }}</td>
            <td>
              <button
                @click="logStore.setViewingGroup(`${group.field}:${group.key}`)"
              >
                查看详情
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-show="logStore.currentMode === 'NONE' || logStore.viewingGroupKey"
      ref="terminalRef"
      class="xterm-container"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import {
  useLogTerminalStore,
  AggregationMode,
} from "@/stores/logTerminalStore";
import { Terminal, ITerminalOptions } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebglAddon } from "xterm-addon-webgl";
import "xterm/css/xterm.css";

const logStore = useLogTerminalStore();
const terminalRef = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;

// Xterm.js 配置优化 (包含滚动条颜色优化)
const terminalOptions: ITerminalOptions = {
  scrollback: 99999,
  disableStdin: true, // Xterm 仅展示
  cursorBlink: false,
  allowTransparency: true,
  theme: {
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    scrollbar: "#555555",
    scrollbarHover: "#777777",
    scrollbarActive: "#aaaaaa",
  },
};

onMounted(async () => {
  term = new Terminal(terminalOptions);
  fitAddon = new FitAddon();

  const webglAddon = new WebglAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(webglAddon);

  if (terminalRef.value) {
    term.open(terminalRef.value);
    fitAddon.fit();
  }

  logStore.setTerminalInstance(term);

  // 监听 Xterm.js 的滚动事件 (上拉加载历史数据)
  term.onScroll((firstDisplayedLine: number) => {
    if (firstDisplayedLine === 0 && !logStore.isLoadingHistory) {
      logStore.loadOlderLogs();
    }
  });

  // 初始加载历史日志
  await logStore.loadOlderLogs();

  // 启动定时器轮询接口
  logStore.fetchLatestLogs();

  // 窗口大小自适应
  const handleResize = () => fitAddon?.fit();
  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  if (term) {
    term.dispose();
  }
  logStore.stopPolling(); // 停止轮询
  const handleResize = () => fitAddon?.fit();
  window.removeEventListener("resize", handleResize);
});
</script>

<style scoped>
/* CSS 样式保持不变 */
.log-terminal-wrapper {
  height: 600px;
  display: flex;
  flex-direction: column;
  border: 1px solid #333;
}
.controls {
  padding: 10px;
  background-color: #252526;
  border-bottom: 1px solid #000;
  display: flex;
  align-items: center;
  gap: 15px;
  flex-shrink: 0;
  color: #d4d4d4;
  font-size: 0.9em;
  flex-wrap: wrap;
}
.controls label,
.controls span {
  white-space: nowrap;
}
.controls input,
.controls select {
  background-color: #3c3c3c;
  border: 1px solid #666;
  color: #d4d4d4;
  padding: 3px 5px;
  border-radius: 3px;
}
.controls button {
  background-color: #007acc;
  color: white;
  border: none;
  padding: 5px 10px;
  cursor: pointer;
  border-radius: 3px;
}
.controls button:disabled {
  background-color: #3a3d41;
  cursor: not-allowed;
}

/* 状态样式 */
.status-log-count {
  font-weight: 500;
  color: #9cdcfe;
}
.limit-warning {
  color: #ff5555;
  font-weight: bold;
}
.status-connected {
  color: #38b438;
  font-weight: bold;
}
.status-disconnected {
  color: #ff5555;
  font-weight: bold;
}
.status-loading {
  color: #ffcc00;
  font-weight: bold;
}
.status-mode {
  font-style: italic;
}
.mode-key {
  color: #ff80c0;
}

/* 错误日志高亮样式 */
.status-error-stats {
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 3px;
  background-color: #333;
}
.error-count {
  color: #ff5555;
}
.warn-count {
  color: #ffaa00;
}

/* 聚合列表区域样式 */
.aggregation-list {
  flex-grow: 1;
  overflow-y: auto;
  background-color: #1e1e1e;
  color: #d4d4d4;
  padding: 15px;
  font-family: monospace;
}
.aggregation-list h3 {
  border-bottom: 1px solid #555;
  padding-bottom: 5px;
  margin-top: 0;
}
.aggregation-list table {
  width: 100%;
  border-collapse: collapse;
}
.aggregation-list th,
.aggregation-list td {
  padding: 8px 10px;
  border-bottom: 1px solid #333;
  text-align: left;
}
.aggregation-list tbody tr:hover {
  background-color: #2a2a2a;
}
.aggregation-list button {
  background-color: #555;
  padding: 3px 8px;
  font-size: 0.8em;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.xterm-container {
  flex-grow: 1;
  width: 100%;
}
</style>
