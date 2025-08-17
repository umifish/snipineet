import { createRouter, createWebHistory } from "vue-router";
import { emitter } from "@/utils/eventBus.js"; // 导入事件总线

const routes = [
  // 这里是你的路由配置，例如：
  {
    path: "/",
    component: { template: "<div>Home Page</div>" },
    meta: { title: "首页" },
  },
  {
    path: "/about",
    component: { template: "<div>About Page</div>" },
    meta: { title: "关于我们" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 在每次路由成功导航后，通过事件总线触发一个自定义事件
router.afterEach((to, from) => {
  emitter.emit("route-succeeded", { to, from });
});

export default router;
