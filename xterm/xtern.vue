<template>
  <div class="log-terminal-wrapper">
    <div class="controls">
      <label
        >Client ID:
        <input
          v-model="localFilterClientId"
          placeholder="Client ID (模糊匹配)"
          type="text"
        />
      </label>
      <button
        @click="applyFilters"
        :disabled="logStore.isLoadingHistory"
        class="filter-btn"
      >
        应用筛选
      </button>

      <label
        >User ID:
        <input
          v-model="logStore.filterUserId"
          placeholder="User ID"
          type="text"
      /></label>

      <label
        >关键字:
        <input
          v-model="logStore.filterMessageKeyword"
          placeholder="消息关键字"
          type="text"
      /></label>

      <label
        >起始时间:
        <input
          v-model="logStore.filterStartTime"
          placeholder="YYYY-MM-DD HH:MM:SS"
          type="text"
          style="width: 150px"
        />
      </label>
      <label
        >结束时间:
        <input
          v-model="logStore.filterEndTime"
          placeholder="YYYY-MM-DD HH:MM:SS"
          type="text"
          style="width: 150px"
        />
      </label>

      <label class="checkbox-control">
        <input type="checkbox" v-model="logStore.isAutoScrolling" /> 自动滚动
      </label>
      <button
        v-if="!logStore.isAutoScrolling && !logStore.isViewingNewest"
        @click="logStore.moveDisplayWindow('LATEST')"
        class="scroll-btn"
      >
        滚动到最新
      </button>
      <button @click="clearDisplayOnly" :disabled="logStore.isLoadingHistory">
        清空显示
      </button>
      <button
        @click="clearAllData"
        :disabled="logStore.isLoadingHistory"
        class="danger-btn"
      >
        清空数据
      </button>
      <button
        @click="reRenderTerminal(true)"
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
          logStore.isComplexMode ? "筛选中" : "列表"
        }}</span>
      </span>

      <span
        v-if="logStore.isComplexMode || !logStore.isViewingNewest"
        class="status-scroll-position"
      >
        窗口索引: {{ logStore.scrollLogIndexStart }} /
        {{ Math.max(0, logStore.allLogsLength - logStore.displayLimit) }}
        <span v-if="!logStore.isViewingNewest" style="color: yellow"
          >(非最新)</span
        >
        <span v-else style="color: #38b438">(最新)</span>
      </span>
    </div>

    <div ref="terminalRef" class="xterm-container"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useLogTerminalStore, LogEntry } from "@/stores/logTerminalStore";
import { Terminal, ITerminalOptions } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebglAddon } from "xterm-addon-webgl";
import "xterm/css/xterm.css";

const logStore = useLogTerminalStore();
const terminalRef = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;

// 用于记录用户是否手动向上滚动，这与 Store 的 scrollLogIndexStart 是两个概念，
// 这里的 isScrollingUp 仅用于判断增量渲染时是否自动滚动到底部。
let isScrollingUp = false;

// 局部状态用于 Client ID 输入框
const localFilterClientId = ref(logStore.filterClientId);

// Xterm.js 配置
const terminalOptions: ITerminalOptions = {
  scrollback: logStore.MAX_LOG_COUNT,
  disableStdin: true,
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

/**
 * 格式化并写入日志到 Xterm 终端 (颜色高亮)
 */
const writeLogToTerminal = (logData: LogEntry) => {
  const t = term;
  if (!t) return;

  const level = logData.level.toUpperCase();
  const levelColor =
    level === "ERROR" ? "\x1b[31m" : level === "WARN" ? "\x1b[33m" : "\x1b[32m";
  const resetColor = "\x1b[0m";
  const timestamp = new Date(logData.timestamp).toLocaleTimeString();

  const formattedLine = `${levelColor}[${timestamp}|${logData.sequence}] [${level}] G:${logData.groupId} C:${logStore.filterClientId} U:${logStore.filterUserId}: ${logData.message}${resetColor}\r\n`;

  t.write(formattedLine);
};

// 手动滚动到底部功能
const scrollToBottom = () => {
  if (term) {
    term.scrollToBottom();
  }
};

/**
 * 使用 ANSI 码删除顶部加载提示
 */
const removeLoadingMessage = () => {
  const t = term;
  if (!t) return;
  t.write("\x1b[2A\x1b[K");
};

/**
 * 将局部 Client ID 筛选值应用到 Store
 */
const applyFilters = () => {
  logStore.filterClientId = localFilterClientId.value;
  // Store 的 watch 会自动处理后续的 moveDisplayWindow('LATEST') 和重绘
};

/**
 * 核心渲染函数：全量/增量更新 Xterm
 */
const reRenderTerminal = (forceFullRender: boolean = false) => {
  const t = term;
  if (!t) return;

  // 1. 全量渲染逻辑：复杂模式、强制重绘、或窗口不在最新位置时
  if (logStore.isComplexMode || forceFullRender || !logStore.isViewingNewest) {
    t.clear();

    const logsToRender = logStore.displayContent as LogEntry[];

    // 顶部提示：没有更旧历史
    if (
      !logStore.hasMoreHistory &&
      logStore.isViewingOldest &&
      !logStore.isComplexMode
    ) {
      t.write("\x1b[33m--- No more history in allLogs ---\x1b[0m\r\n\r\n");
    }

    // 渲染头部信息
    const totalBaseCount = logStore.isComplexMode
      ? logStore.allLogsLength
      : logStore.allLogsLength;
    const totalDisplayedCount = logsToRender.length;

    t.write(
      `\r\n\x1b[36m--- Total ${totalBaseCount} logs. Viewing window: ${
        logStore.scrollLogIndexStart
      } to ${
        logStore.scrollLogIndexStart + totalDisplayedCount - 1
      } ---\x1b[0m\r\n\r\n`
    );

    // 渲染日志内容
    logsToRender.forEach((log) => {
      writeLogToTerminal(log);
    });

    // 只有在开启了自动滚动且窗口处于最新位置时，才定位到底部
    if (logStore.isAutoScrolling && logStore.isViewingNewest) {
      t.scrollToBottom();
    }
  }
  // 2. 简单模式：增量渲染 (仅当处于最新窗口时才允许增量渲染)
  else if (
    !logStore.isComplexMode &&
    logStore.isViewingNewest &&
    logStore.latestPolledLogs.length > 0
  ) {
    logStore.latestPolledLogs.forEach(writeLogToTerminal);

    // 只有在 isAutoScrolling 为 true 且用户没有向上滚动时，才自动滚动
    if (logStore.isAutoScrolling && !isScrollingUp) {
      t.scrollToBottom();
    }
  }
};

// 仅清除 Xterm 终端的显示内容，保留 Store 中的 allLogs
const clearDisplayOnly = () => {
  if (term) {
    term.clear();
    term.write("\x1b[34m--- Display Cleared (Data Retained) ---\x1b[0m\r\n");
  }
};

// 清除 Store 和 Xterm 的所有数据和显示
const clearAllData = () => {
  logStore.clearTerminal();
  if (term) {
    term.clear();
    term.write("\x1b[31m--- ALL Data Cleared (Need Reload) ---\x1b[0m\r\n");
  }
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

  // 监听 Xterm.js 的滚动事件
  term!.onScroll((firstDisplayedLine: number) => {
    // 判断用户是否在向上滚动
    isScrollingUp =
      firstDisplayedLine < term!.buffer.active.length - term!.rows;

    // --- 逻辑 1：加载更旧的历史日志 (仅在简单模式和窗口最旧时) ---
    if (
      firstDisplayedLine === 0 &&
      !logStore.isLoadingHistory &&
      logStore.hasMoreHistory &&
      !logStore.isComplexMode &&
      logStore.isViewingOldest
    ) {
      term!.write("\r\n\x1b[33m--- Loading History Logs... ---\x1b[0m\r\n");

      // 异步加载历史日志
      logStore.loadOlderLogs().then(() => {
        removeLoadingMessage();
        // 加载完历史日志后，将显示窗口移到最旧，以便用户看到新加载的内容
        logStore.moveDisplayWindow("OLDER");
        reRenderTerminal(true); // 强制重绘
      });
    }

    // --- 逻辑 2：动态调整显示窗口 (窗口滚动切换) ---
    // 滚动到顶部 (firstDisplayedLine 接近 0)，并且当前窗口不是最旧的，则加载更旧的窗口
    if (firstDisplayedLine < 5 && !logStore.isViewingOldest) {
      logStore.moveDisplayWindow("OLDER");
    }

    // 滚动到底部 (firstDisplayedLine + rows 接近 totalLines)，并且当前窗口不是最新的，则加载更新的窗口
    const totalLines = term!.buffer.active.length;
    if (
      firstDisplayedLine + term!.rows > totalLines - 5 &&
      !logStore.isViewingNewest
    ) {
      logStore.moveDisplayWindow("NEWER");
    }

    // 逻辑 3：用户手动滚动到底部，且开启了自动滚动
    if (
      firstDisplayedLine + term!.rows === totalLines &&
      logStore.isAutoScrolling
    ) {
      isScrollingUp = false; // 用户滚到底部，重置向上滚动状态
      logStore.moveDisplayWindow("LATEST"); // 确保 Store 窗口处于最新
    }
  });

  // 窗口大小自适应
  const handleResize = () => fitAddon?.fit();
  window.addEventListener("resize", handleResize);

  // 1. 启动时的初始化
  await logStore.loadOlderLogs();
  logStore.moveDisplayWindow("LATEST"); // 初始化时确保窗口在最新位置
  reRenderTerminal(true);
  logStore.fetchLatestLogs();

  // 2. 监听 Store 的变化并触发渲染

  // 监听筛选、内容变化和滚动位置，触发全量重绘
  watch(
    [
      logStore.isComplexMode,
      logStore.displayContent,
      logStore.scrollLogIndexStart,
    ],
    () => {
      reRenderTerminal(true);
    },
    { deep: false }
  );

  // 监听增量日志的变化，触发增量渲染 (仅在简单且最新窗口时有效)
  watch(
    logStore.latestPolledLogs,
    () => {
      if (
        !logStore.isComplexMode &&
        logStore.isViewingNewest &&
        logStore.latestPolledLogs.length > 0
      ) {
        reRenderTerminal(false);
      }
    },
    { deep: false }
  );

  // 监听自动滚动状态
  watch(logStore.isAutoScrolling, (newValue) => {
    if (newValue) {
      logStore.moveDisplayWindow("LATEST");
      scrollToBottom();
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
.controls input[type="text"],
.controls select {
  background-color: #3c3c3c;
  border: 1px solid #666;
  color: #d4d4d4;
  padding: 3px 5px;
  border-radius: 3px;
}
.controls .checkbox-control {
  display: flex;
  align-items: center;
  gap: 5px;
}
.controls input[type="checkbox"] {
  margin: 0;
}
.controls button {
  background-color: #007acc;
  color: white;
  border: none;
  padding: 5px 10px;
  cursor: pointer;
  border-radius: 3px;
}
.controls .filter-btn {
  background-color: #8b4513;
}
.controls .danger-btn {
  background-color: #cc0000;
}
.controls .scroll-btn {
  background-color: #6a0dad;
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
