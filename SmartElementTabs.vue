<template>
  <div class="smart-tabs-wrapper" ref="containerRef">
    <el-tabs
      v-model="activeName"
      ref="tabsRef"
      class="full-width-tabs"
      @tab-click="handleTabClick"
      v-bind="$attrs" 
    >
      <slot>
        <el-tab-pane
          v-for="item in tabList"
          :key="item.name"
          :label="item.label"
          :name="item.name"
        >
          <slot :name="item.name">{{ item.content }}</slot>
        </el-tab-pane>
      </slot>
    </el-tabs>

    <div v-if="navState.hasOverflow" class="custom-more-action">
      <el-dropdown trigger="click" :disabled="navState.isRightDisabled" @command="handleMoreCommand">
        <div class="more-btn-icon" :class="{ 'is-disabled': navState.isRightDisabled }">
          <el-icon><MoreFilled /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu class="smart-overflow-dropdown">
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

const navState = reactive({ hasOverflow: false, isRightDisabled: false });
const overflowTabs = ref([]);

const updateNavLogic = () => {
  const el = tabsRef.value?.$el;
  if (!el) return;

  const navScroll = el.querySelector('.el-tabs__nav-scroll');
  const navList = el.querySelector('.el-tabs__nav');
  const nextBtn = el.querySelector('.el-tabs__nav-next');

  // 风险点1处理：如果容器隐藏，宽度为0，不进行逻辑计算
  if (!navScroll || navScroll.offsetWidth === 0) return;

  navState.hasOverflow = navList.offsetWidth > navScroll.offsetWidth;
  navState.isRightDisabled = nextBtn?.classList.contains('is-disabled');

  const scrollRect = navScroll.getBoundingClientRect();
  const tabItems = navList.querySelectorAll('.el-tabs__item');
  const hidden = [];
  
  tabItems.forEach((item, index) => {
    const rect = item.getBoundingClientRect();
    // 增加 2px 容错，判断是否在可见区域内
    if (rect.right > scrollRect.right + 2 || rect.left < scrollRect.left - 2) {
      // 兼容 slot 模式和数组模式
      const tabData = props.tabList[index] || { 
        label: item.innerText.trim(), 
        name: item.id.replace('tab-', '') 
      };
      hidden.push(tabData);
    }
  });
  overflowTabs.value = hidden;
};

// 各种交互触发更新
const handleTabClick = () => setTimeout(updateNavLogic, 300);
const handleMoreCommand = (name) => {
  activeName.value = name;
  nextTick(() => {
    tabsRef.value?.scrollToActiveTab?.();
    setTimeout(updateNavLogic, 350);
  });
};

let resizeObs = null;
let mutationObs = null;

onMounted(() => {
  nextTick(() => {
    updateNavLogic();
    resizeObs = new ResizeObserver(() => {
      // 使用 requestAnimationFrame 优化 Resize 性能
      window.requestAnimationFrame(updateNavLogic);
    });
    if (containerRef.value) resizeObs.observe(containerRef.value);

    const header = tabsRef.value?.$el?.querySelector('.el-tabs__header');
    if (header) {
      mutationObs = new MutationObserver(updateNavLogic);
      mutationObs.observe(header, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
  });
});

onBeforeUnmount(() => {
  resizeObs?.disconnect();
  mutationObs?.disconnect();
});

// 监听 V-Model
watch(() => props.modelValue, (v) => {
  if (v !== activeName.value) {
    activeName.value = v;
    nextTick(() => tabsRef.value?.scrollToActiveTab?.());
  }
});
watch(activeName, (v) => emit('update:modelValue', v));

// 风险点2处理：监听 Tab 列表变化
watch(() => props.tabList.length, () => {
  nextTick(() => {
    updateNavLogic();
    setTimeout(updateNavLogic, 400); // 补偿动画时间
  });
});
</script>

<style scoped>
.smart-tabs-wrapper {
  position: relative;
  width: 100%;
  box-sizing: border-box;
}

/* 核心：为导航栏右侧预留 40px，但不影响 content */
:deep(.el-tabs__nav-wrap) {
  padding-right: 40px;
}

/* 核心：偏移原生的下一页按钮 */
:deep(.el-tabs__nav-next) {
  right: 40px !important; 
  display: flex;
  align-items: center;
  justify-content: center;
  width: 25px;
}

/* 更多按钮绝对定位 */
.custom-more-action {
  position: absolute;
  right: 0;
  top: 0;
  width: 40px;
  height: 40px; 
  z-index: 20;
  background: #fff;
}

.more-btn-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  border-left: 1px solid #f0f2f5;
  border-bottom: 2px solid #e4e7ed; /* 这里的颜色要和 el-tabs 的边框色一致 */
}

.more-btn-icon:hover:not(.is-disabled) {
  color: #409eff;
  background-color: #f5f7fa;
}

.more-btn-icon.is-disabled {
  color: #dcdfe6 !important;
  cursor: not-allowed;
}

/* 下拉菜单高亮样式 */
:deep(.smart-overflow-dropdown .is-active) {
  color: #409eff !important;
  font-weight: bold;
  background-color: #f5f7fa;
}

:deep(.el-tabs__content) {
  width: 100%;
}
</style>
