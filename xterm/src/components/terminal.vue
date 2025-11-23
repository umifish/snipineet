<template>
    <div class="terminal-wrapper">
      <el-card class="control-bar" shadow="never" :body-style="{ padding: '10px 15px' }">
        <el-row :gutter="10" class="filter-row">
          <el-col :span="24">
            <el-space wrap :size="10">
              <div class="input-group">
                <span class="label">模式:</span>
                <el-select
                  v-model="currentFilterMode"
                  class="mode-select"
                  size="small"
                  style="width: 140px"
                  @change="handleFilterModeChange"
                >
                  <el-option label="交集 (ALL)" value="ALL" />
                  <el-option label="无 (NONE)" value="NONE" />
                  <el-option label="仅 Group" value="GROUP_ID" />
                  <el-option label="仅 Client" value="CLIENT_ID" />
                  <el-option label="仅 User" value="USER_ID" />
                </el-select>
              </div>

              <el-input
                v-model="clientIdFilter"
                placeholder="Client ID"
                :disabled="!isFilterActive('CLIENT_ID')"
                size="small"
                style="width: 90px"
                clearable
                @input="handleClientFilterChange"
              />
  
              <el-checkbox
                :checked="isUserFiltered"
                :disabled="!isFilterActive('USER_ID')"
                @change="handleUserFilterToggle"
                class="filter-checkbox"
              >
                User: Me ({{ CURRENT_USER }})
              </el-checkbox>
            </el-space>
          </el-col>
        </el-row>
  
        <el-divider style="margin: 8px 0" />
  
        <el-row justify="space-between" align="middle">
          <el-col :span="12">
            <el-checkbox
              v-if="isLiveMode && isPolling"
              v-model="autoScroll"
              size="small"
            >
              锁定底部
            </el-checkbox>
          </el-col>
  
          <el-col :span="12" style="text-align: right">
            <el-space :size="8">
              <el-button
                :icon="Download"
                circle
                size="small"
                @click="handleExportLogs"
                title="下载"
              />
              <el-button
                :icon="Delete"
                circle
                size="small"
                @click="clearView"
                title="清屏"
              />
  
              <el-button
                v-if="
                  !isPolling &&
                  (!isCacheOverflowingInHistoryMode || store.isPermanentError)
                "
                :type="store.isPermanentError ? 'danger' : 'success'"
                size="small"
                @click="startPolling"
              >
                {{
                  store.isPermanentError
                    ? "重试"
                    : store.isPollingError
                    ? "重试"
                    : "启动"
                }}
              </el-button>
  
              <span v-if="isCacheOverflowingInHistoryMode" class="resume-hint">
                滑动到底部恢复
              </span>
            </el-space>
          </el-col>
        </el-row>
      </el-card>
  
      <!-- 状态栏 -->
      <el-card class="header" shadow="never" :body-style="{ padding: '6px 15px' }">
        <el-space :size="10">
          <div
            class="status-dot"
            :class="{
              live: isPolling && isLiveMode && !store.isPollingError,
              history: isPolling && !isLiveMode && !store.isPollingError,
              error: store.isPollingError,
              paused: !isPolling,
            }"
          ></div>
          <span class="title">{{ statusTitleText }}</span>
          <span class="meta-info">
            显示: {{ currentRangeText }} / 过滤: {{ store.filteredCount }} / 缓存:
            {{ store.totalCount }}
            <span
              v-if="store.retryCount > 0 && !store.isPollingError"
              class="retry-status"
            >
              (重试: {{ store.retryCount }})
            </span>
            <span v-if="store.isPollingError" class="log-gap-warning">
              (⚠️ 失败)
            </span>
          </span>
        </el-space>
      </el-card>
  
      <!-- 时间轴滑块 -->
      <el-card
        v-if="store.filteredCount > 0 || store.totalCount === 0"
        class="timeline-bar"
        shadow="never"
        :body-style="{ padding: '4px 15px' }"
      >
        <el-row :gutter="8" align="middle">
          <el-col :span="4">
            <span class="time-label">
              <el-icon v-if="store.isFetchingHistory" class="is-loading">
                <Loading />
              </el-icon>
              <el-button
                v-else-if="store.hasMoreHistory && viewportStart === 0"
                type="primary"
                size="small"
                @click="loadMoreHistory"
              >
                加载更旧
              </el-button>
              <span
                v-else-if="!store.hasMoreHistory && viewportStart === 0"
                class="no-more-history"
              >
                📜 最旧
              </span>
              <span v-else>最旧</span>
            </span>
          </el-col>
  
          <el-col :span="16">
            <el-slider
              v-if="isSliderNeeded"
              v-model="viewportStart"
              :min="0"
              :max="maxSliderValue"
              :step="1"
              @change="handleSliderChange"
              @input="handleSliderInteraction"
            />
            <div v-else class="slider-placeholder"></div>
          </el-col>
  
          <el-col :span="4" style="text-align: right">
            <span class="time-label">最新</span>
          </el-col>
        </el-row>
      </el-card>

      <!-- 列头 -->
      <div
        class="column-header-wrapper"
        :style="{ transform: 'translateX(' + horizontalScrollOffset + 'px)' }"
      >
        <div class="column-header">
          <span class="col-timestamp">Timestamp</span>
          <span class="col-service">Service Name</span>
          <span class="col-user">User</span>
          <span class="col-level">Level</span>
          <span class="col-message">Message</span>
        </div>
      </div>
  
      <!-- 终端容器 -->
      <div class="term-box">
        <div ref="terminalRef" class="xterm-container"></div>
  
        <transition name="fade">
          <el-button
            v-if="!isLiveMode && missedLogsCount > 0"
            type="warning"
            class="resume-btn"
            @click="returnToLiveMode"
          >
            ⏩ 回到最新 (跳过 {{ missedLogsCount }} 条)
          </el-button>
        </transition>
  
        <transition name="fade">
          <el-button
            v-if="isLiveMode && !isTerminalAtBottom"
            type="primary"
            class="scroll-bottom-btn"
            circle
            @click="scrollToBottom"
            title="滚动到日志底部"
          >
            ⬇
          </el-button>
        </transition>
      </div>
    </div>
  </template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Download, Delete, Loading } from '@element-plus/icons-vue'
import { Terminal, type ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import type { FilterMode } from '../core/type'
import { useLogStore, isLogVisible } from '../stores/logStore'
import { exportLogsToJson, MAX_LOG_CACHE_SIZE } from '../utils/logging'
import '@xterm/xterm/css/xterm.css'

const store = useLogStore()
const terminalRef = ref<HTMLElement | null>(null)

const LOG_TERMINAL_CONFIG: ITerminalOptions = {
  scrollback: TERMINAL_SIZE,
  disableStdin: true,
  convertEol: true,
  fontSize: 12,
  fontFamily: "Menlo, Monaco, monospace",
  theme: {
    background: "#FAFAFA", // 极浅灰色背景 (Soft White)
    foreground: "#383A42", // 柔和深色文本 (Soft Black)
    cursor: "#007ACC", // 强调蓝作为光标色

    // 关键 ANSI 颜色 (配合 Store 中的格式化)
    red: "#E4564A", // 温暖的错误红
    yellow: "#9D7A00", // 深金色警告
    green: "#50A14F", // 柔和的森林绿 (用于 INFO 级别)
    blue: "#4078F2", // 明亮的标识蓝 (用于 User ID)
    cyan: "#008C9E", // 深青色 (用于 Service Name)
    magenta: "#A626A4", // 鲜艳的结构紫 (用于 Group/Client ID)
    brightBlack: "#AAAAAA", // 中灰 (用于 Timestamp/Dim)
  },
}

const initTerminal = () => {
  if (!terminalRef.value) {
    return
  }

  term = new Terminal(LOG_TERMINAL_CONFIG)
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new CanvasAddon())
  term.open(terminalRef.value)
  fitAddon.fit()

  term.onScroll(() => {
      if (isWritingToTerminal.value) return;

      if (!term || !isLiveMode.value) return;

      const baseScroll = term.buffer.active.baseY;
      const viewportScroll = term.buffer.active.viewportY;
      const isAtBottom = viewportScroll >= baseScroll - SCROLL_THRESHOLD;

      isTerminalAtBottom.value = isAtBottom;

      if (!isAtBottom && autoScroll.value) {
      autoScroll.value = false;
      }
  });

  viewportElement = terminalRef.value.querySelector(".xterm-viewport");

  if (viewportElement) {
      viewportElement.addEventListener("scroll", horizontalScrollListener);
      viewportElement.addEventListener("scroll", domScrollListener);
  }
};


onMounted(() => {
  currentFilterMode.value = store.filterMode;
  clientIdFilter.value = store.clientIdFilter || "";

  initTerminal()
  nextTick(() => startPolling())


  window.addEventListener("resize", onResize);

if (terminalRef.value) {
    terminalRef.value.addEventListener("wheel", wheelListener, {
    passive: true,
  });
}
})





import { MAX_CACHE_SIZE, TERMINAL_SIZE, CURRENT_USER, SCROLL_THRESHOLD } from "./config"


let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let viewportElement: HTMLElement | null = null;

// ✨ 终端配置采用新的漂亮浅色主题 ✨


const startPolling = () => {









// 【修复】防止重复触发：如果已经在启动流程中或已经在轮询，跳过
if (pollingTimeout || isStartingPolling.value) {
  console.log("轮询已在运行或正在启动，跳过启动", {
    pollingTimeout: pollingTimeout !== null,
    isStartingPolling: isStartingPolling.value,
  });
  return;
}

if (isCacheOverflowingInHistoryMode.value) {
  console.warn("无法启动轮询：缓存溢出且在历史模式", {
    totalCount: store.totalCount,
    maxCacheSize: MAX_CACHE_SIZE,
    isLiveMode: isLiveMode.value,
  });
  return;
}

if (store.isPermanentError) {
  console.warn("无法启动轮询：超过最大重试次数");
  return;
}

// 【修复】设置启动标记，防止重复触发
isStartingPolling.value = true;

console.log("启动轮询", {
  isLiveMode: isLiveMode.value,
  totalCount: store.totalCount,
  filteredCount: store.filteredCount,
  viewportStart: viewportStart.value,
  maxSliderValue: maxSliderValue.value,
  isPolling: isPolling.value,
});

returnToLiveMode();

nextTick(() => {
  // 【修复】再次检查，确保在 nextTick 期间没有其他调用启动轮询
  // 注意：只检查 pollingTimeout，不检查 isPolling，因为 isPolling 可能还未设置
  if (pollingTimeout) {
    console.log("轮询已在运行（pollingTimeout 已设置），跳过启动");
    isStartingPolling.value = false;
    return;
  }

  if (isCacheOverflowingInHistoryMode.value) {
    console.warn("nextTick 检查：缓存溢出且在历史模式，不启动轮询");
    isStartingPolling.value = false;
    return;
  }

  if (store.isPermanentError) {
    console.warn("nextTick 检查：超过最大重试次数，不启动轮询");
    isStartingPolling.value = false;
    return;
  }

  // 【修复】在初始状态下（filteredCount 为 0 或很少），即使不在实时模式也应该启动轮询
  // 因为此时用户应该处于最新状态，只是数据还没有加载
  const shouldStartPolling = isLiveMode.value || store.filteredCount === 0;
  
  if (!shouldStartPolling) {
    console.warn("nextTick 检查：不在实时模式且已有数据，不启动轮询", {
      viewportStart: viewportStart.value,
      maxSliderValue: maxSliderValue.value,
      isLiveMode: isLiveMode.value,
      filteredCount: store.filteredCount,
    });
    isStartingPolling.value = false;
    return;
  }

  isPolling.value = true;
  store.resetRetryState();

  setTimeout(() => {
    // 【修复】清除启动标记
    isStartingPolling.value = false;

    if (!isPolling.value) {
      console.log("轮询已被停止，不再继续");
      return;
    }

    if (!isLiveMode.value) {
      console.warn("延迟检查：不在实时模式，停止轮询", {
        viewportStart: viewportStart.value,
        maxSliderValue: maxSliderValue.value,
        isLiveMode: isLiveMode.value,
      });
      stopPolling(true);
      return;
    }

    if (isCacheOverflowingInHistoryMode.value) {
      console.warn("延迟检查：缓存溢出且在历史模式，停止轮询");
      stopPolling(true);
      return;
    }

    scrollToBottom();

    runCycle().catch((err) => {
      console.error("runCycle 执行出错", err);
      stopPolling(true);
    });

    setTimeout(() => {
      if (isPolling.value && !pollingTimeout) {
        console.warn("runCycle 执行后未设置 pollingTimeout，重置 isPolling");
isPolling.value = false;
      }
    }, 100);
  }, 50);
});
};

const isPolling = ref(false); // 【修复】初始值改为 false，只有真正启动轮询后才设为 true
const autoScroll = ref(true);
const viewportStart = ref(0);
let pollingTimeout: number | null = null;
let debounceTimeout: number | null = null;
const isStartingPolling = ref(false); // 【新增】标记是否正在启动轮询，防止重复触发

const currentFilterMode = ref<FilterMode>("ALL");
const clientIdFilter = ref("");

const isWritingToTerminal = ref(false);
const isTerminalAtBottom = ref(true);
const horizontalScrollOffset = ref(0);

// === 计算属性 ===
const maxSliderValue = computed(() =>
Math.max(0, store.filteredCount - TERMINAL_SIZE)
);
const isSliderNeeded = computed(() => maxSliderValue.value > 0);
const isLiveMode = computed(() => {
return viewportStart.value >= maxSliderValue.value - 1;
});
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

const isFilterActive = (
type: "LEVEL" | "GROUP_ID" | "CLIENT_ID" | "USER_ID"
) => {
if (currentFilterMode.value === "NONE") return false;
if (currentFilterMode.value === "ALL") return true;
return currentFilterMode.value === type;
};

const isCacheOverflowingInHistoryMode = computed(() => {
return store.totalCount >= MAX_CACHE_SIZE - 50 && !isLiveMode.value;
});

const statusTitleText = computed(() => {
if (isPolling.value) {
    if (isLiveMode.value) return "实时监控";
    return "历史回溯";
}
if (store.isPollingError) return "轮询失败";
if (isCacheOverflowingInHistoryMode.value) return "已暂停";
return "已暂停";
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


// 滚轮监听器：专用于快速捕捉用户向上滚动意图 (UNLOCK)
const wheelListener = (e: WheelEvent) => {
if (isWritingToTerminal.value) return;

if (e.deltaY < 0) {
    if (isLiveMode.value && autoScroll.value) {
    autoScroll.value = false;
    }
}
};

// DOM Scroll 监听器
const domScrollListener = (e: Event) => {
if (isWritingToTerminal.value) return;

const target = e.target as HTMLElement;
if (!target || !isLiveMode.value) return;

const isAtBottomDOM =
    target.scrollHeight - target.scrollTop <= target.clientHeight + 3;

isTerminalAtBottom.value = isAtBottomDOM;

if (isAtBottomDOM && !autoScroll.value) {
    autoScroll.value = true;
} else if (!isAtBottomDOM && autoScroll.value) {
    autoScroll.value = false;
}
};

// 横向滚动监听器
const horizontalScrollListener = (e: Event) => {
const target = e.target as HTMLElement;
if (target) {
    horizontalScrollOffset.value = -target.scrollLeft;
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

const shouldBeInLiveMode = isLiveMode.value;
clampViewportStart();

if (shouldBeInLiveMode && !isLiveMode.value) {
    viewportStart.value = maxSliderValue.value;
    clampViewportStart();
}

const logsToRender = store.filteredLogs.slice(viewportStart.value, TERMINAL_SIZE);  

const wasAtBottom = isTerminalAtBottom.value;

isWritingToTerminal.value = true;

const maxRenderLines = Math.min(logsToRender.length, TERMINAL_SIZE);
const logsToRenderLimited = logsToRender.slice(0, maxRenderLines);

term.clear();
const separator = "-".repeat(term.cols);
term.writeln(`\x1b[90m${separator}\x1b[0m`);
    logsToRenderLimited.forEach((item) => term?.writeln(item.formattedMessage));

if (isLiveMode.value && autoScroll.value) {
    term.scrollToBottom();
    isTerminalAtBottom.value = true;
} else if (isLiveMode.value) {
    const base = term.buffer.active.baseY;
    const view = term.buffer.active.viewportY;
    isTerminalAtBottom.value = view >= base - SCROLL_THRESHOLD;
} else {
    isTerminalAtBottom.value = wasAtBottom;
}

setTimeout(() => {
    isWritingToTerminal.value = false;
}, 0);
};

const returnToLiveMode = () => {
console.log("returnToLiveMode 被调用", {
    before: {
    viewportStart: viewportStart.value,
    maxSliderValue: maxSliderValue.value,
    isLiveMode: isLiveMode.value,
    isPolling: isPolling.value,
    isStartingPolling: isStartingPolling.value,
    },
});

viewportStart.value = maxSliderValue.value;
clampViewportStart();

if (!isLiveMode.value) {
    console.warn("returnToLiveMode: isLiveMode 未正确更新，强制设置", {
    viewportStart: viewportStart.value,
    maxSliderValue: maxSliderValue.value,
    isLiveMode: isLiveMode.value,
    });
    viewportStart.value = Math.max(0, maxSliderValue.value);
    if (!isLiveMode.value) {
    console.error("returnToLiveMode: isLiveMode 仍然未正确更新", {
        viewportStart: viewportStart.value,
        maxSliderValue: maxSliderValue.value,
        isLiveMode: isLiveMode.value,
    });
    }
}

autoScroll.value = true;
isTerminalAtBottom.value = true;
renderWindow();

// 【修复】移除 returnToLiveMode 中的自动启动轮询逻辑
// 轮询启动应该由 watch(isLiveMode) 统一管理，避免重复触发
// 只在明确需要启动轮询的场景（如点击"回到最新"按钮）才在这里启动
};

// === 交互处理 ===
const handleUserFilterToggle = () => {
if (isUserFiltered.value) {
    store.setUserIdFilter(null);
} else {
    store.setUserIdFilter(CURRENT_USER);
}
};

const handleFilterModeChange = () => {
store.setFilterMode(currentFilterMode.value);
returnToLiveMode();
};

const handleClientFilterChange = () => {
if (debounceTimeout) clearTimeout(debounceTimeout);
debounceTimeout = window.setTimeout(() => {
    store.setClientIdFilter(clientIdFilter.value || null);
    returnToLiveMode();
}, 300) as unknown as number;
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
}
);

watch(() => store.clientIdFilter, (val) => {  
    const newVal = val || "";
    if (clientIdFilter.value !== newVal) {
    clientIdFilter.value = newVal;
    }
}
);

watch(() => store.userIdFilter, () => {   
    returnToLiveMode();
}
);

const loadMoreHistory = async () => {
if (!store.hasMoreHistory || store.isFetchingHistory || !term) return 0;

const oldLogs = store.filteredLogs;
const currentAnchorId =
    oldLogs.length > 0 && viewportStart.value < oldLogs.length
    ? oldLogs[viewportStart.value].id
    : null;

const oldLogsToRender = store.filteredLogs.slice(viewportStart.value, TERMINAL_SIZE);
const oldFirstLogId =
    oldLogsToRender.length > 0 ? oldLogsToRender[0].id : null;

const buffer = term.buffer.active;
const currentViewportY = buffer.viewportY;
const currentBaseY = buffer.baseY;
const scrollOffsetFromTop = currentBaseY - currentViewportY;
const currentBufferLength = buffer.length;

const logsAddedCount = await store.fetchOlderLogs();

if (logsAddedCount === -1) {
    if (isPolling.value) {
    stopPolling(true);
    }
    return 0;
}

if (logsAddedCount > 0) {
    const newLogs = store.filteredLogs;

    if (currentAnchorId) {
    const newAnchorIndex = newLogs.findIndex(
        (log) => log.id === currentAnchorId
    );
    if (newAnchorIndex !== -1) {
        viewportStart.value = newAnchorIndex;
    } else {
        viewportStart.value = Math.min(logsAddedCount, maxSliderValue.value);
    }
    } else {
    viewportStart.value = 0;
    }

    clampViewportStart();

    const newLogsToRender = sliceArray(
    store.filteredLogs,
    viewportStart.value,
    TERMINAL_SIZE
    );

    let actualNewLogs: typeof newLogsToRender = [];
    if (oldFirstLogId && newLogsToRender.length > 0) {
    const oldFirstLogIndex = newLogsToRender.findIndex(
        (log) => log.id === oldFirstLogId
    );
    if (oldFirstLogIndex > 0) {
        actualNewLogs = newLogsToRender.slice(0, oldFirstLogIndex);
    } else if (oldFirstLogIndex === -1) {
        renderWindow();
        return logsAddedCount;
    }
    } else if (newLogsToRender.length > 0 && oldLogsToRender.length === 0) {
    actualNewLogs = newLogsToRender;
    }

    if (!isLiveMode.value && term && actualNewLogs.length > 0) {
    const t = term;
    const newLinesCount = actualNewLogs.length;

    const maxScrollback = TERMINAL_SIZE;
    const willExceedScrollback =
        currentBufferLength + newLinesCount > maxScrollback;

    if (willExceedScrollback) {
        console.warn(
        `增量更新会导致超出 scrollback 限制 (${
            currentBufferLength + newLinesCount
        } > ${maxScrollback})，使用完全重新渲染`
        );
        renderWindow();
        return logsAddedCount;
    }

    t.scrollLines(newLinesCount);
    t.write("\x1b[s");
    t.write("\x1b[H");

    actualNewLogs.forEach((item, index) => {
        if (index > 0) {
        t.write("\r\n");
        }
        t.write("\x1b[2K");
        t.write("\r");
        t.write(item.formattedMessage);
    });

    t.write("\x1b[u");

    isTerminalAtBottom.value = false;
    autoScroll.value = false;
    } else {
    renderWindow();

    setTimeout(() => {
        if (!term || isLiveMode.value) return;

        const newBuffer = term.buffer.active;
        const newBaseY = newBuffer.baseY;

        const targetViewportY = Math.max(0, newBaseY - scrollOffsetFromTop);
        const currentViewportY = newBuffer.viewportY;
        const scrollLines = targetViewportY - currentViewportY;

        if (scrollLines !== 0) {
        term.scrollLines(scrollLines);
        isTerminalAtBottom.value = false;
        autoScroll.value = false;
        }
    }, 0);
    }
}

return logsAddedCount;
};

const handleSliderInteraction = () => {
autoScroll.value = false;
clampViewportStart();
};

const handleSliderChange = () => {
renderWindow();
// 【修复】如果滑到最右边（实时模式），且未在轮询，启动轮询
// 但需要检查是否已经在启动流程中，避免重复触发
if (isLiveMode.value && !isPolling.value && !isStartingPolling.value && !store.isPermanentError && !isCacheOverflowingInHistoryMode.value) {
    // 延迟检查，避免与 watch(isLiveMode) 重复触发
    setTimeout(() => {
    if (isLiveMode.value && !isPolling.value && !isStartingPolling.value && !pollingTimeout) {
        startPolling();
    }
    }, 100);
}
};

const handleExportLogs = () => {
exportLogsToJson(store.allLogs)
}

const clearView = () => {
store.clearAllLogs();
term?.clear();
};

watch(autoScroll, (newValue) => {
if (newValue && isLiveMode.value) {
    term?.scrollToBottom();
    isTerminalAtBottom.value = true;
}
});

const runCycle = async () => {
if (isCacheOverflowingInHistoryMode.value) {
    if (isPolling.value) {
    console.log("停止轮询：缓存溢出且在历史模式", {
        totalCount: store.totalCount,
        maxCacheSize: MAX_CACHE_SIZE,
        isLiveMode: isLiveMode.value,
        viewportStart: viewportStart.value,
        maxSliderValue: maxSliderValue.value,
    });
    stopPolling(true);
    }
    return;
}

if (store.isPermanentError) {
    if (isPolling.value) {
    console.log("停止轮询：超过最大重试次数");
    stopPolling(true);
    }
    return;
}

if (!isPolling.value) {
    console.log("runCycle: isPolling 为 false，停止执行");
    return;
}

const wasInLiveMode = isLiveMode.value;
const { newLogs, nextDelay } = await store.pollNewLogs();

if (nextDelay === 0) {
    if (isPolling.value) {
    stopPolling(true);
    }
    return;
}

if (wasInLiveMode) {
    if (!isLiveMode.value) {
    if (isPolling.value) {
        pollingTimeout = window.setTimeout(
        runCycle,
        nextDelay
        ) as unknown as number;
    }
    return;
    }

    viewportStart.value = maxSliderValue.value;
    if (!store.isPollingError && newLogs.length > 0) {
    const itemsToRender = newLogs.filter((item) =>
        isLogVisible(
        item,
        store.filterMode,
        {
            levelFilter: store.levelFilter || undefined,
            groupIdFilter: store.groupIdFilter || undefined,
            clientIdFilter: store.clientIdFilter || undefined,
            userIdFilter: store.userIdFilter || undefined,
        }
        )
    );

    if (itemsToRender.length > 0 && term) {
        isWritingToTerminal.value = true;
        const currentTerm = term;
        itemsToRender.forEach((item) => currentTerm.writeln(item.formattedMessage));

        if (autoScroll.value) {
        currentTerm.scrollToBottom();
        isTerminalAtBottom.value = true;
        }
        setTimeout(() => {
        isWritingToTerminal.value = false;
        }, 0);
    }
    }
}

if (isPolling.value) {
    pollingTimeout = window.setTimeout(
    runCycle,
    nextDelay
    ) as unknown as number;
    console.log("runCycle: 设置 pollingTimeout", {
    nextDelay,
    isPolling: isPolling.value,
    pollingTimeout: pollingTimeout !== null,
    });
} else {
    console.log("runCycle: isPolling 为 false，不设置 pollingTimeout");
}
};

const stopPolling = (isAutomaticPause: boolean = false) => {
if (pollingTimeout) clearTimeout(pollingTimeout);
pollingTimeout = null;
isPolling.value = false;
isStartingPolling.value = false; // 【修复】清除启动标记
if (!isAutomaticPause) store.resetRetryState();
};

const onResize = () => {
fitAddon?.fit();
renderWindow();
};

watch(() => store.isPollingError,
(isError) => {
    if (isError && store.isPermanentError && isPolling.value) {
    stopPolling(true);
    }
}
);

watch(isLiveMode, (isLive) => {
// 【修复】防止重复触发：如果已经在启动流程中，跳过
if (isLive && !isPolling.value && !isStartingPolling.value && !store.isPermanentError) {
    if (!isCacheOverflowingInHistoryMode.value && !pollingTimeout) {
    // 【修复】添加防抖，避免快速切换时重复触发
    setTimeout(() => {
        // 再次检查状态，确保在延迟期间状态没有变化
        if (isLiveMode.value && !isPolling.value && !isStartingPolling.value && !pollingTimeout && !store.isPermanentError && !isCacheOverflowingInHistoryMode.value) {
        startPolling();
        }
    }, 50);
    }
} else if (!isLive && isPolling.value) {
    stopPolling(true);
}
});

watch(() => store.filteredCount,
(newCount, oldCount) => {
    if (oldCount !== undefined && newCount < oldCount) {
    const removedCount = oldCount - newCount;

    if (!isLiveMode.value) {
        viewportStart.value = Math.max(0, viewportStart.value - removedCount);
    } else {
        viewportStart.value = maxSliderValue.value;
    }

    clampViewportStart();
    if (viewportStart.value !== maxSliderValue.value || !isLiveMode.value) {
        renderWindow();
    }
    }
}
);

watch(maxSliderValue, (newMax) => {
if (viewportStart.value > newMax) {
    viewportStart.value = newMax;
    if (!isLiveMode.value) {
    renderWindow();
    }
}
});

onBeforeUnmount(() => {
if (pollingTimeout) clearTimeout(pollingTimeout);
window.removeEventListener("resize", onResize);

if (terminalRef.value) {
    terminalRef.value.removeEventListener("wheel", wheelListener);
}

if (viewportElement) {
    viewportElement.removeEventListener("scroll", horizontalScrollListener);
    viewportElement.removeEventListener("scroll", domScrollListener);
}
term?.dispose();
});
</script>

<style scoped>
/* ---------------- 基础样式 - 采用柔和的浅色调 ---------------- */
.terminal-wrapper {
display: flex;
flex-direction: column;
width: 100%;
height: 600px;
background-color: #f7f7f7;
border-radius: 8px;
overflow: hidden;
border: 1px solid #eaeaea;
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
    Arial, sans-serif;
}

.control-bar {
border-radius: 0;
border: none;
border-bottom: 1px solid #eaeaea;
}

.filter-row {
user-select: none;
color: #383a42;
font-size: 13px;
}

.input-group {
display: flex;
align-items: center;
gap: 4px;
}

.label {
font-weight: 600;
}

.mode-select {
font-weight: bold;
}

.filter-checkbox {
color: #007acc;
font-weight: 500;
}

.header {
border-radius: 0;
border: none;
border-bottom: 1px solid #eaeaea;
font-size: 12px;
color: #383a42;
}

.status-dot {
width: 8px;
height: 8px;
border-radius: 50%;
background-color: #999;
transition: all 0.3s;
}

.status-dot.live {
background-color: #50a14f;
box-shadow: 0 0 6px rgba(80, 161, 79, 0.4);
}

.status-dot.history {
background-color: #9d7a00;
}

.status-dot.error {
background-color: #e4564a;
animation: pulse 1s infinite;
}

.status-dot.paused {
background-color: #aaaaaa;
}

@keyframes pulse {
0% {
    opacity: 1;
}
50% {
    opacity: 0.5;
}
100% {
    opacity: 1;
}
}

.title {
font-weight: 600;
}

.meta-info {
color: #666;
}

.log-gap-warning {
color: #e4564a;
margin-left: 8px;
font-weight: 500;
}

.resume-hint {
color: #666;
font-style: italic;
font-size: 11px;
}

.timeline-bar {
border-radius: 0;
border: none;
border-bottom: 1px solid #eaeaea;
background: #eeeeee;
font-size: 12px;
color: #666;
}

.time-label {
white-space: nowrap;
display: flex;
align-items: center;
}

.slider-placeholder {
height: 4px;
border-radius: 2px;
background-color: #ddd;
}

.no-more-history {
color: #999;
}

.column-header-wrapper {
position: relative;
z-index: 5;
background-color: #f7f7f7;
transition: transform 0.05s linear;
border-top: 1px solid #eaeaea;
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
.column-header > span {
display: inline-block;
padding-right: 1ch;
}
.col-timestamp {
min-width: 10ch;
}
.col-service {
min-width: 12ch;
color: #008c9e;
} /* 终端 Cyan */
.col-user {
min-width: 10ch;
color: #4078f2;
} /* 终端 Blue */
.col-group {
min-width: 14ch;
color: #a626a4;
} /* 终端 Magenta */
.col-level {
min-width: 6ch;
}
.col-message {
flex-grow: 1;
color: #383a42;
}

/* 底部按钮样式 (更新为新主题颜色) */
.resume-btn {
position: absolute;
bottom: 20px;
left: 50%;
transform: translateX(-50%);
background-color: #9d7a00; /* 终端 Yellow/Gold */
color: #fafafa;
padding: 6px 16px;
border-radius: 20px;
font-size: 12px;
font-weight: bold;
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
z-index: 10;
cursor: pointer;
}
.scroll-bottom-btn {
position: absolute;
bottom: 20px;
right: 20px;
background-color: #007acc; /* 强调蓝 */
color: white;
padding: 6px 12px;
border-radius: 20px;
font-size: 12px;
font-weight: bold;
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
cursor: pointer;
z-index: 10;
transition: background 0.2s;
}
.scroll-bottom-btn:hover {
background-color: #0069b3;
}

.fade-enter-active,
.fade-leave-active {
transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
opacity: 0;
}
</style>
