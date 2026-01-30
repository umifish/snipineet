import { defineStore } from 'pinia';
import { ref, shallowRef, triggerRef, markRaw, nextTick } from 'vue';

export const useTreeStore = defineStore('debugTree', () => {
  // --- 状态存储 ---
  // 核心：使用原始 JS 对象存储海量数据，Map 用于快速查找
  const rawDataStore = {};      // 格式：{ [key]: TreeNodes[] }
  const nodeMap = new Map();    // 格式：Map<ID, { data: Node, parentId: ID }>
  
  const activeKey = ref('default');
  const treeData = shallowRef([]); // 组件绑定的唯一入口
  
  // 渲染锁：节流更新
  let isQueued = false;

  /**
   * 内部方法：递归建立索引（包含 parentId 挂载）
   */
  const indexNodes = (nodes, parentId = null) => {
    for (const node of nodes) {
      // 存储节点引用及父节点 ID，用于定位溯源
      nodeMap.set(node.id, { data: node, parentId });
      if (node.children && node.children.length > 0) {
        indexNodes(node.children, node.id);
      }
    }
  };

  /**
   * 1. 接收推流数据
   */
  const handlePush = (key, nodes) => {
    // 使用 markRaw 防止节点被 Vue 自动转化为 Proxy
    const rawNodes = markRaw(Array.isArray(nodes) ? nodes : [nodes]);

    // 写入原始数据
    if (!rawDataStore[key]) rawDataStore[key] = [];
    rawDataStore[key].push(...rawNodes);

    // 建立/更新索引
    indexNodes(rawNodes);

    // 节流触发渲染
    if (key === activeKey.value) {
      treeData.value = rawDataStore[key];
      scheduleUpdate();
    }
  };

  /**
   * 2. 调度节流更新 (rAF)
   */
  const scheduleUpdate = () => {
    if (isQueued) return;
    isQueued = true;
    requestAnimationFrame(() => {
      triggerRef(treeData); // 手动触发 shallowRef 更新
      isQueued = false;
    });
  };

  /**
   * 3. 查找定位：获取指定节点的所有父级 ID 路径
   */
  const findParentPath = (nodeId) => {
    const path = [];
    let current = nodeMap.get(nodeId);
    while (current && current.parentId) {
      path.push(current.parentId);
      current = nodeMap.get(current.parentId);
    }
    return path;
  };

  /**
   * 4. 切换 Key
   */
  const switchKey = (key) => {
    activeKey.value = key;
    treeData.value = rawDataStore[key] || [];
    scheduleUpdate();
  };

  return {
    treeData,
    activeKey,
    handlePush,
    switchKey,
    findParentPath
  };
});
