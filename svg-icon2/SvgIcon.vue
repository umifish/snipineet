<template>
  <div
    class="svg-icon-wrapper"
    :style="{
      width: `${props.size}px`,
      height: `${props.size}px`,
      color: props.color,
    }"
  >
    <component
      :is="iconComponent"
      :key="props.name"
      ref="svgRef"
      class="svg-icon"
      aria-hidden="true"
      :width="props.size"
      :height="props.size"
      :viewBox="finalViewBox"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, nextTick } from "vue";

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: "currentColor" },
  // 保持手动覆盖 viewBox 的能力
  viewBox: { type: String, default: undefined },
});

// 用于存储计算或用户传入的最终 viewBox
const dynamicViewBox = ref("");
const svgRef = ref(null);

// 动态导入 SVG 组件
const iconComponent = computed(() => {
  // 重置 dynamicViewBox，等待下一次测量
  dynamicViewBox.value = "";
  try {
    return defineAsyncComponent(() =>
      import(`/src/assets/icons/${props.name}.svg`).then((mod) => {
        // 确保在导入成功后，DOM 即将更新，然后进行测量
        nextTick(measureSvg);
        return mod;
      })
    );
  } catch (error) {
    console.error(`未找到 SVG 文件: /src/assets/icons/${props.name}.svg`);
    return null;
  }
});

// 计算最终应用到 <svg> 上的 viewBox
const finalViewBox = computed(() => {
  // 优先级 1: 使用用户传入的 viewBox
  if (props.viewBox) {
    return props.viewBox;
  }
  // 优先级 2: 使用测量后计算出的 viewBox
  if (dynamicViewBox.value) {
    return dynamicViewBox.value;
  }
  // 优先级 3: 默认值（仅作为后备，可能导致裁剪）
  return "0 0 24 24";
});

/**
 * 测量 SVG 元素并计算 viewBox。
 * 只有当 SVG 缺少 viewBox 时才执行此逻辑。
 */
function measureSvg() {
  // 确保 DOM 元素存在且当前没有应用 viewBox (无论是 props 还是已计算的)
  if (svgRef.value && !props.viewBox) {
    // 动态组件的 ref 实际上指向的是它的根 DOM 元素，即 <svg>
    const svgElement = svgRef.value.$el || svgRef.value;

    // 检查 SVG 是否已经有 viewBox（由 Loader 或原始文件提供）
    if (svgElement.getAttribute("viewBox")) {
      // 如果已经有 viewBox，则无需计算，直接使用
      dynamicViewBox.value = svgElement.getAttribute("viewBox");
      return;
    }

    // 如果没有 viewBox，我们尝试读取其尺寸来构造一个：
    const width = svgElement.getAttribute("width");
    const height = svgElement.getAttribute("height");

    if (width && height) {
      // 关键逻辑：用原始的 width 和 height 来填充 viewBox
      // 假设原始坐标系从 (0, 0) 开始
      dynamicViewBox.value = `0 0 ${width} ${height}`;
      console.warn(
        `[SvgIcon] 图标 ${props.name} 缺少 viewBox。已从 width/height 属性动态构造为: ${dynamicViewBox.value}`
      );
    } else {
      // 如果连 width/height 都没有，可能需要设置一个默认值或进行更复杂的测量
      // 例如，使用 getBBox() 或 getBoundingClientRect()，但这通常更复杂且易出错。
      console.warn(
        `[SvgIcon] 图标 ${props.name} 缺少 viewBox 和 width/height 属性，可能无法正确缩放。`
      );
    }
  }
}
</script>

<style scoped>
/* 保持样式不变 */
.svg-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.svg-icon {
  display: block;
  fill: currentColor;
  width: 100%;
  height: 100%;
}
</style>
