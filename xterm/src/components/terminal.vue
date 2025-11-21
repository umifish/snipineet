<template>
    <div class="terminal-wrapper">
      
      <div class="control-bar">
        <div class="filter-row">
          <div class="input-group">
            <span class="label">模式:</span>
            <select class="mode-select" v-model="currentFilterMode">
              <option value="ALL">交集 (ALL)</option>
              <option value="NONE">无 (NONE)</option>
              <option value="LEVEL">仅 Level</option>
              <option value="GROUP_ID">仅 Group</option>
              <option value="CLIENT_ID">仅 Client</option>
              <option value="USER_ID">仅 User</option>
            </select>
          </div>
  
          <select 
              class="common-select" 
              v-model="levelFilter" 
              :disabled="!isFilterActive('LEVEL')"
              title="日志级别"
          >
            <option :value="null">Level: All</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
          </select>
  
          <input 
              type="text" 
              placeholder="Group ID" 
              class="common-input"
              v-model="groupIdFilter"
              :disabled="!isFilterActive('GROUP_ID')"
          >
  
          <input 
              type="text" 
              placeholder="Client ID" 
              class="common-input"
              v-model="clientIdFilter"
              :disabled="!isFilterActive('CLIENT_ID')"
          >
  
          <label class="checkbox-item filter-checkbox" :class="{ disabled: !isFilterActive('USER_ID') }">
            <input 
              type="checkbox" 
              :checked="isUserFiltered" 
              @change="handleUserFilterToggle" 
              :disabled="!isFilterActive('USER_ID')"
            />
            <span>User: Me ({{ CURRENT_USER }})</span>
          </label>
        </div>
  
        <div class="action-row">
          <div class="left-actions">
              <label class="checkbox-item" v-if="isLiveMode && isPolling" title="有新日志时自动滚动到底部">
              <input type="checkbox" v-model="autoScroll" />
              <span>锁定底部</span>
              </label>
          </div>
  
          <div class="right-actions">
              <button @click="store.exportAllLogs" class="btn-icon" title="下载">💾</button>
              <button @click="clearView" class="btn-icon" title="清屏">🧹</button>
              
              <button 
              v-if="!isPolling && !isCacheOverflowingInHistoryMode"
              @click="startPolling" 
              class="btn-action"
              :class="{
                  'start': !store.isPollingError,
                  'permanent-error': store.isPollingError
              }"
              >
              {{ store.isPollingError ? '重试' : '启动' }}
              </button>
              
              <span v-if="isCacheOverflowingInHistoryMode" class="resume-hint">
              滑动到底部恢复
              </span>
          </div>
        </div>
      </div>
  
      <div class="header">
        <div class="left-panel">
          <div 
              class="status-dot" 
              :class="{ 
                  live: isPolling && isLiveMode && !store.isPollingError, 
                  history: isPolling && !isLiveMode && !store.isPollingError,
                  error: store.isPollingError,
                  paused: !isPolling 
              }"
          ></div>
          <span class="title">
            {{ statusTitleText }}
          </span>
          <span class="meta-info">
            显示: {{ currentRangeText }} / 过滤: {{ store.filteredCount }} / 缓存: {{ store.totalCount }}
            <span v-if="store.retryCount > 0 && !store.isPollingError" class="retry-status">
              (重试: {{ store.retryCount }})
            </span>
            <span v-if="store.isPollingError" class="log-gap-warning">
              (⚠️ 失败)
            </span>
          </span>
        </div>
      </div>
  
      <div class="timeline-bar" v-if="store.filteredCount > 0 || store.totalCount === 0">
        <span class="time-label">
          <span v-if="store.isFetchingHistory" class="loading-status">⏳ 加载中...</span>
          <button 
              v-else-if="store.hasMoreHistory && viewportStart === 0" 
              @click="loadMoreHistory" 
              class="btn-load-history" 
          >
              加载更旧
          </button>
          
          <span v-else-if="!store.hasMoreHistory && viewportStart === 0" class="no-more-history">📜 最旧</span>
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
          <span class="col-group">Group/Client</span>
          <span class="col-level">Level</span>
          <span class="col-message">Message</span>
      </div>
  
      <div class="term-box">
        <div ref="terminalRef" class="xterm-container"></div>
        
        <transition name="fade">
          <div v-if="!isLiveMode && missedLogsCount > 0" class="resume-btn" @click="returnToLiveMode">
            ⏩ 回到最新 (跳过 {{ missedLogsCount }} 条)
          </div>
        </transition>
  
        <transition name="fade">
          <div 
              v-if="isLiveMode && !isTerminalAtBottom" 
              class="scroll-bottom-btn" 
              @click="scrollToBottom"
              title="滚动到日志底部"
          >
            ⬇ 底部
          </div>
        </transition>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
  import { Terminal } from '@xterm/xterm';
  import { CanvasAddon } from '@xterm/addon-canvas';
  import { FitAddon } from 'xterm-addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { useLogStore, type LogItem, MAX_CACHE_SIZE, type FilterMode } from '../stores/logStore';
  
  const store = useLogStore();
  
  const terminalRef = ref<HTMLElement | null>(null);
  let term: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let wheelListener: ((e: WheelEvent) => void) | null = null; 
  
  const TERMINAL_SIZE = 2000;
  const CURRENT_USER = 'admin'; 
  const SCROLL_THRESHOLD = 3; 
  
  const LOG_TERMINAL_CONFIG = {
      scrollback: TERMINAL_SIZE,           
      disableStdin: true,           
      convertEol: true,             
      rendererType: 'canvas',
      fontSize: 12,
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
  let pollingTimeout: number | null = null; 
  let debounceTimeout: number | null = null;
  
  // 过滤状态
  const currentFilterMode = ref<FilterMode>('ALL');
  const levelFilter = ref<string | null>(null); 
  const groupIdFilter = ref('');
  const clientIdFilter = ref('');
  
  // 锁与滚动状态
  const isWritingToTerminal = ref(false);
  const isTerminalAtBottom = ref(true); // [新增] 追踪是否在底部
  
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
  const isUserFiltered = computed(() => store.userIdFilter === CURRENT_USER);
  
  const isFilterActive = (type: 'LEVEL' | 'GROUP_ID' | 'CLIENT_ID' | 'USER_ID') => {
      if (currentFilterMode.value === 'NONE') return false;
      if (currentFilterMode.value === 'ALL') return true;
      return currentFilterMode.value === type;
  };
  
  const isCacheOverflowingInHistoryMode = computed(() => {
      return store.totalCount >= MAX_CACHE_SIZE - 50 && !isLiveMode.value;
  });
  
  const statusTitleText = computed(() => {
      if (isPolling.value) {
          if (isLiveMode.value) return '实时监控';
          return '历史回溯';
      }
      if (store.isPollingError) return '轮询失败';
      if (isCacheOverflowingInHistoryMode.value) return '已暂停';
      return '已暂停';
  });
  
  // === Xterm 逻辑 ===
  const initTerminal = () => {
      if (!terminalRef.value) return;
      term = new Terminal(LOG_TERMINAL_CONFIG);
      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new CanvasAddon())
      term.open(terminalRef.value);
      fitAddon.fit();
      
      term.onScroll(() => {
          if (!term || !isLiveMode.value) return; 
          
          const baseScroll = term.buffer.active.baseY;
          const viewportScroll = term.buffer.active.viewportY;
          const isAtBottom = viewportScroll >= baseScroll - SCROLL_THRESHOLD;
          
          // 实时更新底部状态供按钮使用
          isTerminalAtBottom.value = isAtBottom;
  
          // 1. 到底部 -> 强制锁定
          if (isAtBottom && !autoScroll.value) {
              autoScroll.value = true;
              return;
          } 
          
          // 2. 写入锁检查
          if (isWritingToTerminal.value) return;
  
          // 3. 离开底部 -> 取消锁定
          if (!isAtBottom && autoScroll.value) {
              autoScroll.value = false;
          }
      });
      
      const terminalDom = term.element;
      if (terminalDom) {
          wheelListener = (e: WheelEvent) => {
              if (isLiveMode.value) {
                  if (e.deltaY < 0 && autoScroll.value) {
                      autoScroll.value = false;
                  }
                  else if (e.deltaY > 0 && !autoScroll.value && term) {
                      const base = term.buffer.active.baseY;
                      const view = term.buffer.active.viewportY;
                      if (view + 1 >= base) {
                          autoScroll.value = true;
                          isTerminalAtBottom.value = true;
                      }
                  }
              }
          };
          terminalDom.addEventListener('wheel', wheelListener);
      }
  };
  
  // [新增] 手动滚动到底部
  const scrollToBottom = () => {
      if (!term) return;
      term.scrollToBottom(); 
      autoScroll.value = true;
      isTerminalAtBottom.value = true;
  };
  
  const renderWindow = () => {
      if (!term) return;
      const logsToRender = store.getLogSlice(viewportStart.value, TERMINAL_SIZE);
      isWritingToTerminal.value = true;
      term.clear();
      const separator = '-'.repeat(term.cols);
      term.writeln(`\x1b[90m${separator}\x1b[0m`);
      logsToRender.forEach(item => term?.writeln(item.formattedMsg));
      
      if (isLiveMode.value && autoScroll.value) {
          term.scrollToBottom();
          isTerminalAtBottom.value = true;
      } else if (isLiveMode.value) {
          // 处于 Live Mode 但未锁定底部 (例如向上滚动了)，需要检查实际位置
          const base = term.buffer.active.baseY;
          const view = term.buffer.active.viewportY;
          isTerminalAtBottom.value = (view >= base - SCROLL_THRESHOLD);
      }
  
      setTimeout(() => { isWritingToTerminal.value = false; }, 0);
  };
  
  const returnToLiveMode = () => {
    viewportStart.value = maxSliderValue.value;
    autoScroll.value = true;
    isTerminalAtBottom.value = true;
    renderWindow(); 
  };
  
  // === 交互处理 ===
  const handleUserFilterToggle = () => {
      if (isUserFiltered.value) {
          store.setUserIdFilter(null);
      } else {
          store.setUserIdFilter(CURRENT_USER);
      }
  };
  
  watch(currentFilterMode, (mode) => {
      store.setFilterMode(mode);
      returnToLiveMode();
  });
  watch(levelFilter, (val) => {
      store.setLevelFilter(val);
      returnToLiveMode();
  });
  watch([groupIdFilter, clientIdFilter], ([newGroup, newClient]) => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
          store.setGroupIdFilter(newGroup || null);
          store.setClientIdFilter(newClient || null);
          returnToLiveMode();
      }, 300);
  });
  watch(() => store.userIdFilter, () => {
      returnToLiveMode();
  });
  
  
  const loadMoreHistory = async () => {
      if (!store.hasMoreHistory) return;
      const logs = store.filteredLogs;
      const currentAnchorId = logs.length > 0 && viewportStart.value < logs.length ? logs[viewportStart.value].id : null;
      const logsAddedCount = await store.fetchOlderLogs();
      if (logsAddedCount > 0) {
          const newLogs = store.filteredLogs;
          if (currentAnchorId) {
              const newAnchorIndex = newLogs.findIndex(log => log.id === currentAnchorId);
              viewportStart.value = newAnchorIndex !== -1 ? newAnchorIndex : logsAddedCount;
          } else {
               viewportStart.value = 0; 
          }
          renderWindow();
      }
  };
  
  const handleSliderInteraction = () => {
    autoScroll.value = false;
  };
  
  const clearView = () => {
    store.clearAllLogs(); 
    term?.clear();
  };
  
  watch(autoScroll, (newValue) => {
    if (newValue && isLiveMode.value) {
      term?.scrollToBottom();
      if(newValue) isTerminalAtBottom.value = true;
    }
  });
  
  const runCycle = async () => {
      if (isCacheOverflowingInHistoryMode.value) {
          if (isPolling.value) {
              console.warn("Cache overflow. Pausing.");
              stopPolling(true); 
          }
          return; 
      }
      
      const wasInLiveMode = isLiveMode.value; 
      const { newLogs, nextDelay } = await store.pullAndProcessLogs();
  
      if (wasInLiveMode) {
          viewportStart.value = maxSliderValue.value; 
          if (!store.isPollingError && newLogs.length > 0) {
              // 重新计算要渲染的项 (简化逻辑：直接使用 filterMode)
              const itemsToRender = newLogs.filter(item => {
                  const mode = store.filterMode;
                  if (mode === 'NONE') return true;
                  let match = true;
                  if (mode === 'ALL') {
                      if (store.userIdFilter && item.userId !== store.userIdFilter) match = false;
                      if (store.levelFilter && item.level !== store.levelFilter) match = false;
                      if (store.groupIdFilter && !item.groupId.includes(store.groupIdFilter)) match = false;
                      if (store.clientIdFilter && !item.clientId.includes(store.clientIdFilter)) match = false;
                  } else if (mode === 'LEVEL') {
                      if (store.levelFilter && item.level !== store.levelFilter) match = false;
                  } else if (mode === 'GROUP_ID') {
                      if (store.groupIdFilter && !item.groupId.includes(store.groupIdFilter)) match = false;
                  } else if (mode === 'CLIENT_ID') {
                      if (store.clientIdFilter && !item.clientId.includes(store.clientIdFilter)) match = false;
                  } else if (mode === 'USER_ID') {
                      if (store.userIdFilter && item.userId !== store.userIdFilter) match = false;
                  }
                  return match;
              });
  
              isWritingToTerminal.value = true;
              itemsToRender.forEach(item => term?.writeln(item.formattedMsg));
              
              if (autoScroll.value) {
                  term.scrollToBottom();
                  isTerminalAtBottom.value = true;
              }
              setTimeout(() => { isWritingToTerminal.value = false; }, 0);
          }
      } 
      if (isPolling.value) { 
           pollingTimeout = window.setTimeout(runCycle, nextDelay);
      }
  };
  
  const startPolling = () => {
      if (pollingTimeout) return;
      isPolling.value = true;
      returnToLiveMode(); 
      store.resetRetryState(); 
      runCycle(); 
  };
  
  const stopPolling = (isAutomaticPause: boolean = false) => { 
      if (pollingTimeout) clearTimeout(pollingTimeout); 
      pollingTimeout = null; 
      isPolling.value = false;
      if (!isAutomaticPause) store.resetRetryState();
  };
  
  const togglePolling = () => isPolling.value ? stopPolling() : startPolling();
  
  const onResize = () => {
    fitAddon?.fit();
    renderWindow(); 
  };
  
  watch(() => store.isPollingError, (isError) => {
      if (isError && isPolling.value) stopPolling(true);
  });
  
  watch(isLiveMode, (isLive) => {
      if (isLive && !isPolling.value) startPolling();
  });
  
  onMounted(() => {
    initTerminal();
    startPolling(); 
    window.addEventListener('resize', onResize);
  });
  
  onUnmounted(() => {
    if (pollingTimeout) clearTimeout(pollingTimeout); 
    window.removeEventListener('resize', onResize);
    if (term && term.element && wheelListener) {
        term.element.removeEventListener('wheel', wheelListener as EventListener);
    }
    term?.dispose();
  });
  </script>
  
  <style scoped>
  .terminal-wrapper { 
      display: flex; flex-direction: column; width: 100%; height: 600px; 
      background-color: #F5F5F5; 
      border-radius: 8px; overflow: hidden; 
      border: 1px solid #E0E0E0; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  
  /* ---------------- 控制栏布局 ---------------- */
  .control-bar {
      display: flex; 
      flex-direction: column; 
      gap: 8px;
      padding: 8px 12px; 
      background-color: #E8E8E8; 
      border-bottom: 1px solid #E0E0E0; 
      user-select: none; 
      color: #333333;
      font-size: 12px;
  }
  
  .filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
  }
  
  .action-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #DDD; 
      padding-top: 6px;
  }
  
  .right-actions {
      display: flex;
      align-items: center;
      gap: 8px;
  }
  
  /* 输入控件 */
  .input-group { display: flex; align-items: center; gap: 4px; }
  .label { font-weight: 600; }
  
  .mode-select, .common-select, .common-input {
      padding: 3px 6px;
      border: 1px solid #CCCCCC;
      border-radius: 4px;
      background-color: #FFFFFF;
      color: #333;
      font-size: 12px;
  }
  .mode-select { font-weight: bold; color: #0277BD; }
  .common-input { width: 80px; }
  .common-input:disabled, .common-select:disabled {
      background-color: #E0E0E0;
      color: #999;
      cursor: not-allowed;
  }
  
  .checkbox-item { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .filter-checkbox { color: #039BE5; font-weight: 500; }
  .filter-checkbox.disabled { color: #999; cursor: not-allowed; }
  
  /* 按钮 */
  button { cursor: pointer; border: none; outline: none; }
  .btn-icon { background: transparent; font-size: 14px; padding: 4px; border-radius: 4px; color: #555; }
  .btn-icon:hover { background-color: #D0D0D0; }
  
  .btn-action { font-size: 12px; padding: 4px 12px; border-radius: 4px; color: white; font-weight: 500; }
  .btn-action.start { background-color: #4CAF50; } 
  .btn-action.permanent-error { background-color: #E53935; }
  
  /* 头部信息 */
  .header { 
      display: flex; align-items: center; padding: 6px 12px; 
      background-color: #FFFFFF; border-bottom: 1px solid #E0E0E0; 
      font-size: 12px; gap: 10px;
  }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #999; transition: all 0.3s; }
  .status-dot.live { background-color: #4CAF50; box-shadow: 0 0 6px rgba(76, 175, 80, 0.4); }
  .status-dot.history { background-color: #FF9800; }
  .status-dot.error { background-color: #E53935; animation: pulse 1s infinite; }
  .status-dot.paused { background-color: #607D8B; }
  
  @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
  
  .title { font-weight: 600; }
  .meta-info { color: #666; margin-left: auto; }
  .log-gap-warning { color: #E53935; margin-left: 8px; }
  .resume-hint { color: #666; font-style: italic; font-size: 11px; }
  
  /* 时间轴 */
  .timeline-bar { display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: #EEEEEE; border-bottom: 1px solid #E0E0E0; font-size: 11px; }
  .history-slider { flex: 1; cursor: pointer; height: 4px; }
  .slider-placeholder { flex: 1; height: 4px; border-radius: 2px; background-color: #DDD; }
  .btn-load-history { background-color: #42A5F5; color: white; padding: 2px 6px; border-radius: 3px; }
  
  /* 列头 & 终端 */
  .column-header { display: flex; background-color: #F5F5F5; border-top: 1px solid #E0E0E0; font-family: monospace; font-size: 12px; padding: 2px 0 2px 8px; font-weight: bold; color: #555; }
  .column-header > span { display: inline-block; padding-right: 1ch; }
  .col-timestamp { min-width: 10ch; } 
  .col-service { min-width: 12ch; color: #8959A8; } 
  .col-user { min-width: 10ch; color: #4271AE; } 
  .col-group { min-width: 14ch; color: #009688; } 
  .col-level { min-width: 6ch; } 
  .col-message { flex-grow: 1; color: #333; }
  
  .term-box { flex: 1; position: relative; overflow: hidden; padding-left: 8px; background-color: #FFFFFF; }
  .xterm-container { width: 100%; height: 100%; }
  
  .resume-btn { 
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); 
    background-color: #FFA000; color: #333; padding: 6px 16px; border-radius: 20px; 
    font-size: 12px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10; 
  }
  
  /* [新增] 滚动到底部按钮样式 */
  .scroll-bottom-btn {
    position: absolute; bottom: 20px; right: 20px; 
    background-color: #42A5F5; color: white; padding: 6px 12px; border-radius: 20px;
    font-size: 12px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: pointer; z-index: 10;
    transition: background 0.2s;
  }
  .scroll-bottom-btn:hover { background-color: #1E88E5; }
  
  .fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
  </style>