// directives/v-resizable.js
export default {
    mounted(el, binding) {
      // 获取元素和绑定的值
      const resizer = el;
      const { minWidth = 100, maxWidth = 800, onResize } = binding.value;
  
      let isDragging = false;
      let startX = 0;
      let startWidth = 0;
  
      // 开始拖拽时触发
      const onMouseDown = (event) => {
        isDragging = true;
        startX = event.clientX;
        startWidth = resizer.previousElementSibling.offsetWidth;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
  
      // 拖拽过程中更新分栏宽度
      const onMouseMove = (event) => {
        if (isDragging) {
          const diff = event.clientX - startX;
          let newWidth = startWidth + diff;
  
          // 最小宽度和最大宽度限制
          newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
  
          // 更新左侧分栏的宽度
          resizer.previousElementSibling.style.width = `${newWidth}px`;
  
          // 调用用户提供的 onResize 回调（可选）
          if (onResize) {
            onResize(newWidth);
          }
        }
      };
  
      // 拖拽结束时清理
      const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
  
      resizer.addEventListener('mousedown', onMouseDown);
  
      // 销毁时移除事件监听
      el._cleanup = () => {
        resizer.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
    },
    unmounted(el) {
      // 清理事件监听
      if (el._cleanup) {
        el._cleanup();
      }
    }
  };
  