<template>
    <div class="terminal-wrapper">
      
      <div class="control-bar">
        <div class="filter-group">
          <select class="level-select" v-model="levelFilter">
            <option :value="null">所有级别</option>
            <option value="ERROR">ERROR 🔴</option>
            <option value="WARN">WARN 🟠</option>
            <option value="INFO">INFO 🟢</option>
            <option value="DEBUG">DEBUG 🔵</option>
          </select>
  
          <label class="checkbox-item filter-checkbox">
            <input 
              type="checkbox" 
              :checked="isFiltered" 
              @change="handleFilterToggle" 
              title="只显示当前用户 (admin) 的日志，切换会重绘终端"
            />
            <span>👤 只看我的 ({{ CURRENT_USER }})</span>
          </label>
        </div>
  
        <div class="action-group">
          <label class="checkbox-item" v-if="isLiveMode" title="有新日志时自动滚动到底部">
            <input type="checkbox" v-model="autoScroll" />
            <span>锁定底部</span>
          </label>
          
          <div class="divider"></div>
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
  
      <div class="header">
        <div class="left-panel">
          <div 
              class="status-dot" 
              :class="{ 
                  live: isPolling && isLiveMode, 
                  history: isPolling && !isLiveMode 
              }"
          ></div>
          <span class="title">
            {{ isPolling ? (isLiveMode ? '实时监控' : '历史回溯') : '已暂停' }}
          </span>
          <span class="meta-info">
            显示: {{ currentRangeText }} / 过滤后总数: {{ store.filteredCount }} / 缓存: {{ store.totalCount }}
          </span>
        </div>
      </div>
  
      <div class="timeline-bar" v-if="store.filteredCount > 0 || store.totalCount === 0">
        <span class="time-label">
          <span v-if="store.isFetchingHistory" class="loading-status">⏳ 正在加载历史...</span>
          <button 
              v-else-if="store.hasMoreHistory && viewportStart === 0" 
              @click="loadMoreHistory" 
              class="btn-load-history" 
              title="加载当前缓存中最旧日志之前的数据"
          >
              加载更旧历史
          </button>
          
          <span v-else-if="!store.hasMoreHistory && viewportStart === 0" class="no-more-history">📜 已加载到最旧</span>
          <span v-else>最旧</span>
        </span>
        
        <input 
          v-if="isSliderNeeded"
          type="range" 
          min="0" 
          :max="maxSliderValue" 
          v-model.number="viewportStart"
          @input="handleSliderInteraction" 
          @change="renderWindow"         
          class="history-slider"
        />
        
        <div v-else class="slider-placeholder"></div>
  
        <span class="time-label">最新</span>
      </div>
  
      <div class="column-header">
          <span class="col-timestamp">Timestamp</span>
          <span class="col-service">Service Name</span>
          <span class="col-user">User</span>
          <span class="col-level">Level</span>
          <span class="col-message">Message</span>
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
  let wheelListener: ((e: WheelEvent) => void) | null = null; 
  
  // === 常量 ===
  const TERMINAL_SIZE = 2000;
  const CURRENT_USER = 'admin'; 
  const SCROLL_THRESHOLD = 3; 
  
  // 浅色主题配置：Xterm 主题颜色
  const LOG_TERMINAL_CONFIG = {
      scrollback: TERMINAL_SIZE,           
      disableStdin: true,           
      convertEol: true,             
      rendererType: 'canvas',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, monospace',
      theme: {
          background: '#FFFFFF',          
          foreground: '#333333',          
          cursor: '#333333',              
          red: '#C82828',                 
          yellow: '#DE935F',              
          green: '#718C00',               
          cyan: '#4271AE',                
          magenta: '#8959A8',             
          brightBlack: '#666666',         
      }
  };
  
  
  // === 状态 ===
  const isPolling = ref(true); 
  const autoScroll = ref(true); 
  const viewportStart = ref(0);   
  let pollingInterval: number | null = null;
  const levelFilter = ref<string | null>(null); 
  
  // === 计算属性 ===
  const maxSliderValue = computed(() => Math.max(0, store.filteredCount - TERMINAL_SIZE));
  const isSliderNeeded = computed(() => maxSliderValue.value > 0); 
  const isLiveMode = computed(() => { return viewportStart.value >= maxSliderValue.value - 1; });
  const missedLogsCount = computed(() => {
    if (isLiveMode.value) return 0; 
    const endOfCurrentView = viewportStart.value + TERMINAL_SIZE;
    return Math.max(0, store.filteredCount - endOfCurrentView);
  });
  const currentRangeText = computed(() => {
    const start = Math.max(0, viewportStart.value);
    const end = Math.min(start + TERMINAL_SIZE, store.filteredCount); 
    return `${start}-${end}`;
  });
  const isFiltered = computed(() => store.userIdFilter === CURRENT_USER);
  
  // === Xterm/渲染/锚定逻辑 ===
  const initTerminal = () => {
    if (!terminalRef.value) return;
    
    term = new Terminal(LOG_TERMINAL_CONFIG);
    
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new CanvasAddon());
    term.open(terminalRef.value);
    fitAddon.fit();
    
    term.onScroll(() => {
        if (!term || !isLiveMode.value) return; 
        const baseScroll = term.buffer.active.baseY;
        const viewportScroll = term.buffer.active.viewportY;
        const isAtBottom = viewportScroll >= baseScroll - SCROLL_THRESHOLD;
        if (isAtBottom && !autoScroll.value) {
            autoScroll.value = false;
        } 
    });
    
    const terminalDom = term.element;
    
    if (terminalDom) {
        wheelListener = (e: WheelEvent) => {
            if (e.deltaY < 0 && autoScroll.value && isLiveMode.value) {
                autoScroll.value = false;
            }
        };
        terminalDom.addEventListener('wheel', wheelListener);
    }
  };
  
  const renderWindow = () => {
    if (!term) return;
    
    const logsToRender = store.getLogSlice(viewportStart.value, TERMINAL_SIZE);
  
    term.clear();
    
    const separator = '-'.repeat(term.cols);
    term.writeln(`\x1b[90m${separator}\x1b[0m`);
  
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
  
  
  // === 交互处理 - 过滤器 ===
  
  const handleFilterToggle = () => {
      if (isFiltered.value) {
          store.setUserIdFilter(null);
      } else {
          store.setUserIdFilter(CURRENT_USER);
      }
  };
  
  watch(levelFilter, (newLevel) => {
      store.setLevelFilter(newLevel);
      returnToLiveMode(); 
  });
  
  
  // === 交互处理 - 历史加载逻辑 ===
  const loadMoreHistory = async () => {
      if (!store.hasMoreHistory) return;
  
      const logs = store.filteredLogs;
      const currentAnchorId = logs.length > 0 && viewportStart.value < logs.length
                              ? logs[viewportStart.value].id 
                              : null;
  
      const logsAddedCount = await store.fetchOlderLogs();
  
      if (logsAddedCount > 0) {
          const newLogs = store.filteredLogs;
          
          if (currentAnchorId) {
              const newAnchorIndex = newLogs.findIndex(log => log.id === currentAnchorId);
  
              if (newAnchorIndex !== -1) {
                  viewportStart.value = newAnchorIndex;
              } else {
                   viewportStart.value = logsAddedCount; 
              }
          } else {
               viewportStart.value = 0; 
          }
  
          renderWindow();
      }
  };
  
  const handleSliderInteraction = () => {
    autoScroll.value = false;
  };
  
  
  // === 清除逻辑 ===
  const clearView = () => {
    store.clearAllLogs(); 
    term?.clear();
  };
  
  
  // 监听过滤条件变化，并重置视图 
  watch(() => [store.userIdFilter, store.levelFilter], () => {
      returnToLiveMode(); 
  });
  
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
        const itemsToRender = newItems
          .filter(item => store.userIdFilter ? item.userId === store.userIdFilter : true)
          .filter(item => store.levelFilter ? item.level === store.levelFilter : true);
        
        itemsToRender.forEach(item => term?.writeln(item.formattedMsg));
        
        if (autoScroll.value) {
            term.scrollToBottom();
        }
      }
    } 
  };
  
  // 轮询控制和生命周期
  const startPolling = () => {
      if (pollingInterval) return;
      
      isPolling.value = true;
      returnToLiveMode(); 
  
      runCycle(); 
      pollingInterval = window.setInterval(runCycle, 2000); 
  };
  
  const stopPolling = () => { 
      if (pollingInterval) clearInterval(pollingInterval); 
      pollingInterval = null; 
      isPolling.value = false;
  };
  
  const togglePolling = () => isPolling.value ? stopPolling() : startPolling();
  
  const onResize = () => {
    fitAddon?.fit();
    renderWindow(); 
  };
  
  
  onMounted(() => {
    initTerminal();
    startPolling(); 
    window.addEventListener('resize', onResize);
  });
  
  onUnmounted(() => {
    if (pollingInterval) clearInterval(pollingInterval);
    window.removeEventListener('resize', onResize);
    
    if (term && term.element && wheelListener) {
        term.element.removeEventListener('wheel', wheelListener as EventListener);
    }
    
    term?.dispose();
  });
  </script>
  
  <style scoped>
  /* ---------------------------------------------------- */
  /* 样式 */
  /* ---------------------------------------------------- */
  
  .terminal-wrapper { 
      display: flex; flex-direction: column; width: 100%; height: 600px; 
      background-color: #F5F5F5; 
      border-radius: 8px; overflow: hidden; 
      border: 1px solid #E0E0E0; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  }
  
  .control-bar {
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      padding: 8px 16px; 
      background-color: #E8E8E8; 
      border-bottom: 1px solid #E0E0E0; 
      user-select: none; 
      color: #333333;
      font-size: 13px;
  }
  
  .filter-group, .action-group {
      display: flex; 
      align-items: center; 
      gap: 12px;
  }
  
  .header { 
      display: flex; 
      justify-content: flex-start; 
      align-items: center; 
      padding: 8px 16px; 
      background-color: #FFFFFF; 
      border-bottom: 1px solid #E0E0E0; 
      user-select: none; 
      color: #333333;
      gap: 12px;
  }
  
  .status-dot { 
      display: inline-block;
      margin-right: 4px;
      width: 8px; 
      height: 8px; 
      border-radius: 50%; 
      background-color: #999; /* 默认：暂停 (Paused) */
      transition: all 0.3s; 
  }
  .status-dot.live { 
      background-color: #4CAF50; /* Green */
      box-shadow: 0 0 8px rgba(76, 175, 80, 0.4); 
  }
  .status-dot.history { 
      background-color: #FF9800; /* Orange/Amber */
      box-shadow: 0 0 8px rgba(255, 152, 0, 0.4); 
  }
  
  .title { font-weight: 600; color: #111111; font-size: 14px; }
  .meta-info { color: #666666; font-size: 12px; }
  .divider { width: 1px; height: 16px; background-color: #CCCCCC; } 
  
  .log-gap-warning {
      color: #EF6C00; 
      font-weight: 500;
      margin-left: 8px;
  }
  
  .checkbox-item { display: flex; align-items: center; gap: 6px; color: #333333; font-size: 12px; cursor: pointer; transition: color 0.2s;}
  .filter-checkbox { color: #039BE5; } 
  .filter-checkbox input:checked + span { font-weight: bold; } 
  
  button { cursor: pointer; border: none; outline: none; }
  .btn-icon { background: transparent; font-size: 16px; padding: 4px; border-radius: 4px; color: #555; }
  .btn-icon:hover { background-color: #E0E0E0; }
  
  .btn-action { font-size: 12px; padding: 5px 16px; border-radius: 4px; color: white; font-weight: 500; }
  .btn-action.start { background-color: #4CAF50; } 
  .btn-action.stop { background-color: #E53935; } 
  
  .level-select {
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid #CCCCCC;
      background-color: #FFFFFF; 
      color: #333333;
      font-size: 12px;
      min-width: 80px; 
  }
  
  .level-select:focus {
      border-color: #409eff;
      outline: none;
  }
  
  .column-header {
      display: flex;
      background-color: #F5F5F5; 
      border-top: 1px solid #E0E0E0; 
      font-family: 'Menlo, Monaco, monospace';
      font-size: 13px;
      line-height: 1.5; 
      color: #555555; 
      white-space: nowrap;
      padding: 0 0 0 8px; 
      user-select: none;
      font-weight: bold;
  }
  
  .column-header > span {
      display: inline-block;
      padding-right: 1ch; 
  }
  .col-timestamp { min-width: 10ch; } 
  .col-service { min-width: 12ch; color: #8959A8; } 
  .col-user { min-width: 12ch; color: #4271AE; } 
  .col-level { min-width: 6ch; } 
  .col-message { flex-grow: 1; color: #333333; padding-left: 1ch; } 
  
  .timeline-bar { 
      display: flex; align-items: center; justify-content: space-between; gap: 10px; 
      padding: 8px 16px; 
      background: #EEEEEE; 
      border-bottom: 1px solid #E0E0E0; 
      user-select: none;
  }
  .time-label { color: #666; font-size: 12px; white-space: nowrap; display: flex; align-items: center; }
  .history-slider { flex: 1; cursor: pointer; height: 4px; }
  
  .slider-placeholder {
      flex: 1; 
      height: 4px; 
      border-radius: 2px;
      background-color: #DDDDDD; 
  }
  
  .loading-status { color: #EF6C00; font-weight: bold; } 
  .no-more-history { color: #888; }
  
  .btn-load-history { background-color: #42A5F5; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; transition: background 0.2s;}
  .btn-load-history:hover { background-color: #2196F3; }
  
  
  .term-box { 
      flex: 1; 
      position: relative; 
      overflow: hidden; 
      padding: 0 0 0 8px; 
      background-color: #FFFFFF; 
  } 
  .xterm-container { width: 100%; height: 100%; }
  
  .resume-btn { 
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); 
    background-color: #FFA000; color: #333; padding: 8px 24px; border-radius: 20px; 
    font-size: 13px; cursor: pointer; font-weight: bold; 
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); z-index: 20; 
  }
  
  .fade-enter-active, .fade-leave-active { transition: opacity 0.3s, transform 0.3s; }
  .fade-enter-from { opacity: 0; transform: translateX(-50%) scale(0.8); }
  .fade-leave-to { opacity: 0; transform: translateX(-50%) scale(0.8); }
  </style>