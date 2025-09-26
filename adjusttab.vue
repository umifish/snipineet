<template>
  <div
    class="resizable-tabs-container"
    :style="{ width: state.width + 'px', height: state.height + 'px' }"
  >
    <el-tabs type="border-card" class="full-size-tabs">
      <el-tab-pane label="Tab 1">
        <div class="tab-content">
          <h3>Tab 1 内容</h3>
          <p>整个 tabs 容器的尺寸正在被调整。</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Tab 2">
        <div class="tab-content">
          <h3>Tab 2 内容</h3>
          <p>当前容器尺寸: {{ state.width }}px x {{ state.height }}px</p>
        </div>
      </el-tab-pane>
    </el-tabs>

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
  e.stopPropagation();

  state.isResizing = true;
  state.resizeDirection = direction;
  state.startMouseX = e.clientX;
  state.startMouseY = e.clientY;
  state.startWidth = state.width;
  state.startHeight = state.height;

  // 在 document 上添加全局事件监听
  document.addEventListener("mousemove", handleResize);
  document.addEventListener("mouseup", stopResize);
  document.body.style.userSelect = "none"; // 防止选中文字
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

onUnmounted(() => {
  document.removeEventListener("mousemove", handleResize);
  document.removeEventListener("mouseup", stopResize);
});
</script>

<style scoped>
/* 核心容器：提供定位上下文和尺寸控制 */
.resizable-tabs-container {
  position: relative;
  margin: 50px auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden; /* 确保拖拽手柄不会意外溢出 */
}

/* 让 el-tabs 占据整个父容器的尺寸 */
.full-size-tabs {
  width: 100%;
  height: 100%;
}

/* !!! 关键样式 !!!
  使用 :deep() 穿透作用域，确保 el-tabs 的内容区域能动态适配高度。
  40px 是 tabs 头部的高度估算值 (根据 Element Plus 默认样式调整)。
*/
.full-size-tabs :deep(.el-tabs__content) {
  height: calc(100% - 40px);
  overflow: auto; /* 允许内容区域滚动 */
  padding: 0; /* 移除默认 padding，由内部 .tab-content 控制 */
}

.tab-content {
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
  cursor: ew-resize;
}

/* 下边框手柄 */
.resize-handle.bottom {
  left: 0;
  bottom: -5px;
  width: 100%;
  height: 10px;
  cursor: ns-resize;
}

/* 右下角手柄 */
.resize-handle.corner {
  bottom: -10px;
  right: -10px;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
  border-right: 3px solid #409eff; /* Element Plus 主题色 */
  border-bottom: 3px solid #409eff;
}
</style>

--- ## 关键技术点和注意事项 | 元素/代码 | 关键说明 | | :--- | :--- | |
**`.resizable-tabs-container`** | 拖拽的实际目标，设置 `position: relative`
和动态尺寸。 | | **`.full-size-tabs`** | 设置 `width: 100%; height: 100%;` 确保
`el-tabs` 占满外部容器。 | | **`:deep(.el-tabs__content)`** | **最重要**。使用
`height: calc(100% - 40px)` 动态计算 Tab 内容区域的高度，减去 Tab
头部占据的高度，使内容区与容器高度同步变化。 | | **全局事件监听** |
`document.addEventListener('mousemove', ...)`
确保拖拽操作流畅，即使鼠标暂时移出组件边界。 | | **拖拽手柄定位** | 拖拽手柄使用
`position: absolute` 并配合负值（如 `right: -5px`）来创建更易于点击的**热区**。
|
