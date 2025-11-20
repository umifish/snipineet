<template>
    <div class="terminal-wrapper">
      <div class="header">
        <div class="left-panel">
          <div class="status-dot" :class="{ active: isPolling && isLiveMode }"></div>
          <span class="title">
            {{ isPolling ? (isLiveMode ? '🟢 实时监控' : '🟠 历史回溯') : '⏸️ 已暂停' }}
          </span>
          <span class="meta-info">
            显示: {{ currentRangeText }} / 总缓存: {{ store.totalCount }}
          </span>
        </div>
  
        <div class="right-panel">
          <label class="checkbox-item filter-checkbox">
            <input 
              type="checkbox" 
              v-model="onlyShowMine" 
              @change="handleFilterChange"
              :disabled="!isLiveMode && store.totalCount > TERMINAL_SIZE" 
              title="只显示当前用户 (admin) 的日志，切换会重绘终端"
            />
            <span>👤 只看我的 ({{ CURRENT_USER }})</span>
          </label>
          
          <div class="divider"></div>
  
          <label class="checkbox-item" v-if="isLiveMode" title="有新日志时自动滚动到底部">
            <input type="checkbox" v-model="autoScroll" />
            <span>锁定底部</span>
          </label>
  
          <button @click="store.exportAllLogs" class="btn-icon" title="下载所有日志">💾</button>
          <button @click="clearView" class="btn-icon" title="清屏">🧹</button>
          
          <button 
            @click="togglePolling" 
            class="btn-action"
            :class="isPolling ? 'stop' : 'start'"
          >
            {{ isPolling ? '停止' : '开始' }}
          </button>
        </div>
      </div>
  
      <div class="timeline-bar" v-if="store.totalCount > TERMINAL_SIZE">
        <span class="time-label">最旧</span>
        <input 
          type="range" 
          min="0" 
          :max="maxSliderValue" 
          v-model.number="viewportStart"
          @input="handleSliderInteraction"
          @change="renderWindow"
          class="history-slider"
        />
        <span class="time-label">最新</span>
      </div>
  
      <div class="term-box">
        <div ref="terminalRef" class="xterm-container"></div>
        
        <transition name="fade">
          <div v-if="!isLiveMode && missedLogsCount > 0" class="resume-btn" @click="returnToLiveMode">
            ⏩ 回到最新 (跳过 {{ missedLogsCount }} 条新日志)
          </div>
        </transition>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { useLogStore, type LogItem } from '../stores/logStore';
  import { CanvasAddon } from '@xterm/addon-canvas';

  const store = useLogStore();
  
  const terminalRef = ref<HTMLElement | null>(null);
  let term: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  // --- 关键修复：存储滚轮监听器，以便在卸载时移除 ---
  let wheelListener: ((e: WheelEvent) => void) | null = null; 
  
  // === 常量 ===
  const TERMINAL_SIZE = 2000;
  const CURRENT_USER = 'admin'; 
  const SCROLL_THRESHOLD = 3; // 滚动阈值：3 行以内视为在底部
  
  // === Xterm 最佳配置 (Canvas) ===
  const LOG_TERMINAL_CONFIG = {
      // 性能配置
      scrollback: TERMINAL_SIZE, 
      disableStdin: true,         
      convertEol: true,           
      rendererType: 'canvas', 
      // 美观配置
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, monospace',
      theme: {
          background: '#1e1e1e', 
          foreground: '#d4d4d4', 
          cursor: '#cccccc',     
          red: '#f44747',
          yellow: '#ffd700',
          green: '#6a9955',
          cyan: '#4ec9b0',
          magenta: '#c586c0',
          brightBlack: '#666666',
      }
  };
  // ===========================================
  
  // === 状态 ===
  const isPolling = ref(false);
  const autoScroll = ref(true); 
  const onlyShowMine = ref(false); 
  const viewportStart = ref(0);   
  let pollingInterval: number | null = null;
  
  // === 计算属性 ===
  const maxSliderValue = computed(() => Math.max(0, store.totalCount - TERMINAL_SIZE));
  const isLiveMode = computed(() => { return viewportStart.value >= maxSliderValue.value - 1; });
  const missedLogsCount = computed(() => {
    if (isLiveMode.value) return 0; 
    const endOfCurrentView = viewportStart.value + TERMINAL_SIZE;
    return Math.max(0, store.totalCount - endOfCurrentView);
  });
  const currentRangeText = computed(() => {
    const start = Math.max(0, viewportStart.value);
    const end = Math.min(start + TERMINAL_SIZE, store.totalCount);
    return `${start}-${end}`;
  });
  
  
  // === Xterm 初始化 ===
  const initTerminal = () => {
    if (!terminalRef.value) return;
    
    term = new Terminal(LOG_TERMINAL_CONFIG);
    
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.value);
    term.loadAddon(new CanvasAddon());
    fitAddon.fit();
    
    // === 逻辑 1: 基于 Xterm.js Scroll 事件的自动滚动状态同步 (滚动到底部时重新开启) ===
    term.onScroll(() => {
        if (!term || !isLiveMode.value) return; 
  
        const baseScroll = term.buffer.active.baseY;
        const viewportScroll = term.buffer.active.viewportY;
        
        // 检查是否在底部阈值内
        const isAtBottom = viewportScroll >= baseScroll - SCROLL_THRESHOLD;
        
        if (isAtBottom && !autoScroll.value) {
            autoScroll.value = true;
        } 
    });
    
    // === 逻辑 2: 关键修复 - 直接监听 DOM 滚轮事件，实现灵敏的取消自动滚动 ===
    const terminalDom = term.element;
    
    if (terminalDom) {
        // 定义监听器函数
        wheelListener = (e: WheelEvent) => {
            // e.deltaY < 0 表示用户向上滚动
            // 如果正在自动滚动且在 Live Mode 下，立即取消自动滚动
            if (e.deltaY < 0 && autoScroll.value && isLiveMode.value) {
                autoScroll.value = false;
            }
        };
        // 添加监听器
        terminalDom.addEventListener('wheel', wheelListener);
    }
    // ======================================================================
  
    renderWindow();
  };
  
  const writeHeader = () => {
    if (!term) return;
    const separator = '-'.repeat(term.cols); 
  
    term.writeln(`\x1b[90m${separator}\x1b[0m`);
    term.writeln(
      '\x1b[1;37mTimestamp   \x1b[0m ' + 
      '\x1b[1;35mService Name  \x1b[0m ' + 
      '\x1b[1;36mUser          \x1b[0m ' + 
      '\x1b[1;37mLevel   \x1b[0m ' + 
      'Message'
    );
    term.writeln(`\x1b[90m${separator}\x1b[0m`);
  };
  
  
  // === 渲染/锚定逻辑 ===
  const renderWindow = () => {
    if (!term) return;
    
    const filterUser = onlyShowMine.value ? CURRENT_USER : null;
    const logsToRender = store.getLogSlice(viewportStart.value, TERMINAL_SIZE, filterUser);
  
    term.clear();
    writeHeader();
    logsToRender.forEach(item => term?.writeln(item.formattedMsg));
  
    if (isLiveMode.value && autoScroll.value) {
      term.scrollToBottom();
    }
  };
  
  const returnToLiveMode = () => {
    viewportStart.value = maxSliderValue.value;
    autoScroll.value = true;
    renderWindow(); 
  };
  
  
  // === 交互处理 ===
  const handleSliderInteraction = () => {
    // 手动操作滑动条，强制取消自动滚动
    autoScroll.value = false;
    renderWindow();
  };
  
  const handleFilterChange = () => {
    returnToLiveMode(); 
  };
  
  // === 清除逻辑 ===
  const clearView = () => {
    // 1. 清除底层数据 store
    store.clearAllLogs(); 
    
    // 2. 清除 Xterm 屏幕
    term?.clear();
    
    // 3. 重置筛选条件
    onlyShowMine.value = false;
    
    // 4. 重置 viewport 到 0，并调用 renderWindow 重新绘制空的头部
    returnToLiveMode(); 
  };
  
  
  watch(autoScroll, (newValue) => {
    if (newValue && isLiveMode.value) {
      term?.scrollToBottom();
    }
  });
  
  
  // === 轮询逻辑 ===
  const runCycle = async () => {
    const wasInLiveMode = isLiveMode.value; 
    const newItems: LogItem[] = await store.pullAndProcessLogs();
  
    if (wasInLiveMode) {
      viewportStart.value = maxSliderValue.value; 
  
      if (term && newItems.length > 0) {
        const filterUser = onlyShowMine.value ? CURRENT_USER : null;
        const itemsToRender = newItems
          .filter(item => filterUser ? item.userId === filterUser : true);
  
        itemsToRender.forEach(item => term?.writeln(item.formattedMsg));
        
        if (autoScroll.value) {
            term.scrollToBottom();
        }
      }
    } 
  };
  
  // 轮询控制和生命周期
  const startPolling = () => { if (pollingInterval) return; isPolling.value = true; runCycle(); pollingInterval = window.setInterval(runCycle, 2000); };
  const stopPolling = () => { if (pollingInterval) clearInterval(pollingInterval); pollingInterval = null; isPolling.value = false; };
  const togglePolling = () => isPolling.value ? stopPolling() : startPolling();
  
  const onResize = () => {
    fitAddon?.fit();
    renderWindow(); 
  };
  
  
  onMounted(() => {
    initTerminal();
    startPolling();
    // 全局事件：resize
    window.addEventListener('resize', onResize);
  });
  
  onUnmounted(() => {
    stopPolling();
    // 全局事件清理：resize
    window.removeEventListener('resize', onResize);
    
    // --- 关键清理：移除 Xterm.js 上的滚轮事件监听器 ---
    if (term && term.element && wheelListener) {
        term.element.removeEventListener('wheel', wheelListener as EventListener);
    }
    
    // 销毁 Xterm 实例
    term?.dispose();
  });
  </script>
  
  <style scoped>
  /* Terminal & Layout Styles */
  .terminal-wrapper { display: flex; flex-direction: column; width: 100%; height: 600px; background-color: #1e1e1e; border-radius: 8px; overflow: hidden; border: 1px solid #333; }
  .header { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background-color: #252526; border-bottom: 1px solid #333; user-select: none; color: #ccc;}
  .left-panel, .right-panel { display: flex; align-items: center; gap: 12px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #666; transition: all 0.3s; }
  .status-dot.active { background-color: #4caf50; box-shadow: 0 0 8px rgba(76, 175, 80, 0.6); }
  .title { font-size: 14px; font-weight: 600; }
  .meta-info { color: #858585; font-size: 12px; }
  .divider { width: 1px; height: 16px; background-color: #444; }
  
  /* Filter & Checkbox */
  .checkbox-item { display: flex; align-items: center; gap: 6px; color: #ccc; font-size: 12px; cursor: pointer; transition: color 0.2s;}
  .filter-checkbox { color: #64b5f6; } 
  .filter-checkbox input:checked + span { color: #42a5f5; font-weight: bold; }
  .filter-checkbox input:disabled { cursor: not-allowed; }
  .filter-checkbox input:disabled + span { opacity: 0.5; }
  
  /* Buttons */
  button { cursor: pointer; border: none; outline: none; }
  .btn-icon { background: transparent; font-size: 16px; padding: 4px; border-radius: 4px; color: #ccc; }
  .btn-icon:hover { background-color: #383838; }
  .btn-action { font-size: 12px; padding: 5px 16px; border-radius: 4px; color: white; font-weight: 500; }
  .btn-action.start { background-color: #238636; }
  .btn-action.stop { background-color: #da3633; }
  
  /* Timeline Bar (Slider) */
  .timeline-bar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; background: #2d2d2d; border-bottom: 1px solid #333; }
  .time-label { color: #888; font-size: 12px; white-space: nowrap;}
  .history-slider { flex: 1; cursor: pointer; height: 4px; }
  
  /* Terminal Box */
  .term-box { flex: 1; position: relative; overflow: hidden; padding: 4px 0 0 8px; }
  .xterm-container { width: 100%; height: 100%; }
  
  /* Resume Button (Time Machine) */
  .resume-btn { 
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); 
    background-color: #e6a23c; color: white; padding: 8px 24px; border-radius: 20px; 
    font-size: 13px; cursor: pointer; font-weight: bold; 
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6); z-index: 20; 
  }
  
  /* Fade Transition for Button */
  .fade-enter-active, .fade-leave-active { transition: opacity 0.3s, transform 0.3s; }
  .fade-enter-from { opacity: 0; transform: translateX(-50%) scale(0.8); }
  .fade-leave-to { opacity: 0; transform: translateX(-50%) scale(0.8); }
  </style>