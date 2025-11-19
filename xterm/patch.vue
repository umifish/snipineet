<template>
  <div class="log-terminal-wrapper">
    <div class="controls">
      <label class="checkbox-control">
        <input
          type="checkbox"
          v-model="logStore.isAutoScrolling"
          :disabled="logStore.isAnimating"
        />
        自动滚动
      </label>

      <div class="filter-group">
        <input
          type="text"
          v-model="logStore.filterUserId"
          placeholder="筛选 UserId (e.g., U1)"
          :disabled="logStore.isAnimating"
        />
        <input
          type="text"
          v-model="logStore.filterClientId"
          placeholder="筛选 ClientId (e.g., C3)"
          :disabled="logStore.isAnimating"
        />
        <button
          v-if="logStore.isFilterActive"
          @click="logStore.resetFilters"
          class="reset-btn"
        >
          重置筛选
        </button>
      </div>

      <button
        v-if="!logStore.isAutoScrolling && !logStore.isViewingNewest"
        @click="logStore.moveDisplayWindow('LATEST')"
        :disabled="logStore.isAnimating"
        class="scroll-btn"
      >
        滚动到最新
      </button>

      <button
        @click="clearAllData"
        :disabled="logStore.isAnimating"
        class="danger-btn"
      >
        清空所有
      </button>
      <button @click="reRenderTerminal(true)" :disabled="logStore.isAnimating">
        重绘终端
      </button>

      <span class="status-log-count">
        总数:
        <span
          :class="{
            'limit-warning': logStore.allLogsLength >= logStore.MAX_LOG_COUNT,
          }"
        >
          {{ logStore.allLogsLength }} / {{ logStore.MAX_LOG_COUNT }}
        </span>
      </span>
      <span
        v-if="logStore.isFilterActive"
        style="color: #61afef; font-weight: bold"
        >[筛选中: {{ logStore.activeLogs.length }} 条]</span
      >
      <span v-if="logStore.isAnimating" class="status-loading"
        >正在平滑滚动...</span
      >

      <span class="status-scroll-position">
        窗口索引: {{ logStore.scrollLogIndexStart }} /
        {{
          Math.max(0, logStore.activeLogs.length - logStore.XTERM_DISPLAY_LIMIT)
        }}
        <span v-if="logStore.isViewingNewest" style="color: #38b438"
          >(最新)</span
        >
      </span>
    </div>

    <div ref="terminalRef" class="xterm-container"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  useLogTerminalStore,
  LogEntry,
  WindowMoveDirection,
} from "@/stores/logTerminalStore";
import { Terminal, ITerminalOptions } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

const logStore = useLogTerminalStore();
const terminalRef = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let isFirstRender = true;

// Xterm.js 配置
const terminalOptions: ITerminalOptions = {
  scrollback: 0,
  disableStdin: true,
  cursorBlink: false,
  theme: {
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    scrollbar: "#555555",
    scrollbarHover: "#777777",
    scrollbarActive: "#aaaaaa",
  },
};

/**
 * 格式化并写入日志到 Xterm 终端 (增加了 userId 和 clientId)
 */
const writeLogToTerminal = (logData: LogEntry) => {
  const t = term;
  if (!t) return;

  const level = logData.level.toUpperCase();
  const levelColor =
    level === "ERROR" ? "\x1b[31m" : level === "WARN" ? "\x1b[33m" : "\x1b[32m";
  const resetColor = "\x1b[0m";
  const timestamp = new Date(logData.timestamp).toLocaleTimeString();

  const formattedLine = `${levelColor}[${timestamp}|${logData.sequence}] [${level}|U:${logData.userId}|C:${logData.clientId}]: ${logData.message}${resetColor}\r\n`;

  t.write(formattedLine);
};

/**
 * 核心渲染函数：使用增量或全量模式更新 Xterm
 */
const reRenderTerminal = (forceFullRender: boolean = false) => {
  const t = term;
  if (!t) return;

  const currentLogs = logStore.displayContent;
  const previousLogs = logStore.previousRenderContent;
  const moveDirection = logStore.lastWindowMoveDirection;

  // ------------------------------------------
  // 逻辑 A: 初始渲染、强制全量渲染、筛选模式、动画结束
  // ------------------------------------------
  if (
    isFirstRender ||
    forceFullRender ||
    moveDirection === "LATEST" ||
    !logStore.isAnimating ||
    logStore.isFilterActive
  ) {
    t.clear();

    const totalDisplayedCount = currentLogs.length;
    t.write(
      `\r\n\x1b[36m--- Active Logs: ${logStore.activeLogs.length}. Viewing: ${
        logStore.scrollLogIndexStart
      } to ${
        logStore.scrollLogIndexStart + totalDisplayedCount - 1
      } ---\x1b[0m\r\n\r\n`
    );

    currentLogs.forEach(writeLogToTerminal);

    if (logStore.isAutoScrolling && logStore.isViewingNewest) {
      t.scrollToBottom();
    }
    isFirstRender = false;
    return;
  }

  // ------------------------------------------
  // 逻辑 B: 平滑增量滚动（非筛选模式，动画过程中）
  // ------------------------------------------
  if (
    logStore.isAnimating &&
    !logStore.isFilterActive &&
    previousLogs.length > 0 &&
    currentLogs.length > 0
  ) {
    // 确保本次渲染的内容和上次渲染的内容有差异
    if (currentLogs[0].sequence === previousLogs[0].sequence) return;

    // 仅在非筛选模式下，使用 sequence 差异计算 linesMoved
    let linesMoved: number;

    if (moveDirection === "OLDER") {
      linesMoved = previousLogs[0].sequence - currentLogs[0].sequence;
      if (linesMoved <= 0) return;

      t.scrollLines(linesMoved);
      const newLines = currentLogs.slice(0, linesMoved);

      t.write("\x1b[s");
      t.write("\x1b[H");
      newLines.forEach(() => {
        t.write(`\x1b[2K\r`);
      });
      t.write("\x1b[H");
      newLines.forEach(writeLogToTerminal);
      t.write("\x1b[u");
    } else if (moveDirection === "NEWER") {
      linesMoved =
        currentLogs[currentLogs.length - 1].sequence -
        previousLogs[previousLogs.length - 1].sequence;
      if (linesMoved <= 0) return;

      t.scrollLines(-linesMoved);
      const newLines = currentLogs.slice(-linesMoved);
      t.write("\x1b[s");
      newLines.forEach(writeLogToTerminal);
      t.write("\x1b[u");
    }

    return;
  }

  // ------------------------------------------
  // 逻辑 C: 轮询增量 (仅在自动滚动且最新窗口时)
  // ------------------------------------------
  if (
    logStore.isAutoScrolling &&
    logStore.isViewingNewest &&
    logStore.latestPolledLogs.length > 0
  ) {
    logStore.latestPolledLogs.forEach(writeLogToTerminal);
    t.scrollToBottom();
  }
};

// 清除 Store 和 Xterm 的所有数据和缓存
const clearAllData = () => {
  logStore.clearTerminal();

  if (term) {
    term.clear();
    term.write(
      "\x1b[31m--- ALL Data Cleared. Restarting Polling... ---\x1b[0m\r\n"
    );
    logStore.fetchLatestLogs();
  }
};

onMounted(async () => {
  term = new Terminal(terminalOptions);
  fitAddon = new FitAddon();

  term.loadAddon(fitAddon);

  if (terminalRef.value) {
    term.open(terminalRef.value);
    fitAddon.fit();
  }

  // 监听 Xterm.js 的滚动事件
  term!.onScroll((firstDisplayedLine: number) => {
    // 【修复】增加 PostMoveLocked 检查
    if (logStore.isAnimating || logStore.isPostMoveLocked) return;

    const totalLines = term!.buffer.active.length;

    // 1. 向上滚动
    if (firstDisplayedLine < 5 && !logStore.isViewingOldest) {
      logStore.moveDisplayWindow("OLDER");
    }

    // 2. 向下滚动
    if (
      firstDisplayedLine + term!.rows > totalLines - 5 &&
      !logStore.isViewingNewest
    ) {
      logStore.moveDisplayWindow("NEWER");
    }

    // 3. 非自动滚动模式下，用户手动滚到底部，锁定最新
    if (
      !logStore.isAutoScrolling &&
      firstDisplayedLine + term!.rows === totalLines
    ) {
      logStore.moveDisplayWindow("LATEST");
    }
  });

  // 窗口大小自适应
  const handleResize = () => fitAddon?.fit();
  window.addEventListener("resize", handleResize);

  await logStore.fetchLatestLogs();
  reRenderTerminal(true);

  // 2. 监听 Store 的变化并触发渲染

  // 监听 scrollLogIndexStart 变化，触发平滑滚动（逻辑 B）
  watch(
    logStore.scrollLogIndexStart,
    () => {
      reRenderTerminal(false);
    },
    { deep: false }
  );

  // 监听筛选状态和日志总数变化，触发全量重绘
  watch(
    [logStore.isFilterActive, logStore.allLogsLength],
    (newValues, oldValues) => {
      const isFilterChange = newValues[0] !== oldValues[0];

      if (isFilterChange) {
        // 筛选变化时，强制全量重绘
        reRenderTerminal(true);
        return;
      }

      // 检查日志总数是否发生大变化（截断）
      if (
        Math.abs(newValues[1] - oldValues[1]) > logStore.XTERM_DISPLAY_LIMIT
      ) {
        reRenderTerminal(true);
      }
    },
    { deep: false }
  );

  // 监听 isAnimating 变化 (动画结束时强制全量重绘)
  watch(logStore.isAnimating, (isAnimating, wasAnimating) => {
    if (wasAnimating && !isAnimating) {
      reRenderTerminal(true);
    }
  });

  // 监听增量日志的变化 (逻辑 C)
  watch(
    logStore.latestPolledLogs,
    () => {
      if (logStore.latestPolledLogs.length > 0) {
        reRenderTerminal(false);
      }
    },
    { deep: false }
  );

  // 监听自动滚动状态变化
  watch(logStore.isAutoScrolling, (newValue) => {
    if (newValue) {
      logStore.moveDisplayWindow("LATEST");
      term!.scrollToBottom();
    }
  });
});

onBeforeUnmount(() => {
  if (term) {
    term.dispose();
  }
  logStore.stopPolling();
  const handleResize = () => fitAddon?.fit();
  window.removeEventListener("resize", handleResize);
});
</script>

<style scoped>
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
.controls input[type="checkbox"] {
  margin: 0;
}
/* 筛选样式 */
.filter-group {
  display: flex;
  gap: 5px;
}
.filter-group input {
  padding: 5px 8px;
  border: 1px solid #444;
  background-color: #3c3c3c;
  color: #d4d4d4;
  border-radius: 3px;
  width: 120px;
}
.filter-group .reset-btn {
  background-color: #f7a738;
}
/* 按钮样式 */
.controls button {
  background-color: #007acc;
  color: white;
  border: none;
  padding: 5px 10px;
  cursor: pointer;
  border-radius: 3px;
  transition: background-color 0.2s;
}
.controls button:disabled {
  background-color: #3a3d41;
  cursor: not-allowed;
}
.controls .danger-btn {
  background-color: #cc0000;
}
.controls .scroll-btn {
  background-color: #6a0dad;
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
.status-loading {
  color: #ffcc00;
  font-weight: bold;
  animation: blink 1s infinite;
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.status-scroll-position {
  color: #9cdcfe;
  font-size: 0.9em;
  padding: 3px 5px;
  background-color: #3c3c3c;
  border-radius: 3px;
}

.xterm-container {
  flex-grow: 1;
  width: 100%;
}
</style>
