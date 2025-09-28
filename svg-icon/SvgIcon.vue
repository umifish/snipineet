<template>
  <svg aria-hidden="true" class="svg-icon" :style="style">
    <use :xlink:href="symbolId" :fill="color" />
  </svg>
</template>

<script setup>
import { computed } from "vue";

// 定义组件的属性 (Props)
const props = defineProps({
  // 必须：图标名称 (对应文件名，如 'home')
  name: {
    type: String,
    required: true,
  },
  // 可选：图标大小，可以是数字(px)或字符串('2em')
  size: {
    type: [Number, String],
    default: 16, // 默认 16px
  },
  // 可选：图标颜色
  color: {
    type: String,
    // 默认使用 'currentColor'，继承父元素的文本颜色，方便适配主题
    default: "currentColor",
  },
});

// 1. 计算完整的 Symbol ID
//    例如：name='home' 变成 '#icon-home'
const symbolId = computed(() => `#icon-${props.name}`);

// 2. 计算 SVG 元素的 CSS 样式对象 (控制大小)
const style = computed(() => {
  let sizeValue = props.size;
  // 如果 size 是数字，自动加上 'px' 单位
  if (typeof sizeValue === "number") {
    sizeValue = `${sizeValue}px`;
  }

  return {
    width: sizeValue,
    height: sizeValue,
  };
});
</script>

<style scoped>
.svg-icon {
  /* 基础样式 */
  vertical-align: middle;
  transition: fill 0.3s;
  /* 注意：这里无需设置 fill，颜色是通过 <use :fill="color"> 传递给 SVG Symbol 的 */
}
</style>
