<template>
  <component
    :is="iconComponent"
    :style="style"
    :fill="color"
    class="svg-icon-component"
  />
</template>

<script setup>
import { computed, defineAsyncComponent, shallowRef, watch } from "vue";

const props = defineProps({
  // 图标名称 (例如 'home' 对应 home.svg)
  name: {
    type: String,
    required: true,
  },
  // 大小
  size: {
    type: [Number, String],
    default: 16,
  },
  // 颜色
  color: {
    type: String,
    default: "currentColor",
  },
});

// 使用 shallowRef 来存储动态加载的组件引用
const iconComponent = shallowRef(null);

// 1. 动态加载 SVG 组件
const loadIcon = () => {
  // Vite 动态导入语法 (import())
  const path = `../assets/icons/${props.name}.svg`;

  iconComponent.value = defineAsyncComponent(() =>
    // 注意：路径必须是静态可解析的，但文件名是动态的。
    // 如果您发现 import 报错，可能需要调整路径或使用 meta.glob 导入所有文件。
    import(/* @vite-ignore */ path).catch((error) => {
      console.error(`无法加载 SVG 图标: ${props.name}`, error);
      return null;
    })
  );
};

// 监听 name 属性变化并立即加载
watch(() => props.name, loadIcon, { immediate: true });

// 2. 计算 CSS 样式对象 (控制大小)
const style = computed(() => {
  let sizeValue = props.size;
  if (typeof sizeValue === "number") {
    sizeValue = `${sizeValue}px`;
  }

  return {
    width: sizeValue,
    height: sizeValue,
    // 确保组件内的 SVG 元素继承这些尺寸
  };
});
</script>

<style scoped>
/* 样式将作用于 SvgIcon.vue 根元素的 <svg> 标签 */
.svg-icon-component {
  vertical-align: middle;
  transition: all 0.3s;
  /* 确保 SVG 内部路径使用 fill="currentColor" 或不设置 fill，以便此处的 fill 生效 */
}
</style>
