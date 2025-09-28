<template>
  <div>
    <h1>SVG 图标示例</h1>

    <p>默认图标：<SvgIcon name="home" /></p>

    <p>蓝色 32px 图标：<SvgIcon name="user" :size="32" color="#409EFF" /></p>

    <p style="color: purple">
      2em 紫色图标：<SvgIcon name="settings" size="2em" color="currentColor" />
    </p>

    <p>
      <SvgIcon name="logo" class="hover-icon" :size="48" color="orange" />
    </p>
  </div>
</template>

<style scoped>
.hover-icon {
  cursor: pointer;
  /* 确保过渡生效，因为 fill 是通过 prop 设置的 */
  transition: all 0.2s;
}

.hover-icon:hover {
  /* 悬停时改变大小 */
  transform: scale(1.1);
  /* 悬停时改变颜色 (通过 class 覆盖 prop) */
  fill: darkorange;
}
</style>
