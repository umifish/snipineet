<template>
  <div class="terminal-wrapper">
    <div class="status-bar">
      <div class="info">
        <span>列数: {{ state.cols }}</span>
        <span v-if="state.isResizing" class="re-render-hint">正在重新排列日志布局...</span>
      </div>
      <div class="actions">
        <button @click="generateDemoLog" class="btn primary">模拟彩色日志流</button>
        <button @click="clearLogs" class="btn">清空</button>
      </div>
    </div>

    <div ref="terminalContainer" class="terminal-box"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// --- 常量配置 ---
const CONFIG = {
  fontSize: 14,
  lineHeight: 1.2,
  threshold: 5,         // 距离右边缘触发换行的单元格数
  indentSize: 8,        // 换行后的缩进空格数
  debounceWait: 250,    // 窗口缩放防抖延迟 (ms)
  maxHistory: 1000,     // 内存中保留的最大日志条数
  prompt: '\x1b[1;32m[INFO]\x1b[0m ' // 带颜色的前缀
};

// 正则：匹配 ANSI 转义序列 (颜色代码等)
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

// --- 响应式状态 ---
const terminalContainer = ref(null);
const state = reactive({
  cols: 0,
  isResizing: false
});

let term = null;
let fitAddon = null;
let debounceTimer = null;
const logHistory = []; // 原始日志存储桶

// --- 核心逻辑：带颜色与宽度的格式化函数 ---

/**
 * 将原始日志文本根据当前宽度重新计算折行和缩进
 * @param {string} rawText 原始文本（含颜色代码）
 * @param {number} cols 目标列数
 */
const formatLogContent = (rawText, cols) => {
  const indentStr = ' '.repeat(CONFIG.indentSize);
  let result = CONFIG.prompt;
  
  // 初始宽度：计算 prompt 的视觉宽度 (去掉 ANSI 后的长度)
  let currentX = CONFIG.prompt.replace(ANSI_REGEX, '').length;

  // 1. 将文本拆分为 ANSI 代码片段和普通文字片段
  const parts = rawText.split(/(\x1b\[[0-9;]*[a-zA-Z])/);

  for (const part of parts) {
    if (ANSI_REGEX.test(part)) {
      // 如果是样式代码，直接累加，不计入宽度
      result += part;
    } else {
      // 如果是普通文字，逐字符处理
      for (const char of part) {
        // 判断中英文宽度：中文/全角 2，英文/半角 1
        const charWidth = /[^\x00-\xff]/.test(char) ? 2 : 1;

        // 阈值检测：当前行放不下了
        if (currentX + charWidth > (cols - CONFIG.threshold)) {
          result += '\r\n' + indentStr;
          currentX = CONFIG.indentSize;
        }
        
        result += char;
        currentX += charWidth;
      }
    }
  }
  return result;
};

// --- 功能方法 ---

/**
 * 写入单条日志
 */
const appendLog = (message) => {
  if (!term) return;
  
  // 1. 存入历史记录
  logHistory.push(message);
  if (logHistory.length > CONFIG.maxHistory) {
    logHistory.shift();
  }

  // 2. 格式化并写入终端
  const formatted = formatLogContent(message, term.cols);
  term.writeln(formatted);
};

/**
 * 执行全量重绘（用于窗口缩放后）
 */
const redrawAll = () => {
  if (!term) return;
  
  term.clear();
  const cols = term.cols;
  state.cols = cols;

  // 重新计算并写入所有历史
  logHistory.forEach(msg => {
    term.writeln(formatLogContent(msg, cols));
  });
  
  state.isResizing = false;
};

/**
 * 防抖 Resize 处理
 */
const handleResize = () => {
  state.isResizing = true;
  
  // 立即调整容器物理大小
  if (fitAddon) fitAddon.fit();

  // 延迟执行重排计算
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    redrawAll();
  }, CONFIG.debounceWait);
};

// --- 模拟数据生成 ---
const generateDemoLog = () => {
  const messages = [
    `系统于 ${new Date().toLocaleTimeString()} 启动成功。`,
    `DEBUG: \x1b[35m[NetWork]\x1b[0m 正在请求 \x1b[4;34mhttps://api.example.com/v1/update/logs/streaming\x1b[0m 并等待响应。`,
    `警告: 这是一个中英文混合的超长日志，为了测试我们在窗口宽度变窄时，系统是否能正确识别中文字符占两个格子的特性并进行 \x1b[33mIndent(缩进)\x1b[0m 处理。`,
    `ERROR: \x1b[31mFailed to load resource\x1b[0m. 堆栈轨迹: /root/server/node_modules/library/dist/index.js:104:22.`
  ];
  appendLog(messages[Math.floor(Math.random() * messages.length)]);
};

const clearLogs = () => {
  logHistory.length = 0;
  term.clear();
};

// --- 生命周期 ---
onMounted(() => {
  term = new Terminal({
    fontSize: CONFIG.fontSize,
    lineHeight: CONFIG.lineHeight,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1a1a1a',
      foreground: '#d4d4d4',
      cursor: '#4fc3f7'
    },
    disableStdin: true,
    scrollback: CONFIG.maxHistory
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  
  if (terminalContainer.value) {
    term.open(terminalContainer.value);
    fitAddon.fit();
    state.cols = term.cols;
  }

  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (debounceTimer) clearTimeout(debounceTimer);
  term?.dispose();
});
</script>

<style scoped>
.terminal-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 600px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: #2d2d2d;
  color: #ccc;
  font-size: 13px;
  border-bottom: 1px solid #3d3d3d;
}

.re-render-hint {
  margin-left: 15px;
  color: #4fc3f7;
  animation: blink 1s infinite;
}

@keyframes blink {
  50% { opacity: 0.5; }
}

.terminal-box {
  flex: 1;
  width: 100%;
  padding: 10px;
}

/* 按钮样式 */
.btn {
  padding: 5px 12px;
  border: 1px solid #444;
  background: #3c3c3c;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 8px;
  font-size: 12px;
  transition: all 0.2s;
}

.btn:hover { background: #4a4a4a; }
.btn.primary { background: #007acc; border-color: #007acc; }
.btn.primary:hover { background: #008ae6; }

/* 滚动条美化 */
:deep(.xterm-viewport::-webkit-scrollbar) {
  width: 10px;
}
:deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: #333;
  border-radius: 5px;
}
:deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background: #444;
}
</style>
