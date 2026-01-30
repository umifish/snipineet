<template>
  <div class="tree-container">
    <div class="stats">节点总数: {{ totalNodes }} | 待处理缓存: {{ bufferSize }}</div>
    
    <el-tree-v2
      ref="treeRef"
      :data="treeData"
      :props="treeProps"
      :height="600"
      :item-size="32"
    />
  </div>
</template>

<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue';

// --- 配置与状态 ---
const treeProps = {
  label: 'label',
  children: 'children',
  value: 'id',
};

// 1. 使用 shallowRef 减少深度响应式带来的内存和 CPU 消耗
const treeData = shallowRef([]); 
const totalNodes = ref(0);
const bufferSize = ref(0);

// 2. 内存索引表：用于 O(1) 时间复杂度查找父节点
// 注意：这是普通 Map，不需要响应式
const nodeMap = new Map();

// 3. 待处理数据缓冲区
let nodeBuffer = [];
let animationFrameId = null;

// --- 逻辑处理 ---

// 处理新收到的节点
const handleNewNode = (node) => {
  nodeBuffer.push(node);
  bufferSize.value = nodeBuffer.length;
};

// 核心：批量处理缓冲区数据
const flushBuffer = () => {
  if (nodeBuffer.length > 0) {
    // 拷贝一份当前缓冲区，并清空原缓冲区
    const processingQueue = [...nodeBuffer];
    nodeBuffer = [];
    bufferSize.value = 0;

    // 批量挂载节点
    processingQueue.forEach(node => {
      // 确保节点有 children 容器
      if (!node.children) node.children = [];
      nodeMap.set(node.id, node);

      if (node.parentId && nodeMap.has(node.parentId)) {
        // 找到父节点并推入
        const parent = nodeMap.get(node.parentId);
        parent.children.push(node);
      } else {
        // 根节点
        treeData.value.push(node);
      }
    });

    // 4. 重要：由于使用了 shallowRef，必须触发引用更新来通知 Vue 重新渲染
    // 使用解构触发一次全量 Diff，但在 el-tree-v2 中这种开销极小
    treeData.value = [...treeData.value];
    totalNodes.value = nodeMap.size;
  }

  // 继续下一帧循环
  animationFrameId = requestAnimationFrame(flushBuffer);
};

// --- 生命周期 ---

onMounted(() => {
  // 模拟 postMessage 监听
  window.addEventListener('message', (e) => {
    // 假设数据格式: { id: 123, label: 'Node-123', parentId: 456 }
    if (e.data && e.data.id) {
      handleNewNode(e.data);
    }
  });

  // 启动渲染循环
  animationFrameId = requestAnimationFrame(flushBuffer);

  // 【模拟测试】每 10ms 推送 10 个节点
  simulateHighFrequencyStream();
});

onBeforeUnmount(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});

// --- 模拟数据流函数 ---
function simulateHighFrequencyStream() {
  let count = 0;
  const interval = setInterval(() => {
    if (count > 5000) return clearInterval(interval);
    for(let i=0; i<10; i++) {
      count++;
      const parentId = count > 10 ? Math.floor(Math.random() * (count - 5)) : null;
      window.postMessage({ id: count, label: `Debug-Node-${count}`, parentId }, '*');
    }
  }, 10);
}
</script>

<style scoped>
.tree-container { height: 600px; border: 1px solid #ddd; padding: 10px; }
.stats { margin-bottom: 10px; font-family: monospace; color: #666; }
</style>
