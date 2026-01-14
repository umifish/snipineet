<template>
  <div class="terminal-wrapper">
    <div class="status-bar">
      <div class="info">
        <span :class="{ 'warning-text': isNarrow }">容器宽度: {{ state.containerWidth }}px</span>
        <span class="divider">|</span>
        <span>终端列数: {{ state.cols }}</span>
        <span v-if="isNarrow" class="mode-tag">窄屏模式</span>
      </div>
      <div class="actions">
        <button @click="addDemoLog" class="btn primary">写入测试日志</button>
        <button @click="clearLogs" class="btn">清空</button>
      </div>
    </div>

    <div class="terminal-body" ref="resizeBox">
      <div ref="terminalContainer" class="terminal-box"></div>
      
      <Transition name="fade">
        <div v-if="state.isLocked" class="loading-overlay">
          <div class="loader"></div>
          <p>正在重排日志布局 ({{ state.progress }}%)</p>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive, computed } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

/**
 * 业务配置常量
 */
const CONFIG = {
  // 推荐等宽字体，确保在 Mac/Win 上均有良好表现
  fontFamily: 'Menlo, Monaco, "Courier New", "Cascadia Code", "Microsoft YaHei", monospace',
  fontSize: 14,
  rightThreshold: 5,   // 换行预留列数
  widthThreshold: 640, // 窄屏阈值
  debounceWait: 200,   // 防抖延迟
  chunkSize: 50,       // 异步重绘时每帧处理的行数
  maxHistory: 1000     // 缓冲区保留的最大原始日志行数
};

// --- 响应式状态 ---
const terminalContainer = ref(null);
const resizeBox = ref(null);
const state = reactive({
  cols: 0,
  containerWidth: 0,
  isLocked: false,
  progress: 0
});

let term = null;
let fitAddon = null;
let debounceTimer = null;
let currentTaskId = 0; // 用于取消已过时的异步重绘任务
let logHistory = [];   // 核心：原始日志存储桶

const isNarrow = computed(() => state.containerWidth < CONFIG.widthThreshold);

// --- 核心算法部分 ---

/**
 * 计算字符串的可视列宽度 (过滤 ANSI，支持中英混合)
 */
const getVisibleWidth = (str) => {
  const clean = str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  let width = 0;
  for (const char of clean) {
    width += /[^\x00-\xff]/.test(char) ? 2 : 1;
  }
  return width;
};

/**
 * 格式化单行日志：动态计算前缀宽度并处理挂起缩进
 * 格式示例：2026-01-15 [service] user [LEVEL] Message
 */
const formatLogLine = (rawLine, cols) => {
  // 1. 寻找前缀结束位置 (以最后一个 "] " 为准)
  const lastBracketIndex = rawLine.lastIndexOf('] ');
  let prefixEndIndex = lastBracketIndex !== -1 ? lastBracketIndex + 2 : 0;

  const prefix = rawLine.substring(0, prefixEndIndex);
  const message = rawLine.substring(prefixEndIndex);

  const indentWidth = getVisibleWidth(prefix);
  const indentStr = ' '.repeat(indentWidth);
  
  let result = prefix;
  let currentX = indentWidth;
  let activeAnsi = ''; // 记录当前的 ANSI 颜色/样式状态

  // 2. 遍历 Message，处理自动换行与缩进对齐
  const parts = message.split(/(\x1b\[[0-9;]*[a-zA-Z])/);
  for (const part of parts) {
    if (!part) continue;
    
    if (part.startsWith('\x1b[')) {
      // 更新当前的颜色状态
      if (part === '\x1b[0m') activeAnsi = '';
      else activeAnsi = part;
      result += part;
    } else {
      for (const char of part) {
        const charWidth = /[^\x00-\xff]/.test(char) ? 2 : 1;
        
        // 阈值判断：如果当前行空间不足
        if (currentX + charWidth > (cols - CONFIG.rightThreshold)) {
          // 逻辑：重置样式 -> 换行 -> 缩进 -> 恢复之前的颜色样式
          result += `\x1b[0m\r\n${indentStr}${activeAnsi}`;
          currentX = indentWidth;
        }
        result += char;
        currentX += charWidth;
      }
    }
  }
  return result;
};

// --- 渲染逻辑 ---

/**
 * 异步重绘引擎：防止海量日志重绘导致 UI 卡死
 */
const performAsyncRedraw = async (taskId) => {
  if (!term || logHistory.length === 0) {
    state.isLocked = false;
    return;
  }

  term.clear();
  const currentCols = term.cols;
  const total = logHistory.length;

  for (let i = 0; i < total; i += CONFIG.chunkSize) {
    // 检查是否有新的 Resize 任务介入，若有则立即终止当前旧任务
    if (taskId !== currentTaskId) return;

    const chunk = logHistory.slice(i, i + CONFIG.chunkSize);
    let buffer = '';
    
    chunk.forEach(msg => {
      buffer += formatLogLine(msg, currentCols) + '\r\n';
    });
    
    term.write(buffer);
    state.progress = Math.round(((i + chunk.length) / total) * 100);

    // 每一帧渲染后让出主线程，保持浏览器响应
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  
  state.isLocked = false;
  state.progress = 0;
};

/**
 * 处理容器大小变化
 */
const handleResize = () => {
  if (!resizeBox.value) return;
  
  // 更新状态
  state.containerWidth = resizeBox.value.clientWidth;
  
  // 调整 xterm 网格
  if (fitAddon) {
    fitAddon.fit();
    state.cols = term.cols;
  }
  
  // 准备重绘
  state.isLocked = true;
  currentTaskId++; // 生成新的任务ID
  
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    performAsyncRedraw(currentTaskId);
  }, CONFIG.debounceWait);
};

// --- 公开方法 ---

/**
 * 写入单条日志
 */
const appendLog = (msg) => {
  logHistory.push(msg);
  // 维护缓冲区大小
  if (logHistory.length > CONFIG.maxHistory) {
    logHistory.shift();
  }
  
  // 如果当前不在重绘锁定状态，则直接实时显示
  if (!state.isLocked && term) {
    term.writeln(formatLogLine(msg, term.cols));
  }
};

/**
 * 模拟生成复杂日志
 */
const addDemoLog = () => {
  const time = new Date().toISOString().replace('T', ' ').split('.')[0];
  const msg = `${time} [ws-logger-service] admin [\x1b[31mERROR\x1b[0m] 这是一个检测自动重排和挂起缩进的测试日志。其包含 \x1b[32m彩色文本样式\x1b[0m 以及混合的中英文字符。当窗口宽度变窄时，换行内容会精准对齐到前缀结束位置。`;
  appendLog(msg);
};

/**
 * 清空控制台
 */
const clearLogs = () => {
  logHistory.length = 0;
  term?.clear();
};

// --- 生命周期 ---

let resizeObserver = null;

onMounted(async () => {
  // 确保等宽字体已加载，以免测量不准
  if (document.fonts) await document.fonts.ready;

  // 1. 初始化终端
  term = new Terminal({
    fontFamily: CONFIG.fontFamily,
    fontSize: CONFIG.fontSize,
    lineHeight: 1.1,
    theme: {
      background: '#1a1a1a',
      foreground: '#d4d4d4',
      cursor: '#4fc3f7'
    },
    disableStdin: true,
    scrollback: 0 // 由于我们自己维护 logHistory，xterm 的内置滚动可以设小或不依赖
  });

  // 2. 加载插件
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  
  // 3. 打开终端
  if (terminalContainer.value) {
    term.open(terminalContainer.value);
    
    // 4. 使用 ResizeObserver 监听容器尺寸
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(resizeBox.value);
    
    // 初始化执行一次
    handleResize();
  }
});

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (debounceTimer) clearTimeout(debounceTimer);
  currentTaskId++; // 中断可能的渲染任务
  term?.dispose();
});
</script>

<style scoped>
/* 整体容器 */
.terminal-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 600px; /* 可根据需要调整高度 */
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* 状态栏 */
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #252525;
  color: #888;
  font-size: 12px;
  border-bottom: 1px solid #333;
  z-index: 5;
}

.warning-text { color: #ffa500; font-weight: bold; }
.mode-tag {
  margin-left: 10px;
  background: #4a3712;
  color: #ffaa00;
  padding: 2px 6px;
  border-radius: 4px;
}
.divider { margin: 0 10px; color: #444; }

/* 终端主体 */
.terminal-body {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.terminal-box {
  width: 100%;
  height: 100%;
  padding: 8px;
}

/* 覆盖加载遮罩 */
.loading-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #4fc3f7;
  backdrop-filter: blur(3px);
  z-index: 100;
}

.loader {
  border: 2px solid #333;
  border-top: 2px solid #4fc3f7;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin { 100% { transform: rotate(360deg); } }

/* 按钮 */
.btn {
  padding: 5px 12px;
  background: #3c3c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.2s;
}
.btn.primary { background: #007acc; }
.btn:hover { background: #4a4a4a; }
.btn.primary:hover { background: #008ae6; }

/* 动画过渡 */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 美化 xterm 滚动条 */
:deep(.xterm-viewport::-webkit-scrollbar) { width: 10px; }
:deep(.xterm-viewport::-webkit-scrollbar-thumb) { background: #333; border-radius: 5px; }
:deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) { background: #444; }
</style>
