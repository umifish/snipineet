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
              v-if="!isPolling && (!isCacheOverflowingInHistoryMode || store.isPermanentError)"
              @click="startPolling" 
              class="btn-action"
              :class="{
                  'start': !store.isPermanentError,
                  'permanent-error': store.isPermanentError
              }"
              >
              {{ store.isPermanentError ? '重试' : (store.isPollingError ? '重试' : '启动') }}
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
  
      <div 
          class="column-header-wrapper" 
          :style="{ transform: 'translateX(' + horizontalScrollOffset + 'px)' }"
      >
          <div class="column-header">
              <span class="col-timestamp">Timestamp</span>
              <span class="col-service">Service Name</span>
              <span class="col-user">User</span>
              <span class="col-group">Group/Client</span>
              <span class="col-level">Level</span>
              <span class="col-message">Message</span>
          </div>
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
  import { useLogStore, MAX_CACHE_SIZE, type FilterMode, shouldLogBeDisplayed } from '../stores/logStore';

  const store = useLogStore();
  
const terminalRef = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
  let viewportElement: HTMLElement | null = null;

  const TERMINAL_SIZE = 2000;
  const CURRENT_USER = 'admin'; 
  const SCROLL_THRESHOLD = 3; 
  
  // ✨ 终端配置采用新的漂亮浅色主题 ✨
  const LOG_TERMINAL_CONFIG = {
      scrollback: TERMINAL_SIZE,           
  disableStdin: true,
      convertEol: true,             
      rendererType: 'canvas',
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, monospace',
      theme: {
          background: '#FAFAFA',          // 极浅灰色背景 (Soft White)
          foreground: '#383A42',          // 柔和深色文本 (Soft Black)
          cursor: '#007ACC',              // 强调蓝作为光标色
          
          // 关键 ANSI 颜色 (配合 Store 中的格式化)
          red: '#E4564A',                 // 温暖的错误红
          yellow: '#9D7A00',              // 深金色警告
          green: '#50A14F',               // 柔和的森林绿 (用于 INFO 级别)
          blue: '#4078F2',                // 明亮的标识蓝 (用于 User ID)
          cyan: '#008C9E',                // 深青色 (用于 Service Name)
          magenta: '#A626A4',             // 鲜艳的结构紫 (用于 Group/Client ID)
          brightBlack: '#AAAAAA',         // 中灰 (用于 Timestamp/Dim) 
      }
  };
  
  // === 状态 ===
  const isPolling = ref(true); 
  const autoScroll = ref(true); 
  const viewportStart = ref(0);   
  let pollingTimeout: number | null = null; 
  let debounceTimeout: number | null = null;
  
  const currentFilterMode = ref<FilterMode>('ALL');
  const levelFilter = ref<string | null>(null); 
  const groupIdFilter = ref('');
  const clientIdFilter = ref('');
  
  const isWritingToTerminal = ref(false);
  const isTerminalAtBottom = ref(true); 
  const horizontalScrollOffset = ref(0); 
  
  // === 计算属性 (保持不变) ===
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
  
  // === 辅助函数：确保 viewportStart 在有效范围内 ===
  const clampViewportStart = () => {
      const maxVal = maxSliderValue.value;
      if (viewportStart.value > maxVal) {
          viewportStart.value = maxVal;
      }
      if (viewportStart.value < 0) {
          viewportStart.value = 0;
      }
  };
  
  // === Xterm 逻辑 ===
  
  // 滚轮监听器：专用于快速捕捉用户向上滚动意图 (UNLOCK)
  const wheelListener = (e: WheelEvent) => {
      // 【修复】在写入终端时抑制滚轮事件，避免触发不必要的状态更新
      if (isWritingToTerminal.value) return;
      
      if (e.deltaY < 0) {
          if (isLiveMode.value && autoScroll.value) {
              autoScroll.value = false;
          }
      }
  };
  
  // DOM Scroll 监听器：专用于快速捕捉用户滚动到底部的意图 (RE-LOCK) 或离开底部的意图 (UNLOCK)
  const domScrollListener = (e: Event) => {
      // 【修复】在写入终端时抑制滚动事件，避免触发不必要的状态更新
      if (isWritingToTerminal.value) return;
      
      const target = e.target as HTMLElement;
      if (!target || !isLiveMode.value) return; 
  
      // 检查是否滚动到底部。
      const isAtBottomDOM = target.scrollHeight - target.scrollTop <= target.clientHeight + 3; 
  
      // 【修复】同步更新 isTerminalAtBottom 状态
      isTerminalAtBottom.value = isAtBottomDOM;
  
      // 1. Re-Lock Logic (用户滚到底部时，如果未锁定，则锁定)
      if (isAtBottomDOM && !autoScroll.value) {
          autoScroll.value = true;
      } 
      
      // 2. UNLOCK 逻辑 (用户离开了底部，且当前处于锁定状态，则取消锁定)
      else if (!isAtBottomDOM && autoScroll.value) {
          autoScroll.value = false;
      }
  };
  
  // 横向滚动监听器 (保持不变)
  const horizontalScrollListener = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target) {
          horizontalScrollOffset.value = -target.scrollLeft; 
      }
  };
  
  const initTerminal = () => {
      if (!terminalRef.value) return;
      term = new Terminal(LOG_TERMINAL_CONFIG);
      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new CanvasAddon())
      term.open(terminalRef.value);
      fitAddon.fit();
      
      // 纵向滚动监听器 (用于处理 Xterm 内部的 baseY/viewportY 计算和状态更新)
      term.onScroll(() => {
          // 【修复】在写入终端时抑制滚动事件，避免触发不必要的状态更新
          if (isWritingToTerminal.value) return;
          
          if (!term || !isLiveMode.value) return; 
          
          const baseScroll = term.buffer.active.baseY;
          const viewportScroll = term.buffer.active.viewportY;
          const isAtBottom = viewportScroll >= baseScroll - SCROLL_THRESHOLD;
          
          isTerminalAtBottom.value = isAtBottom;
  
          // 离开底部，如果未通过 wheelListener/domScrollListener 触发，则在这里解锁
          if (!isAtBottom && autoScroll.value) {
              autoScroll.value = false;
          }
      });
  
      // 监听 DOM 元素
      viewportElement = terminalRef.value.querySelector('.xterm-viewport');
      if (viewportElement) {
          viewportElement.addEventListener('scroll', horizontalScrollListener);
          // 注册 DOM scroll 监听器
          viewportElement.addEventListener('scroll', domScrollListener); 
      }
  };
  
  const scrollToBottom = () => {
      if (!term) return;
      term.scrollToBottom(); 
      autoScroll.value = true;
      isTerminalAtBottom.value = true;
  };
  
  const renderWindow = () => {
      if (!term) return;
      
      // 【修复】确保 viewportStart 在有效范围内
      clampViewportStart();
      
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
          const base = term.buffer.active.baseY;
          const view = term.buffer.active.viewportY;
          isTerminalAtBottom.value = (view >= base - SCROLL_THRESHOLD);
      }
  
      setTimeout(() => { isWritingToTerminal.value = false; }, 0);
  };
  
  const returnToLiveMode = () => {
    // 【修复】确保 viewportStart 设置为最新位置
    viewportStart.value = maxSliderValue.value;
    clampViewportStart(); // 确保在有效范围内
    autoScroll.value = true;
    isTerminalAtBottom.value = true;
    renderWindow();
    // 注意：轮询启动由 watch(isLiveMode) 或 startPolling() 调用者负责
  };
  
  // === 交互处理 (保持不变) ===
  const handleUserFilterToggle = () => {
      if (isUserFiltered.value) {
          store.setUserIdFilter(null);
      } else {
          store.setUserIdFilter(CURRENT_USER);
      }
  };
  
  // 【修复】确保组件和 store 之间的双向同步
  watch(currentFilterMode, (mode) => {
      store.setFilterMode(mode);
      returnToLiveMode();
  });
  watch(() => store.filterMode, (mode) => {
      if (currentFilterMode.value !== mode) {
          currentFilterMode.value = mode;
      }
  });
  
  watch(levelFilter, (val) => {
      store.setLevelFilter(val);
      returnToLiveMode();
  });
  watch(() => store.levelFilter, (val) => {
      if (levelFilter.value !== val) {
          levelFilter.value = val;
      }
  });
  
  watch([groupIdFilter, clientIdFilter], ([newGroup, newClient]) => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = window.setTimeout(() => {
          store.setGroupIdFilter(newGroup || null);
          store.setClientIdFilter(newClient || null);
          returnToLiveMode();
      }, 300);
  });
  watch(() => store.groupIdFilter, (val) => {
      const newVal = val || '';
      if (groupIdFilter.value !== newVal) {
          groupIdFilter.value = newVal;
      }
  });
  watch(() => store.clientIdFilter, (val) => {
      const newVal = val || '';
      if (clientIdFilter.value !== newVal) {
          clientIdFilter.value = newVal;
      }
  });
  
  watch(() => store.userIdFilter, () => {
      returnToLiveMode();
  });
  
  
  const loadMoreHistory = async () => {
      if (!store.hasMoreHistory || store.isFetchingHistory) return 0;
      
      // 【修复】记录当前视窗顶部的日志 ID 作为锚点
      const logs = store.filteredLogs;
      const currentAnchorId = logs.length > 0 && viewportStart.value < logs.length 
          ? logs[viewportStart.value].id 
          : null;
      
      const logsAddedCount = await store.fetchOlderLogs();
      
      // 【修复】如果返回 -1，表示超出缓存上限，需要停止轮询
      if (logsAddedCount === -1) {
          if (isPolling.value) {
              stopPolling(true);
          }
          return 0;
      }
      
      if (logsAddedCount > 0) {
          const newLogs = store.filteredLogs;
          
          // 【修复】根据锚点重新计算 viewportStart
          if (currentAnchorId) {
              const newAnchorIndex = newLogs.findIndex(log => log.id === currentAnchorId);
              if (newAnchorIndex !== -1) {
                  // 找到锚点，保持在同一位置
                  viewportStart.value = newAnchorIndex;
              } else {
                  // 锚点丢失（可能被过滤掉了），使用添加的数量作为偏移
                  viewportStart.value = Math.min(logsAddedCount, maxSliderValue.value);
              }
          } else {
              // 没有锚点，保持在顶部
              viewportStart.value = 0; 
          }
          
          // 【修复】确保 viewportStart 在有效范围内
          clampViewportStart();
          renderWindow();
    }
  };
  
  const handleSliderInteraction = () => {
    // 【修复】拖动滑块时取消自动锁定，并确保 viewportStart 在有效范围内
    autoScroll.value = false;
    clampViewportStart();
  };
  
  const clearView = () => {
    store.clearAllLogs(); 
    term?.clear();
  };
  
  watch(autoScroll, (newValue) => {
    // 【修复】移除冗余检查，当 autoScroll 为 true 且处于 Live Mode 时，滚动到底部
    if (newValue && isLiveMode.value) {
      term?.scrollToBottom();
      isTerminalAtBottom.value = true;
    }
  });
  
  const runCycle = async () => {
      if (isCacheOverflowingInHistoryMode.value) {
          if (isPolling.value) {
              stopPolling(true); 
          }
          return; 
      }
      
      // 【修复】如果超过最大重试次数，停止轮询
      if (store.isPermanentError) {
          if (isPolling.value) {
              stopPolling(true);
          }
          return;
      }
      
      const wasInLiveMode = isLiveMode.value; 
      const { newLogs, nextDelay } = await store.pullAndProcessLogs();
      
      // 【修复】如果 nextDelay 为 0，表示需要停止轮询（超过最大重试次数）
      if (nextDelay === 0) {
          if (isPolling.value) {
              stopPolling(true);
          }
          return;
      }
  
      if (wasInLiveMode) {
          // 【修复】再次检查是否仍在 Live Mode（用户可能在异步操作期间切换了模式）
          if (!isLiveMode.value) {
              // 如果已经切换到历史模式，不追加日志，直接返回
              if (isPolling.value) { 
                  pollingTimeout = window.setTimeout(runCycle, nextDelay) as unknown as number;
              }
              return;
          }
          
          viewportStart.value = maxSliderValue.value; 
          if (!store.isPollingError && newLogs.length > 0) {
              
              // 使用通用的 shouldLogBeDisplayed 函数进行过滤
              const itemsToRender = newLogs.filter(item => 
                  shouldLogBeDisplayed(
                      item, 
                      store.filterMode, 
                      store.levelFilter, 
                      store.groupIdFilter, 
                      store.clientIdFilter, 
                      store.userIdFilter
                  )
              );
  
              if (itemsToRender.length > 0 && term) {
                  isWritingToTerminal.value = true;
                  const currentTerm = term; // 保存引用，避免类型检查问题
                  itemsToRender.forEach(item => currentTerm.writeln(item.formattedMsg));
                  
                  if (autoScroll.value) {
                      currentTerm.scrollToBottom();
                      isTerminalAtBottom.value = true;
                  }
                  setTimeout(() => { isWritingToTerminal.value = false; }, 0);
              }
          }
      } 
      if (isPolling.value) { 
           pollingTimeout = window.setTimeout(runCycle, nextDelay) as unknown as number;
      }
  };
  
  const startPolling = () => {
    if (pollingTimeout) return;
    isPolling.value = true;
    store.resetRetryState(); 
  
    // 1. 跳转到最新视图 (设置 autoScroll=true, viewportStart=max, 触发 renderWindow)
    returnToLiveMode(); 
    
    // 2. 【关键修复】引入 50ms 延迟，确保 Xterm 终端内容完成绘制，避免时序冲突。
    setTimeout(() => {
        // 强制锁定并滚动到底部，保证锁定状态的持久性。
        scrollToBottom(); 
        
        // 3. 在滚动完成后，再启动轮询周期。
        runCycle(); 
    }, 50); // 50ms 延迟
  };
  
  const stopPolling = (isAutomaticPause: boolean = false) => { 
      if (pollingTimeout) clearTimeout(pollingTimeout); 
      pollingTimeout = null; 
      isPolling.value = false;
      if (!isAutomaticPause) store.resetRetryState();
  };
  
  const onResize = () => {
    fitAddon?.fit();
    renderWindow(); 
  };
  
  watch(() => store.isPollingError, (isError) => {
      // 【修复】只有在超过最大重试次数时才停止轮询，否则继续重试
      if (isError && store.isPermanentError && isPolling.value) {
          stopPolling(true);
      }
  });
  
  watch(isLiveMode, (isLive) => {
      // 【修复】当用户处于最新窗口时（不管是通过滑块、跳转等方式），自动启动轮询
      if (isLive && !isPolling.value && !store.isPermanentError) {
          startPolling();
      } else if (!isLive && isPolling.value) {
          // 如果离开最新窗口，停止轮询
          stopPolling(true);
      }
  });

  // 【修复】监听 filteredCount 变化，当缓存被截断时自动调整 viewportStart
  watch(() => store.filteredCount, (newCount, oldCount) => {
      // 如果 filteredCount 减少（可能是缓存被截断了），需要调整 viewportStart
      if (oldCount !== undefined && newCount < oldCount) {
          const removedCount = oldCount - newCount;
          
          // 如果当前不在 Live Mode，需要调整 viewportStart
          if (!isLiveMode.value) {
              // viewportStart 应该减少相同的数量，但不能小于 0
              viewportStart.value = Math.max(0, viewportStart.value - removedCount);
          } else {
              // Live Mode 下，直接调整到最新的位置
              viewportStart.value = maxSliderValue.value;
          }
          
          clampViewportStart();
          // 如果 viewportStart 发生了变化，需要重新渲染
          if (viewportStart.value !== maxSliderValue.value || !isLiveMode.value) {
              renderWindow();
          }
      }
  });

  // 【修复】监听 maxSliderValue 变化，确保 viewportStart 不超过最大值
  watch(maxSliderValue, (newMax) => {
      if (viewportStart.value > newMax) {
          viewportStart.value = newMax;
          if (!isLiveMode.value) {
              renderWindow();
          }
      }
  });
  
  onMounted(() => {
    // 【修复】初始化过滤状态，确保组件和 store 同步
    currentFilterMode.value = store.filterMode;
    levelFilter.value = store.levelFilter;
    groupIdFilter.value = store.groupIdFilter || '';
    clientIdFilter.value = store.clientIdFilter || '';
    
    initTerminal();
    startPolling();
    window.addEventListener('resize', onResize);
    
    // 注册 wheelListener
    if (terminalRef.value) {
      terminalRef.value.addEventListener('wheel', wheelListener, { passive: true });
    }
  });
  
  onUnmounted(() => {
    if (pollingTimeout) clearTimeout(pollingTimeout); 
    window.removeEventListener('resize', onResize);
  
    // 移除 wheelListener
    if (terminalRef.value) {
      terminalRef.value.removeEventListener('wheel', wheelListener);
    }
  
    // 移除 DOM 监听器
    if (viewportElement) {
        viewportElement.removeEventListener('scroll', horizontalScrollListener);
        viewportElement.removeEventListener('scroll', domScrollListener);
    }
    term?.dispose();
  });
  </script>
  
  <style scoped>
  /* ---------------- 基础样式 - 采用柔和的浅色调 ---------------- */
  .terminal-wrapper {
      display: flex; flex-direction: column; width: 100%; height: 600px; 
      background-color: #F7F7F7; /* 略微深于终端背景 */
      border-radius: 8px; overflow: hidden; 
      border: 1px solid #EAEAEA; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .control-bar {
    display: flex;
    flex-direction: column;
      gap: 8px;
      padding: 10px 15px; 
      background-color: #FFFFFF; /* 纯白背景 */
      border-bottom: 1px solid #EAEAEA; 
      user-select: none; 
      color: #383A42; /* 柔和深色文本 */
      font-size: 13px;
  }
  
  .filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
  }
  
  .action-row {
    display: flex;
    justify-content: space-between;
      align-items: center;
      border-top: 1px solid #EAEAEA; /* 柔和分割线 */
      padding-top: 8px;
  }
  
  .right-actions {
      display: flex;
      align-items: center;
      gap: 8px;
  }
  
  .input-group { display: flex; align-items: center; gap: 4px; }
  .label { font-weight: 600; }
  
  .mode-select, .common-select, .common-input {
      padding: 4px 8px;
      border: 1px solid #D0D0D0;
      border-radius: 5px;
      background-color: #FFFFFF;
      color: #383A42;
      font-size: 12px;
      transition: border-color 0.2s;
  }
  .mode-select:focus, .common-select:focus, .common-input:focus {
      border-color: #007ACC;
      box-shadow: 0 0 0 1px #007ACC;
  }
  
  .mode-select { font-weight: bold; color: #007ACC; }
  .common-input { width: 90px; }
  .common-input:disabled, .common-select:disabled {
      background-color: #EEEEEE;
      color: #999;
      cursor: not-allowed;
      border-color: #EAEAEA;
  }
  
  .checkbox-item { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .filter-checkbox { color: #007ACC; font-weight: 500; }
  .filter-checkbox.disabled { color: #AAAAAA; cursor: not-allowed; }
  
  button { cursor: pointer; border: none; outline: none; }
  .btn-icon { background: transparent; font-size: 16px; padding: 4px; border-radius: 4px; color: #555; }
  .btn-icon:hover { background-color: #EAEAEA; }
  
  .btn-action { font-size: 12px; padding: 6px 14px; border-radius: 5px; color: white; font-weight: 500; }
  .btn-action.start { background-color: #50A14F; } /* 终端 Green */
  .btn-action.start:hover { background-color: #438e42; }
  .btn-action.permanent-error { background-color: #E4564A; } /* 终端 Red */
  .btn-action.permanent-error:hover { background-color: #c94c42; }
  
  .header { 
      display: flex; align-items: center; padding: 6px 15px; 
      background-color: #FFFFFF; border-bottom: 1px solid #EAEAEA; 
      font-size: 12px; gap: 10px;
      color: #383A42;
  }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #999; transition: all 0.3s; }
  .status-dot.live { background-color: #50A14F; box-shadow: 0 0 6px rgba(80, 161, 79, 0.4); } /* 终端 Green */
  .status-dot.history { background-color: #9D7A00; } /* 终端 Yellow */
  .status-dot.error { background-color: #E4564A; animation: pulse 1s infinite; } /* 终端 Red */
  .status-dot.paused { background-color: #AAAAAA; } /* 终端 Bright Black */
  
  @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
  
  .title { font-weight: 600; }
  .meta-info { color: #666; margin-left: auto; }
  .log-gap-warning { color: #E4564A; margin-left: 8px; font-weight: 500; }
  .resume-hint { color: #666; font-style: italic; font-size: 11px; }
  
  .timeline-bar { display: flex; align-items: center; gap: 8px; padding: 4px 15px; background: #EEEEEE; border-bottom: 1px solid #EAEAEA; font-size: 12px; color: #666; }
  .history-slider { flex: 1; cursor: pointer; height: 4px; }
  .slider-placeholder { flex: 1; height: 4px; border-radius: 2px; background-color: #DDD; }
  .btn-load-history { 
      background-color: #007ACC; /* 强调蓝 */ 
    color: white;
      padding: 2px 8px; 
      border-radius: 3px; 
      font-size: 11px;
      transition: background-color 0.2s;
  }
  .btn-load-history:hover { background-color: #0069b3; }
  
  .term-box { flex: 1; position: relative; overflow: hidden; padding-left: 8px; background-color: #FAFAFA; } /* 终端背景 */
  .xterm-container { width: 100%; height: 100%; }
  
  
  /* ---------------- ✨ 漂亮的滚动条样式 ✨ (不变) ---------------- */
  
  /* 1. Webkit/Blink 样式 (Chrome, Safari, Edge) */
  .xterm-container ::-webkit-scrollbar {
      width: 8px; 
      height: 8px; 
  }
  
  .xterm-container ::-webkit-scrollbar-track {
      background: transparent; 
  }
  
  .xterm-container ::-webkit-scrollbar-thumb {
      background-color: #B0B0B0; 
    border-radius: 4px;
      border: 2px solid transparent; 
  }
  
  .xterm-container ::-webkit-scrollbar-thumb:hover {
      background-color: #888888; 
  }
  
  /* 2. Firefox 样式 */
  .xterm-container {
      scrollbar-width: thin; 
      scrollbar-color: #B0B0B0 transparent; 
  }
  
  /* ---------------- 列头同步样式 (保持不变) ---------------- */
  
  .column-header-wrapper {
      position: relative; 
      z-index: 5;
      background-color: #F7F7F7; /* 匹配 wrapper 背景 */
      transition: transform 0.05s linear; 
      border-top: 1px solid #EAEAEA; 
  }
  
  .column-header { 
      display: flex; 
      font-family: monospace; 
      font-size: 12px; 
      padding: 2px 0 2px 8px; 
      font-weight: bold; 
      color: #555; 
  }
  
  /* 列宽定义 */
  .column-header > span { display: inline-block; padding-right: 1ch; }
  .col-timestamp { min-width: 10ch; } 
  .col-service { min-width: 12ch; color: #008C9E; } /* 终端 Cyan */
  .col-user { min-width: 10ch; color: #4078F2; } /* 终端 Blue */
  .col-group { min-width: 14ch; color: #A626A4; } /* 终端 Magenta */
  .col-level { min-width: 6ch; } 
  .col-message { flex-grow: 1; color: #383A42; } 
  
  /* 底部按钮样式 (更新为新主题颜色) */
  .resume-btn { 
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); 
    background-color: #9D7A00; /* 终端 Yellow/Gold */ 
    color: #FAFAFA; 
    padding: 6px 16px; border-radius: 20px; 
    font-size: 12px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10; 
    cursor: pointer;
  }
  .scroll-bottom-btn {
    position: absolute; bottom: 20px; right: 20px; 
    background-color: #007ACC; /* 强调蓝 */ 
    color: white; padding: 6px 12px; border-radius: 20px;
    font-size: 12px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: pointer; z-index: 10;
    transition: background 0.2s;
  }
  .scroll-bottom-btn:hover { background-color: #0069b3; }
  
  .fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
  </style>