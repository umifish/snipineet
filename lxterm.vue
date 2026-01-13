<template>
  <div class="terminal-wrapper">
    <div class="status-bar">
      <div class="info">
        <span :class="{ 'error-text': !state.isFontSafe }">
          字体状态: {{ state.isFontSafe ? '标准等宽' : '非等宽(警告)' }}
        </span>
        <span class="divider">|</span>
        <span>列数: {{ state.cols }}</span>
      </div>
      <div class="actions">
        <button @click="generateDemoLog" class="btn primary">生成彩色日志</button>
        <button @click="clearLogs" class="btn">清空</button>
      </div>
    </div>

    <div class="terminal-body">
      <div ref="terminalContainer" class="terminal-box"></div>
      
      <Transition name="fade">
        <div v-if="state.isLoading" class="loading-overlay">
          <div class="loader"></div>
          <p>正在优化重排布局 {{ state.progress }}%</p>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// --- 全局配置 ---
const CONFIG = {
  // 推荐字体序列：包含 Mac、Windows 常用等宽及中文字体
  fontFamily: 'Menlo, Monaco, "Courier New", "Cascadia Code", "Microsoft YaHei", monospace',
  fontSize: 14,
  threshold: 6,         // 缓冲区
  indentSize: 8,        // 换行缩进
  debounceWait: 300,    // 重绘防抖
  chunkSize: 60,        // 分片渲染行数
  maxHistory: 1000,     // 最大历史记录
};

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

const terminalContainer = ref(null);
const state = reactive({
  cols: 0,
  isLoading: false,
  isFontSafe: true,
  progress: 0
});

let term = null;
let fitAddon = null;
let debounceTimer = null;
let isInterrupted = false;
const logHistory = [];

// --- 工具函数：字体等宽检测 ---
/**
 * 检测当前浏览器渲染该字体是否为真等宽
 */
const checkMonospace = (fontStr, size) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${size}px ${fontStr}`;
  const wI = ctx.measureText("i").width;
  const wW = ctx.measureText("W").width;
  const wCn = ctx.measureText("中").width;
  // 1. 英文等宽 2. 中文宽度约为英文两倍
  return wI === wW && Math.abs(wCn - (wI * 2)) < 0.2;
};

// --- 核心逻辑：格式化日志 ---
const formatLog = (rawText, cols) => {
  const indentStr = ' '.repeat(CONFIG.indentSize);
  let result = '\x1b[1;32m[LOG]\x1b[0m '; // 模拟前缀
  let currentX = 6; 

  const parts = rawText.split(/(\x1b\[[0-9;]*[a-zA-Z])/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('\x1b[')) {
      result += part;
    } else {
      for (const char of part) {
        const charWidth = /[^\x00-\xff]/.test(char) ? 2 : 1;
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

// --- 异步重绘任务 ---
const performAsyncRedraw = async (cols) => {
  if (!term) return;
  term.clear();
  isInterrupted = false;
  const total = logHistory.length;
  
  for (let i = 0; i < total; i += CONFIG.chunkSize) {
    if (isInterrupted) return; // 如果期间触发了新的 Resize，中断旧任务

    const chunk = logHistory.slice(i, i + CONFIG.chunkSize);
    let buffer = '';
    chunk.forEach(msg => {
      buffer += formatLog(msg, cols) + '\r\n';
    });
    
    term.write(buffer);
    state.progress = Math.round(((i + chunk.length) / total) * 100);
    // 每一帧渲染后让出主线程
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  
  state.isLoading = false;
  state.progress = 0;
};

// --- 事件处理 ---
const handleResize = () => {
  if (fitAddon) fitAddon.fit();
  state.cols = term.cols;
  
  isInterrupted = true; // 中断当前渲染
  state.isLoading = true;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    performAsyncRedraw(term.cols);
  }, CONFIG.debounceWait);
};

const appendLog = (message) => {
  logHistory.push(message);
  if (logHistory.length > CONFIG.maxHistory) logHistory.shift();
  
  if (!state.isLoading && term) {
    term.write(formatLog(message, term.cols) + '\r\n');
  }
};

// --- 初始化 ---
onMounted(async () => {
  // 1. 等待字体加载
  if (document.fonts) await document.fonts.ready;
  
  // 2. 校验字体
  state.isFontSafe = checkMonospace(CONFIG.fontFamily, CONFIG.fontSize);

  // 3. 初始化 xterm
  term = new Terminal({
    fontFamily: CONFIG.fontFamily,
    fontSize: CONFIG.fontSize,
    lineHeight: 1.1,
    theme: { background: '#1a1a1a', foreground: '#d4d4d4' },
    disableStdin: true
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
  isInterrupted = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  term?.dispose();
});

// --- 测试 ---
const generateDemoLog = () => {
  const samples = [
    "数据处理成功: [ID: 9928] 正在将资源 /assets/images/header_bg.png 同步至远程节点，请检查网络状态是否稳定。",
    "\x1b[33m[WARN]\x1b[0m 发现非法请求头 User-Agent，系统已自动拦截。来源IP: 127.0.0.1 (本地回环测试)",
    "这是一条中英文 Mixed 内容，测试在屏幕宽度不足时是否能按照 8 个空格的缩进进行自动换行。"
  ];
  appendLog(samples[Math.floor(Math.random() * samples.length)]);
};

const clearLogs = () => {
  logHistory.length = 0;
  term?.clear();
};
</script>

<style scoped>
.terminal-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 600px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  font-family: sans-serif;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  padding: 10px 15px;
  background: #252525;
  color: #999;
  font-size: 12px;
  border-bottom: 1px solid #333;
}

.info { display: flex; align-items: center; }
.divider { margin: 0 10px; color: #444; }
.error-text { color: #ff5555; font-weight: bold; }

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

.loading-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.75);
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
  width: 28px;
  height: 28px;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin { 100% { transform: rotate(360deg); } }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.btn {
  padding: 4px 12px;
  background: #444;
  color: #eee;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 8px;
  font-size: 12px;
}
.btn.primary { background: #007acc; }
.btn:hover { filter: brightness(1.2); }

/* xterm 滚动条美化 */
:deep(.xterm-viewport::-webkit-scrollbar) { width: 8px; }
:deep(.xterm-viewport::-webkit-scrollbar-thumb) { background: #333; border-radius: 4px; }
</style>
