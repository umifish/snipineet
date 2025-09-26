<template>
  <el-tabs type="border-card" class="resizable-tabs-container">
    <el-tab-pane label="可调整大小的 Tab">
      <div
        ref="tabContentRef"
        class="tab-content-wrapper"
        :style="{ width: state.width + 'px', height: state.height + 'px' }"
      >
        <div class="content-area">
          <h3>Tab Pane 尺寸调整功能已启用</h3>
          <p>当前内容区域尺寸: {{ state.width }}px x {{ state.height }}px</p>
          <p>拖拽右边、下边或右下角来改变这个区域的尺寸。</p>
        </div>

        <div
          class="resize-handle right"
          @mousedown="startResize($event, 'right')"
        ></div>

        <div
          class="resize-handle bottom"
          @mousedown="startResize($event, 'bottom')"
        ></div>

        <div
          class="resize-handle corner"
          @mousedown="startResize($event, 'corner')"
        ></div>
      </div>
    </el-tab-pane>

    <el-tab-pane label="普通 Tab">
      <div style="padding: 20px">这是一个普通的 Tab，采用默认布局。</div>
    </el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { reactive, onUnmounted } from "vue";
import { ElTabs, ElTabPane } from "element-plus";

const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

const state = reactive({
  width: 600,
  height: 400,
  isResizing: false,
  startMouseX: 0,
  startMouseY: 0,
  startWidth: 0,
  startHeight: 0,
  resizeDirection: "",
});

/**
 * 鼠标按下，开始调整大小
 */
const startResize = (e, direction) => {
  e.preventDefault();
  e.stopPropagation(); // 阻止事件冒泡

  state.isResizing = true;
  state.resizeDirection = direction;
  state.startMouseX = e.clientX;
  state.startMouseY = e.clientY;
  state.startWidth = state.width;
  state.startHeight = state.height;

  // 在 document 上添加事件监听，确保拖拽流畅
  document.addEventListener("mousemove", handleResize);
  document.addEventListener("mouseup", stopResize);
  document.body.style.userSelect = "none"; // 防止拖拽时选中文字
};

/**
 * 鼠标移动，执行调整大小逻辑
 */
const handleResize = (e) => {
  if (!state.isResizing) return;

  const dx = e.clientX - state.startMouseX;
  const dy = e.clientY - state.startMouseY;

  // 调整宽度
  if (state.resizeDirection === "right" || state.resizeDirection === "corner") {
    const newWidth = state.startWidth + dx;
    state.width = Math.max(newWidth, MIN_WIDTH);
  }

  // 调整高度
  if (
    state.resizeDirection === "bottom" ||
    state.resizeDirection === "corner"
  ) {
    const newHeight = state.startHeight + dy;
    state.height = Math.max(newHeight, MIN_HEIGHT);
  }
};

/**
 * 鼠标松开，停止调整大小
 */
const stopResize = () => {
  state.isResizing = false;
  state.resizeDirection = "";
  document.removeEventListener("mousemove", handleResize);
  document.removeEventListener("mouseup", stopResize);
  document.body.style.userSelect = "";
};

// 组件卸载时移除残留事件
onUnmounted(() => {
  document.removeEventListener("mousemove", handleResize);
  document.removeEventListener("mouseup", stopResize);
});
</script>

<style>
/* 全局样式调整：
  !重要! 覆盖 Element Plus 默认的 overflow: hidden; 
  允许 Tab 内容区域向外扩展，实现尺寸动态调整。
*/
.el-tabs__content {
  overflow: visible !important;
}
</style>

<style scoped>
.resizable-tabs-container {
  margin: 50px auto;
  /* 注意：el-tabs 容器本身也需要有足够空间来容纳调整后的尺寸 */
  max-width: 900px;
}

/* 尺寸控制容器 */
.tab-content-wrapper {
  position: relative;
  overflow: hidden;
  /* 使用负外边距抵消 el-tabs__content 默认的内边距，使 wrapper 紧贴 Tab 边界 */
  margin: -15px;
}

.content-area {
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
}

/* --- 拖拽手柄样式 --- */
.resize-handle {
  position: absolute;
  background: transparent;
  z-index: 10;
}

/* 右边框手柄 */
.resize-handle.right {
  top: 0;
  right: -5px;
  width: 10px;
  height: 100%;
  cursor: ew-resize; /* 左右调整光标 */
}

/* 下边框手柄 */
.resize-handle.bottom {
  left: 0;
  bottom: -5px;
  width: 100%;
  height: 10px;
  cursor: ns-resize; /* 上下调整光标 */
}

/* 右下角手柄 */
.resize-handle.corner {
  bottom: -10px;
  right: -10px;
  width: 20px;
  height: 20px;
  cursor: nwse-resize; /* 对角线调整光标 */
  border-right: 3px solid #409eff;
  border-bottom: 3px solid #409eff;
  border-radius: 0 0 5px 0;
}
</style>
