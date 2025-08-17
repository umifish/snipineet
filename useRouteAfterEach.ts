import { onMounted, onUnmounted } from "vue";
import { emitter } from "@/utils/eventBus.js";

/**
 * 一个自定义钩子函数，用于在路由成功后执行指定的回调。
 * @param {Function} callback - 路由成功后要执行的自定义处理逻辑。
 */
export function useRouteAfterEach(callback) {
  const handler = (payload) => {
    if (typeof callback === "function") {
      callback(payload);
    }
  };

  onMounted(() => {
    // 监听我们自定义的事件
    emitter.on("route-succeeded", handler);
  });

  onUnmounted(() => {
    // 组件卸载时取消监听，防止内存泄漏
    emitter.off("route-succeeded", handler);
  });
}
