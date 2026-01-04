<template>
  <div class="smart-tabs-wrapper">
    <div class="smart-tabs-header">
      <div 
        class="nav-control-btn left" 
        :class="{ 'is-disabled': navState.isLeftDisabled }"
        @click="handleManualScroll('left')"
      >
        <el-icon><ArrowLeft /></el-icon>
      </div>

      <div 
        class="scroll-container" 
        ref="scrollContainerRef" 
        @scroll="onScroll"
        @wheel="handleWheel"
      >
        <div class="tabs-nav-list" ref="tabsListRef">
          <div
            v-for="item in tabs"
            :key="item.name"
            :ref="(el) => setTabRef(el, item.name)"
            class="tab-nav-item"
            :class="{ 'is-active': modelValue === item.name }"
            @click="handleTabClick(item)"
          >
            <span class="tab-label">{{ item.label }}</span>
          </div>
        </div>
      </div>

      <div 
        class="nav-control-btn right" 
        :class="{ 'is-disabled': navState.isRightDisabled }"
        @click="handleManualScroll('right')"
      >
        <el-icon><ArrowRight /></el-icon>
      </div>

      <div class="more-control-wrapper" v-show="navState.hasOverflow">
        <el-dropdown 
          trigger="click" 
          :disabled="navState.isRightDisabled"
          @command="handleTabClick"
          @visible-change="recalcOverflowTabs"
        >
          <div 
            class="nav-control-btn more"
            :class="{ 'is-disabled': navState.isRightDisabled }"
          >
            <el-icon><MoreFilled /></el-icon>
          </div>
          
          <template #dropdown>
            <el-dropdown-menu class="smart-tabs-dropdown">
              <el-dropdown-item 
                v-for="item in overflowTabs" 
                :key="item.name" 
                :command="item"
                :class="{ 'is-active-item': modelValue === item.name }"
              >
                {{ item.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="smart-tabs-content">
      <div 
        v-for="item in tabs" 
        :key="item.name"
        v-show="modelValue === item.name"
        class="tab-pane-container"
      >
        <slot :name="item.name"></slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { ArrowLeft, ArrowRight, MoreFilled } from '@element-plus/icons-vue';

const props = defineProps({
  modelValue: { type: String, required: true },
  tabs: { type: Array, default: () => [] }
});

const emits = defineEmits(['update:modelValue', 'tab-click']);

// DOM 引用
const scrollContainerRef = ref(null);
const tabRefs = new Map();
let resizeObserver = null;

// 状态管理
const navState = reactive({
  isLeftDisabled: true,
  isRightDisabled: true,
  hasOverflow: false
});
const overflowTabs = ref([]);

const setTabRef = (el, name) => {
  if (el) tabRefs.set(name, el);
  else tabRefs.delete(name);
};

// 1. 核心状态计算
const updateNavState = () => {
  const container = scrollContainerRef.value;
  if (!container) return;

  const { scrollLeft, clientWidth, scrollWidth } = container;

  // 是否溢出
  navState.hasOverflow = scrollWidth > clientWidth + 1;
  // 左侧触顶
  navState.isLeftDisabled = scrollLeft <= 1;
  // 右侧触底 (需求4：最右侧时禁用右箭头和更多按钮)
  navState.isRightDisabled = scrollLeft + clientWidth >= scrollWidth - 1;
};

// 2. 计算当前不可见的 Tabs
const recalcOverflowTabs = (visible) => {
  if (!visible || !scrollContainerRef.value) return;
  
  const containerRect = scrollContainerRef.value.getBoundingClientRect();
  const hidden = [];

  props.tabs.forEach(tab => {
    const el = tabRefs.get(tab.name);
    if (el) {
      const rect = el.getBoundingClientRect();
      // 如果 Tab 的左右边界超出容器可视范围，则放入更多列表
      const isOut = (rect.left < containerRect.left - 2) || (rect.right > containerRect.right + 2);
      if (isOut) hidden.push(tab);
    }
  });
  overflowTabs.value = hidden;
};

// 3. 滚动处理
const handleManualScroll = (direction) => {
  const container = scrollContainerRef.value;
  if (!container) return;
  const offset = container.clientWidth * 0.7; // 每次滚动 70% 容器宽度
  container.scrollBy({
    left: direction === 'left' ? -offset : offset,
    behavior: 'smooth'
  });
};

// 4. 支持鼠标滚轮横向滚动
const handleWheel = (e) => {
  if (!navState.hasOverflow) return;
  e.preventDefault();
  scrollContainerRef.value.scrollLeft += e.deltaY;
};

const onScroll = () => {
  updateNavState();
};

// 5. 点击交互
const handleTabClick = (tab) => {
  if (!tab || typeof tab !== 'object') return;
  emits('update:modelValue', tab.name);
  emits('tab-click', tab);
};

// 确保当前选中的项在视野内
const scrollToActive = () => {
  nextTick(() => {
    const el = tabRefs.get(props.modelValue);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
};

// 生命周期
onMounted(() => {
  updateNavState();
  scrollToActive();
  
  resizeObserver = new ResizeObserver(updateNavState);
  if (scrollContainerRef.value) resizeObserver.observe(scrollContainerRef.value);
});

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
});

// 监听
watch(() => props.tabs, () => nextTick(updateNavState), { deep: true });
watch(() => props.modelValue, () => {
  scrollToActive();
  setTimeout(updateNavState, 400); // 等待滚动动画结束
});
</script>

<style scoped>
.smart-tabs-wrapper {
  width: 100%;
  background-color: #fff;
}

/* 头部导航条 */
.smart-tabs-header {
  display: flex;
  align-items: center;
  height: 40px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  box-sizing: border-box;
}

/* 滚动区域 */
.scroll-container {
  flex: 1;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  position: relative;
  scrollbar-width: none; /* Firefox */
}
.scroll-container::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.tabs-nav-list {
  display: inline-flex;
  height: 100%;
}

/* 单个 Tab 导航样式 */
.tab-nav-item {
  display: flex;
  align-items: center;
  padding: 0 20px;
  height: 100%;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  border-right: 1px solid #e4e7ed;
  transition: all 0.3s;
  background: #fff;
  position: relative;
}

.tab-nav-item:hover {
  color: #409eff;
}

.tab-nav-item.is-active {
  color: #409eff;
  background-color: #fff;
  font-weight: bold;
}

.tab-nav-item.is-active::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: #409eff;
}

/* 控制按钮 */
.nav-control-btn {
  width: 32px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  background-color: #fff;
  z-index: 10;
  border-right: 1px solid #e4e7ed;
  transition: color 0.3s;
}

.nav-control-btn.right {
  border-left: 1px solid #e4e7ed;
  border-right: none;
}

.nav-control-btn.more {
  border-left: 1px solid #e4e7ed;
  border-right: none;
}

.nav-control-btn:hover:not(.is-disabled) {
  color: #409eff;
  background-color: #f2f6fc;
}

.nav-control-btn.is-disabled {
  color: #dcdfe6;
  cursor: not-allowed;
}

.more-control-wrapper {
  height: 100%;
}

/* 内容区域 */
.smart-tabs-content {
  padding: 20px;
  border: 1px solid #e4e7ed;
  border-top: none;
}

/* 下拉菜单选中样式 */
:deep(.is-active-item) {
  color: #409eff !important;
  font-weight: bold;
}
</style>
