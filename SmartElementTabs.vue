<template>
  <div class="smart-tabs-wrapper" ref="containerRef">
    <el-tabs
      v-model="activeName"
      ref="tabsRef"
      class="full-width-tabs"
      @tab-click="handleTabClick"
      v-bind="$attrs"
    >
      <el-tab-pane
        v-for="item in tabList"
        :key="item.name"
        :label="item.label"
        :name="item.name"
      >
        <div class="pane-content-wrapper">
          <slot :name="item.name" :tab="item">
            {{ item.content }}
          </slot>
        </div>
      </el-tab-pane>
    </el-tabs>

    <div v-if="navState.hasOverflow" class="custom-more-action">
      <el-dropdown 
        trigger="click" 
        :disabled="navState.isRightDisabled" 
        @command="handleMoreCommand"
      >
        <div 
          class="more-btn-trigger" 
          :class="{ 'is-disabled': navState.isRightDisabled }"
          title="更多页签"
        >
          <el-icon><MoreFilled /></el-icon>
        </div>
        
        <template #dropdown>
          <el-dropdown-menu class="smart-tabs-dropdown">
            <el-dropdown-item 
              v-for="item in overflowTabs" 
              :key="item.name" 
              :command="item.name"
              :class="{ 'is-active-tab': activeName === item.name }"
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

// 定义属性
const props = defineProps({
  // 数据源
  tabList: {
    type: Array,
    default: () => []
  },
  // 双向绑定支持
  modelValue: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue']);

// 响应式状态
const activeName = ref(props.modelValue || props.tabList[0]?.name);
const tabsRef = ref(null);
const containerRef = ref(null);
const navState = reactive({
  hasOverflow: false,      // 是否溢出
  isRightDisabled: false   // 右侧是否滚动到底
});
const overflowTabs = ref([]); // 被遮挡的页签列表

/**
 * 核心逻辑：计算导航栏状态
 * 检查溢出、同步禁用状态、筛选隐藏项
 */
const updateNavStatus = () => {
  const el = tabsRef.value?.$el;
  if (!el) return;

  const navScroll = el.querySelector('.el-tabs__nav-scroll');
  const navList = el.querySelector('.el-tabs__nav');
  const nextBtn = el.querySelector('.el-tabs__nav-next');

  // 1. 如果容器当前不可见（如在隐藏的弹窗中），跳过计算
  if (!navScroll || navScroll.offsetWidth === 0) return;

  // 2. 判断是否溢出（增加 1px 缓冲区处理浏览器缩放偏差）
  navState.hasOverflow = navList.offsetWidth > navScroll.offsetWidth + 1;

  // 3. 同步原生右侧箭头的禁用状态
  navState.isRightDisabled = nextBtn?.classList.contains('is-disabled');

  // 4. 计算哪些页签超出了可视区域
  const scrollRect = navScroll.getBoundingClientRect();
  const tabItems = navList.querySelectorAll('.el-tabs__item');
  const hiddenItems = [];
  
  tabItems.forEach((tabEl, index) => {
    const rect = tabEl.getBoundingClientRect();
    // 允许 1.5px 的亚像素误差
    const isOut = rect.right > scrollRect.right + 1.5 || rect.left < scrollRect.left - 1.5;
    if (isOut && props.tabList[index]) {
      hiddenItems.push(props.tabList[index]);
    }
  });
  overflowTabs.value = hiddenItems;
};

/**
 * 下拉菜单点击处理
 */
const handleMoreCommand = (name) => {
  activeName.value = name;
  emit('update:modelValue', name);

  nextTick(() => {
    // 调用 Element 原生方法：滚动到激活的 Tab 所在位置
    if (tabsRef.value?.scrollToActiveTab) {
      tabsRef.value.scrollToActiveTab();
    }
    // 等待滚动动画完成后刷新状态
    setTimeout(updateNavStatus, 350);
  });
};

const handleTabClick = () => setTimeout(updateNavStatus, 300);

// --- 观察者逻辑 ---

let resizeObserver = null;
let mutationObserver = null;

onMounted(() => {
  nextTick(() => {
    updateNavStatus();
    
    // 监听容器尺寸变化（响应式）
    resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(updateNavStatus);
    });
    if (containerRef.value) resizeObserver.observe(containerRef.value);

    // 监听 DOM 类名变化（用于实时同步原生的 is-disabled 状态）
    const header = tabsRef.value?.$el?.querySelector('.el-tabs__header');
    if (header) {
      mutationObserver = new MutationObserver(updateNavStatus);
      mutationObserver.observe(header, { 
        attributes: true, 
        subtree: true, 
        attributeFilter: ['class'] 
      });
    }
  });
});

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (mutationObserver) mutationObserver.disconnect();
});

// 同步外部 v-model 变化
watch(() => props.modelValue, (val) => {
  if (val !== activeName.value) {
    activeName.value = val;
    nextTick(() => {
      tabsRef.value?.scrollToActiveTab?.();
      setTimeout(updateNavStatus, 350);
    });
  }
});
</script>

<style scoped>
/* 根容器设置 */
.smart-tabs-wrapper {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  background-color: #fff;
}

/* 核心：只让导航头缩短，不影响内容区 */
:deep(.el-tabs__nav-wrap) {
  padding-right: 40px !important; /* 给“更多”按钮预留 40px 空间 */
}

/* 核心：偏移原生的“下一页”箭头，防止与“更多”按钮重叠 */
:deep(.el-tabs__nav-next) {
  right: 40px !important; 
  display: flex;
  align-items: center;
  justify-content: center;
  width: 25px;
}

/* 自定义“更多”按钮 */
.abs-more-action {
  position: absolute;
  right: 0;
  top: 0;
  width: 40px;
  height: 40px; /* 匹配 el-tabs__header 默认高度 */
  z-index: 10;
  background-color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.more-btn-trigger {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  border-left: 1px solid #f0f2f5;
  border-bottom: 2px solid #e4e7ed; /* 模拟 tabs 底部装饰线 */
  transition: all 0.2s ease;
}

.more-btn-trigger:hover:not(.is-disabled) {
  color: #409eff;
  background-color: #f5f7fa;
}

.more-btn-trigger.is-disabled {
  color: #dcdfe6 !important;
  cursor: not-allowed;
}

/* 下拉菜单高亮激活项 */
:deep(.smart-tabs-dropdown .is-active-tab) {
  color: #409eff !important;
  font-weight: bold;
  background-color: #ecf5ff;
}

/* 强制内容区充满 100% */
:deep(.el-tabs__content) {
  width: 100%;
  padding: 16px 0; /* 可根据需要调整 */
}

.pane-content-wrapper {
  width: 100%;
  box-sizing: border-box;
}
</style>
