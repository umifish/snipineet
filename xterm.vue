<template>
  <div ref="terminalRef" class="xterm-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
// 导入 xterm.js 的基本样式
import "@xterm/xterm/css/xterm.css";

// ---------------------------
// 1. Props 定义
// ---------------------------
const props = defineProps({
  logData: {
    type: Array as () => string[],
    default: () => [],
    required: true,
  },
  autoScroll: {
    type: Boolean,
    default: true,
  },
  height: {
    type: String,
    default: "500px",
  },
  // 可选：终端的字体大小
  fontSize: {
    type: Number,
    default: 14,
  },
});

// ---------------------------
// 2. 内部状态和实例
// ---------------------------
const terminalRef = ref<HTMLElement | null>(null); // DOM 容器引用
let terminal: Terminal | null = null; // xterm.js 实例
let fitAddon: FitAddon | null = null; // Fit 插件实例
let resizeObserver: ResizeObserver | null = null; // ResizeObserver 实例
let lastLogLength = 0; // 记录上次渲染的日志数量，用于增量更新

// ---------------------------
// 3. 核心逻辑：初始化与适配
// ---------------------------
const initTerminal = () => {
  if (!terminalRef.value) return;

  // 终端配置
  terminal = new Terminal({
    cursorBlink: false,
    scrollback: 5000,
    convertEol: true,
    fontSize: props.fontSize, // 使用 props 传入字体大小
    theme: {
      background: "#1f1f1f",
      foreground: "#cccccc",
      selectionBackground: "#5c5c5c",
    },
  });

  // 加载 Fit 插件
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // 挂载到 DOM
  terminal.open(terminalRef.value);

  // 初始适应大小
  fitAddon.fit();

  // 首次加载时，将所有日志写入
  writeNewLogs(props.logData);

  // 初始化 ResizeObserver
  setupResizeObserver();
};

/**
 * 设置 ResizeObserver 监听终端容器尺寸变化
 */
const setupResizeObserver = () => {
  if (!terminalRef.value) return;

  resizeObserver = new ResizeObserver(() => {
    // 当容器尺寸变化时，调用 fitAddon.fit() 重新计算终端大小
    fitTerminal();
  });

  // 监听 terminalRef.value 元素的尺寸变化
  resizeObserver.observe(terminalRef.value);
};

/**
 * 写入新的日志行
 * @param logsToPrint 需要写入的日志行数组
 */
const writeNewLogs = (logsToPrint: string[]) => {
  if (!terminal) return;

  logsToPrint.forEach((log) => {
    terminal!.writeln(log);
  });

  if (props.autoScroll) {
    terminal.scrollToBottom();
  }
};

/**
 * 终端适应容器大小
 */
const fitTerminal = () => {
  if (fitAddon) {
    fitAddon.fit();
  }
};

// ---------------------------
// 4. 数据监听：响应外部日志变化
// ---------------------------
watch(
  () => props.logData,
  (newLogs) => {
    if (newLogs.length > lastLogLength) {
      const newEntries = newLogs.slice(lastLogLength);
      writeNewLogs(newEntries);
      lastLogLength = newLogs.length;
    } else if (newLogs.length < lastLogLength) {
      // 处理日志被清空或截断的情况
      terminal?.clear();
      writeNewLogs(newLogs);
      lastLogLength = newLogs.length;
    }
  },
  {
    immediate: true,
  }
);

// ---------------------------
// 5. 生命周期管理
// ---------------------------
onMounted(() => {
  initTerminal();
});

onBeforeUnmount(() => {
  // 断开 ResizeObserver
  if (resizeObserver && terminalRef.value) {
    resizeObserver.unobserve(terminalRef.value);
    resizeObserver.disconnect(); // 确保所有观察者都被断开
  }
  // 销毁 xterm 实例
  if (terminal) {
    terminal.dispose();
  }
});
</script>

<style scoped>
.xterm-container {
  width: 100%;
  height: v-bind(height);
  overflow: hidden;
  border: 1px solid #444;
}

.xterm-container :deep(.xterm) {
  padding: 10px;
}
</style>

<!-- 
npm install @xterm/xterm @xterm/addon-fit
# 或者使用 yarn
yarn add @xterm/xterm @xterm/addon-fit -->
