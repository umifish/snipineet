<template>
  <div class="smart-tabs-container" ref="containerRef">
    <el-tabs
      v-model="activeName"
      ref="tabsRef"
      class="custom-el-tabs"
      @tab-click="handleTabClick"
    >
      <el-tab-pane
        v-for="item in tabList"
        :key="item.name"
        :label="item.label"
        :name="item.name"
      >
        <slot :name="item.name">{{ item.content }}</slot>
      </el-tab-pane>
    </el-tabs>

    <div 
      v-if="navState.hasOverflow" 
      class="more-dropdown-wrapper"
    >
      <el-dropdown 
        trigger="click" 
        :disabled="navState.isRightDisabled"
        @command="handleMoreCommand"
        @visible-change="onDropdownVisible"
      >
        <div 
          class="more-trigger-btn" 
          :class="{ 'is-disabled': navState.isRightDisabled }"
        >
          <el-icon><MoreFilled /></el-icon>
        </div>
        
        <template #dropdown>
          <el-dropdown-menu class="tabs-more-menu">
            <el-dropdown-item 
              v-for="item in overflowTabs" 
              :key="item.name" 
              :command="item.name"
              :class="{ 'is-active': activeName === item.name }"
            >
              {{ item.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { MoreFilled } from '@element-plus/icons-vue';

const props = defineProps({
  tabList: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);

const activeName = ref(props.modelValue || props.tabList[0]?.name);
const tabsRef = ref(null);
const containerRef = ref(null);

const navState = reactive({
  hasOverflow: false,
  isLeftDisabled: true,
  isRightDisabled: false
});

const overflowTabs = ref([]);

// --- 核心逻辑 ---

const updateTabsLogic = () => {
  const el = tabsRef.value?.$el;
  if (!el) return;

  // 获取 Element 内部 DOM 元素
  const navScroll = el.querySelector('.el-tabs__nav-scroll');
  const navList = el.querySelector('.el-tabs__nav');
  const nextBtn = el.querySelector('.el-tabs__nav-next');
  const prevBtn = el.querySelector('.el-tabs__nav-prev');

  if (!navScroll || !navList) return;

  // 1. 判断是否溢出 (使用 offsetWidth 避免 box-sizing 干扰)
  navState.hasOverflow = navList.offsetWidth > navScroll.offsetWidth;

  // 2. 同步左右箭头禁用状态
  // Element Plus 会根据滚动位置自动切换 is-disabled 类名
  navState.isLeftDisabled = prevBtn?.classList.contains('is-disabled');
  navState.isRightDisabled = nextBtn?.classList.contains('is-disabled');

  // 3. 筛选溢出项 (仅当 Dropdown 需要显示时计算)
  const scrollRect = navScroll.getBoundingClientRect();
  const items = navList.querySelectorAll('.el-tab-pane'); // 这里其实是取 nav-item
  const tabElements = navList.querySelectorAll('.el-tabs__item');
  
  const hidden = [];
  tabElements.forEach((tabEl, index) => {
    const rect = tabEl.getBoundingClientRect();
    // 如果 Tab 边缘超出容器边界 2px 以上，视为隐藏
    if (rect.right > scrollRect.right + 2 || rect.left < scrollRect.left - 2) {
      hidden.push(props.tabList[index]);
    }
  });
  overflowTabs.value = hidden;
};

// 下拉菜单显示时重新计算一次，确保数据最准
const onDropdownVisible = (visible) => {
  if (visible) updateTabsLogic();
};

const handleTabClick = () => {
  // 延迟执行以等待 Element 内部的 scroll 动画完成
  setTimeout(updateTabsLogic, 300);
};

const handleMoreCommand = (name) => {
  activeName.value = name;
  emit('update:modelValue', name);
  // 调用 Element 内部方法定位 Tab
  nextTick(() => {
    tabsRef.value?.scrollToActiveTab?.();
    setTimeout(updateTabsLogic, 300);
  });
};

// 监听与观察
let resizeObs = null;
let mutationObs = null;

onMounted(() => {
  nextTick(() => {
    updateTabsLogic();

    // A. 监听容器大小变化 (处理窗口缩放)
    resizeObs = new ResizeObserver(updateTabsLogic);
    if (containerRef.value) resizeObs.observe(containerRef.value);

    // B. 监听 DOM 类名变化 (处理箭头禁用状态)
    const el = tabsRef.value?.$el;
    const header = el?.querySelector('.el-tabs__header');
    if (header) {
      mutationObs = new MutationObserver(updateTabsLogic);
      mutationObs.observe(header, { 
        attributes: true, 
        subtree: true, 
        attributeFilter: ['class'] 
      });
    }
  });
});

onBeforeUnmount(() => {
  resizeObs?.disconnect();
  mutationObs?.disconnect();
});

watch(() => props.modelValue, (val) => {
  activeName.value = val;
});

watch(activeName, (val) => {
  emit('update:modelValue', val);
});
</script>

<style scoped>
/* 确保所有元素遵循 border-box */
.smart-tabs-container,
.smart-tabs-container * {
  box-sizing: border-box;
}

.smart-tabs-container {
  position: relative;
  width: 100%;
  /* 预留右侧“更多”按钮的宽度，防止遮挡原生 next 箭头 */
  padding-right: 40px; 
  background-color: #fff;
}

/* 去掉 el-tabs 默认的 margin，方便我们精确定位 */
:deep(.el-tabs__header) {
  margin-bottom: 0 !important;
}

/* 更多按钮包装器 */
.more-dropdown-wrapper {
  position: absolute;
  right: 0;
  top: 0;
  width: 40px;
  height: 40px; /* 与 Element 默认 Tab 高度对齐 */
  z-index: 10;
  background-color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #e4e7ed;
}

.more-trigger-btn {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  border-left: 1px solid #f0f2f5;
  transition: all 0.2s;
}

.more-trigger-btn:hover:not(.is-disabled) {
  color: #409eff;
  background-color: #f5f7fa;
}

.more-trigger-btn.is-disabled {
  color: #dcdfe6;
  cursor: not-allowed;
}

/* 下拉菜单样式 */
:deep(.tabs-more-menu .is-active) {
  color: #409eff;
  background-color: #ecf5ff;
}

/* 隐藏 el-tabs 溢出时的原生右边距，使其与更多按钮衔接 */
:deep(.el-tabs__nav-wrap.is-scrollable) {
  padding: 0 30px; /* 给原生箭头留位置 */
}
</style>
