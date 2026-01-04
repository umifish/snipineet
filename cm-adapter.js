/**
 * 兼容 CodeMirror 5 和 6 的静态数据提取器
 */
export function captureCMState(instance) {
  if (!instance) {
    console.warn("Capture failed: instance is null or undefined.");
    return null;
  }

  let rootEl = null;

  // 1. 判断是否为 CodeMirror 6 (含有 dom 属性)
  if (instance.dom && instance.dom.classList.contains('cm-editor')) {
    rootEl = instance.dom;
  } 
  // 2. 判断是否为 CodeMirror 5 (含有 getWrapperElement 方法)
  else if (typeof instance.getWrapperElement === 'function') {
    rootEl = instance.getWrapperElement();
  }

  if (!rootEl) {
    console.error("未能识别的 CodeMirror 实例类型");
    return null;
  }

  // 返回克隆后的 HTML 和完整的类名列表
  // 使用 innerHTML 配合外层 class 继承是兼容样式的最佳实践
  return {
    html: rootEl.innerHTML,
    classes: rootEl.className,
    // 捕获当前的滚动位置（可选，用于还原视觉状态）
    scrollTop: rootEl.scrollTop
  };
}
