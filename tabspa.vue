<template>
  <div class="dynamic-tabs-wrapper">
    <el-tabs v-model="activeTabName" type="card" class="demo-tabs">
      <el-tab-pane
        v-for="tab in tabDataList"
        :key="tab.name"
        :label="tab.label"
        :name="tab.name"
      >
        <template #label>
          <div class="custom-tab-header">
            <el-icon class="tab-icon">
              <component :is="tab.icon" />
            </el-icon>

            <span class="tab-name">{{ tab.label }}</span>

            <el-badge
              :value="tab.count"
              :max="99"
              :hidden="tab.count === 0"
              class="tab-count"
            />
          </div>
        </template>

        <KeepAlive>
          <component
            :is="tab.component"
            v-bind="tab.props"
            @data-updated="(data) => handleDataUpdate(tab.name, data)"
          />
        </KeepAlive>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, markRaw, KeepAlive } from "vue";
import { ElTabs, ElTabPane, ElIcon, ElBadge } from "element-plus";
import { User, Tickets, Setting } from "@element-plus/icons-vue";

// 导入子组件
import UserProfile from "./UserProfile.vue";
import OrderDetails from "./OrderDetails.vue";
import SystemSettings from "./SystemSettings.vue";

// 核心数据结构：包含 Header 信息 (icon, count) 和 Content 信息 (component, props)
const tabDataList = ref([
  {
    label: "用户资料",
    name: "user_profile",
    icon: markRaw(User), // 图标组件引用
    count: 0, // 动态数据：0
    component: markRaw(UserProfile),
    props: { userId: 1001, defaultRole: "Admin" },
  },
  {
    label: "待处理订单",
    name: "recent_orders",
    icon: markRaw(Tickets),
    count: 15, // 动态数据：15 (会显示徽章)
    component: markRaw(OrderDetails),
    props: { itemsLimit: 10, filterStatus: "Pending" },
  },
  {
    label: "系统配置",
    name: "sys_settings",
    icon: markRaw(Setting),
    count: 3, // 动态数据：3
    component: markRaw(SystemSettings),
    props: { themeMode: "Dark", language: "zh-CN" },
  },
]);

// 绑定当前激活的 Tab
const activeTabName = ref(tabDataList.value[0].name);

// 处理子组件触发的事件，用于更新 Tab Header 上的数量
const handleDataUpdate = (tabName, newData) => {
  console.log(`Tab [${tabName}] 的组件触发了数据更新:`, newData);

  const tabItem = tabDataList.value.find((tab) => tab.name === tabName);
  if (tabItem) {
    // 示例：如果子组件传递了 newCount，就更新 Tab Header 上的徽章
    if (newData.newCount !== undefined) {
      tabItem.count = newData.newCount;
    }
  }
};
</script>

<style scoped>
.dynamic-tabs-wrapper {
  padding: 20px;
}
.custom-tab-header {
  display: flex;
  align-items: center;
}
.tab-icon {
  margin-right: 5px;
  font-size: 16px;
}
.tab-name {
  margin-right: 15px;
}
/* 深度修改 Element Plus Badge 的样式，使其在 Tab 内居中和缩小 */
.tab-count :deep(.el-badge__content) {
  top: 0;
  right: -5px;
  transform: scale(0.8) translate(0, 0);
  transform-origin: right center;
  font-size: 12px;
  height: 18px;
  line-height: 18px;
  padding: 0 6px;
}
</style>
