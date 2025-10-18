<script setup>
import { reactive, onUnmounted } from "vue";
import { ElTabs, ElTabPane } from "element-plus";

const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

// ... state 定义（与上一个版本一致） ...
const state = reactive({
  width: 600,
  height: 400,
  left: 100,
  top: 100,

  isResizing: false,
  startMouseX: 0,
  startMouseY: 0,
  startWidth: 0,
  startHeight: 0,
  startLeft: 0,
  startTop: 0,
  resizeDirection: "",
});

// ... startResize, stopResize, onUnmounted 函数（与上一个版本一致） ...

/**
 * 鼠标移动，执行调整大小和边界检查逻辑 (优化版本)
 */
const handleResize = (e) => {
  if (!state.isResizing) return;

  const dx = e.clientX - state.startMouseX;
  const dy = e.clientY - state.startMouseY;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let newWidth = state.startWidth;
  let newLeft = state.startLeft;
  let newHeight = state.startHeight;
  let newTop = state.startTop;

  const direction = state.resizeDirection;

  // ----------------------- 宽度/左侧调整逻辑 -----------------------
  if (direction.includes("left")) {
    // 1. 计算宽度和 left 的理想变化值
    newWidth = state.startWidth - dx;
    newLeft = state.startLeft + dx;

    // 2. 检查最小宽度限制
    if (newWidth < MIN_WIDTH) {
      newWidth = MIN_WIDTH;
      // 保证左侧位置正确：如果宽度被限制，left 也要相应后退
      newLeft = state.startLeft + (state.startWidth - MIN_WIDTH);
    }

    // 3. 检查左侧屏幕边界 (newLeft >= 0)
    if (newLeft < 0) {
      // 限制 left 为 0
      newLeft = 0;
      // 宽度 = (原始 left + 原始 width) - 新 left (0)
      newWidth = state.startLeft + state.startWidth;
      // 最终宽度仍需满足最小宽度限制
      newWidth = Math.max(newWidth, MIN_WIDTH);
    }

    // 4. (重要优化) 检查右侧屏幕边界 - 仅对左上角和左下角有意义
    const rightBoundary = newLeft + newWidth;
    if (rightBoundary > viewportWidth) {
      // 如果右边界超出屏幕，则以屏幕右边界为基准重新计算 newLeft 和 newWidth
      const delta = rightBoundary - viewportWidth; // 超出屏幕的距离
      newLeft -= delta; // 整体左移
      // 宽度不需要额外调整，因为 dx 已经考虑到鼠标移动了
    }
  } else if (direction.includes("right")) {
    // 基础计算：从右侧拖拽，只改变宽度
    newWidth = state.startWidth + dx;
    newWidth = Math.max(newWidth, MIN_WIDTH);

    // 边界检查：不能超出右侧屏幕 (newLeft + newWidth <= viewportWidth)
    const rightBoundary = state.startLeft + newWidth;
    if (rightBoundary > viewportWidth) {
      newWidth = viewportWidth - state.startLeft;
    }
  }

  // ----------------------- 高度/顶部调整逻辑 -----------------------
  if (direction.includes("top")) {
    // 1. 计算高度和 top 的理想变化值
    newHeight = state.startHeight - dy;
    newTop = state.startTop + dy;

    // 2. 检查最小高度限制
    if (newHeight < MIN_HEIGHT) {
      newHeight = MIN_HEIGHT;
      // 保证顶部位置正确：如果高度被限制，top 也要相应后退
      newTop = state.startTop + (state.startHeight - MIN_HEIGHT);
    }

    // 3. 检查顶部屏幕边界 (newTop >= 0)
    if (newTop < 0) {
      // 限制 top 为 0
      newTop = 0;
      // 高度 = (原始 top + 原始 height) - 新 top (0)
      newHeight = state.startTop + state.startHeight;
      newHeight = Math.max(newHeight, MIN_HEIGHT);
    }

    // 4. 检查底部屏幕边界 - 仅对左上角和右上角有意义
    const bottomBoundary = newTop + newHeight;
    if (bottomBoundary > viewportHeight) {
      // 如果底部边界超出屏幕，则以屏幕底边界为基准重新计算 newTop 和 newHeight
      const delta = bottomBoundary - viewportHeight; // 超出屏幕的距离
      newTop -= delta; // 整体上移
      // 高度不需要额外调整
    }
  } else if (direction.includes("bottom")) {
    // 基础计算：从底部拖拽，只改变高度
    newHeight = state.startHeight + dy;
    newHeight = Math.max(newHeight, MIN_HEIGHT);

    // 边界检查：不能超出底部屏幕 (newTop + newHeight <= viewportHeight)
    const bottomBoundary = state.startTop + newHeight;
    if (bottomBoundary > viewportHeight) {
      newHeight = viewportHeight - state.startTop;
    }
  }

  // 应用计算结果
  state.width = newWidth;
  state.height = newHeight;
  state.left = newLeft;
  state.top = newTop;
};
</script>
