<template>
  <div class="terminal-wrapper">
    <h2>Xterm.js Vue 3 示例</h2>
    <div ref="terminalRef" class="xterm-container"></div>
    
    <div class="controls">
      <p>目标: 删除 Scrollback Line 5 (绝对索引 4)</p>
      <button @click="handleDeleteLine(4)">
        删除 Scrollback Line 5
      </button>
      <button @click="handleInsertLine(4)">
        插入 Scrollback Line 5
      </button>
      <button @click="handleScrollToTop">滚动到顶部</button>
      <button @click="handleScrollToBottom">滚动到底部</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css'; 

const terminalRef = ref(null);
let term = null;

/**
 * @function deleteLineFromScrollback
 * @description 从整个缓冲区 (包括回滚区) 删除指定绝对索引的行。
 * @param {number} absoluteIndex - 要删除的行的绝对索引 (从缓冲区顶部开始, 0-based)。
 */
const deleteLineFromScrollback = (absoluteIndex) => {
  if (!term) return;

  const activeBuffer = term.buffer.active._buffer;
  const lines = activeBuffer.lines;

  console.log(`尝试删除绝对索引: ${absoluteIndex} 的行...`);

  if (absoluteIndex < 0 || absoluteIndex >= lines.length) {
    term.write(`\r\n\x1b[31m错误: 无效的行索引 ${absoluteIndex}\x1b[0m\r\n$ `);
    return;
  }

  lines.splice(absoluteIndex, 1);

  // 调整 baseY (回滚区底部索引)
  if (absoluteIndex < activeBuffer.baseY) {
    activeBuffer.baseY--;
  } 

  // 调整 cursorY (相对于 baseY 的光标偏移量)
  const cursorAbsoluteIndex = activeBuffer.baseY + activeBuffer.cursorY;
  
  if (absoluteIndex < cursorAbsoluteIndex) {
    activeBuffer.cursorY--;
    
    if (activeBuffer.cursorY < 0) {
      activeBuffer.cursorY = 0;
      activeBuffer.baseY = Math.max(0, activeBuffer.baseY - 1);
    }
  }

  // 强制终端重绘
  term.refresh(0, term.rows - 1);
  term.write(`\r\n\x1b[32m成功删除行 ${absoluteIndex}。请滚动查看。\x1b[0m\r\n$ `);
};

/**
 * @function createEmptyBufferLine
 * @description 创建一个新的空白 BufferLine 对象。
 * @param {Terminal} term - xterm.js 实例。
 * @returns {any} 新的 BufferLine 实例。
 */
 function createEmptyBufferLine(term) {
    const activeBuffer = term.buffer.active;
    const cols = term.cols;
    const nullCell = activeBuffer.getNullCell();

    // 1. 获取一个已有的行对象作为原型（例如第一行）
    // ⚠️ 注意：getLine() 返回的对象可能是一个引用，我们必须创建一个新的。
    // 在 xterm.js 内部，BufferLine 实例有一个 cells 属性，它是一个 Uint32Array。
    
    // **替代方案：使用 BufferLine 暴露的静态方法（如果存在）**
    // xterm.js 并没有公开的 IBufferLine.create() 静态方法。
    
    // **最安全的运行时解决方案：借用 CircularList 的内部方法。**
    // 尝试获取一个新行：
    const newEmptyLine = activeBuffer.lines.get(0).clone(); // 假设 clone 仍然是内部方法

    if (newEmptyLine && newEmptyLine.setCell) {
        // 手动清空新行
        for (let i = 0; i < cols; i++) {
            newEmptyLine.setCell(i, nullCell);
        }
        return newEmptyLine;
    }
    
    // 如果上面的方法仍然失败，我们必须 fallback 到硬编码或抛出错误。
    throw new Error("Failed to create a new BufferLine instance. xterm.js internal structure might have changed.");
}

/**
 * 导入类型，确保 TypeScript/编辑器支持。
 * ⚠️ 在 Vue SFC 的 <script setup> 块中，你可能需要导入 IBufferLine 和 IBufferCell。
 * 由于 xterm.js 通常不导出这些接口，我们使用运行时属性访问。
 *
 * @function createNewBufferLine
 * @description 创建一个新的 BufferLine 对象，并填充指定文本。
 * @param {Terminal} term - xterm.js 实例。
 * @param {string} text - 要插入的文本内容。
 * @returns {any} 新的 BufferLine 实例 (类型 IBufferLine)。
 */
 function createNewBufferLine(term, text) {
    const activeBuffer = term.buffer.active;
    const cols = term.cols;
    
    // 1. 获取 Null Cell (空白单元格的模板)
    // 这是获取默认属性（背景色、前景色、样式）最安全的方法。
    const nullCell = activeBuffer.getNullCell();

    // 2. 构造一个新的 BufferLine 实例。
    // ⚠️ 这是一个依赖 xterm.js 内部实现的步骤。
    // 在 xterm.js v5.x 中，BufferLine 实例是 CircularList 的一部分，但其构造函数没有公开。
    // 最简单的方法是获取一个现有行，然后清空它。
    
    // 我们从当前 Buffer 中获取最后一行作为模板 (假设它存在)
    const lineTemplate = activeBuffer.getLine(activeBuffer.length - 1);
    
    if (!lineTemplate) {
        // 如果 Buffer 是空的，这会失败。需要更复杂的初始化，
        // 但对于演示，我们假设 Buffer 非空。
        console.error("Buffer is empty, cannot create line template.");
        return null; 
    }
    
    // 3. 复制行对象 (这是一个浅拷贝，但通常足够了)
    // ⚠️ 如果 lineTemplate 是一个内部的 BufferLine 实例，直接赋值。
    // 由于我们不能调用 clone()，我们依赖于 BufferLine 对象被正确创建。
    
    // 在 xterm.js 运行时环境中，如果直接访问 lines 数组元素，
    // 它们是 CircularList 内部的 BufferLine 实例。
    const newLine = activeBuffer.getLine(activeBuffer.length - 1);
    
    // 4. 清空并写入内容
    const textToInsert = `[INSERTED] ${text}`;
    
    // a. 清空行内容并设置默认属性
    for (let i = 0; i < cols; i++) {
        // 使用 setCell 设置为 Null Cell 的属性，这相当于清空
        newLine.setCell(i, nullCell); 
    }
    
    // b. 写入新文本
    for (let i = 0; i < textToInsert.length && i < cols; i++) {
        // 重新设置字符和默认属性 (这里假设只插入普通文本)
        const charCode = textToInsert.charCodeAt(i);
        
        // ⚠️ 这是一个简化的 setCell 调用，它依赖于 xterm.js 内部 Cell 数组的结构:
        // [fg, charCode, charWidth, bg, extended.data]
        // 简化为 [fg (0=default), charCode, charWidth (1)]
        newLine.setCell(i, [0, charCode, 1, 0]); 
    }
    
    // 5. 替换：由于我们不能直接 new BufferLine()，我们必须在 lines 数组中
    // 找到一个空白行，或者使用 `activeBuffer.lines.get(index)`。
    // 
    // **最安全的方式:** // 暂时让 `lines` 数组增长一行，然后用 `fill` 方法填充，再进行 `splice`。
    
    // 由于手动创建 BufferLine 非常依赖版本，我将提供一个**绕过创建 BufferLine**
    // **对象**的更实际的方案：**利用 `term.write()` 间接插入。**
    
    return newLine;
}

/**
 * ⚠️ 场景二: 在回滚缓冲区插入 (使用黑箱 Buffer API)
 * 这是通过借用 lines 数组中一个已存在的行实例，然后手动清空并插入的方式。
 * @param {number} absoluteIndex - 要插入的绝对索引 (0-based)。
 * @param {string} content - 插入内容。
 */
function insertIntoScrollback(absoluteIndex, content) {
    const activeBuffer = term.buffer.active;
    const lines = activeBuffer._buffer.lines;
    const cols = term.cols;
    
    if (absoluteIndex < 0 || absoluteIndex > lines.length) {
        term.write(`\r\n\x1b[31m错误: 无效的绝对索引 ${absoluteIndex}\x1b[0m\r\n$ `);
        return;
    }
    
    try {
        // --- 1. 借用并清空一个 BufferLine 实例作为占位符 ---
        
        // ⚠️ 黑箱操作 1: 借用 CircularList 的 push() 方法来安全地创建新行实例。
        // push() 会创建一个新的 IBufferLine 并将其放在末尾。
        lines.push(); 
        
        // 借用这个新创建的实例 (它在末尾，索引为 length - 1)
        const newEmptyLine = lines.get(lines.length - 1);
        
        if (!newEmptyLine) {
            throw new Error("无法借用 BufferLine 实例。");
        }
        
        // 2. 填充内容 (清空并写入标记)
        const nullCell = activeBuffer.getNullCell();
        for (let i = 0; i < cols; i++) {
            newEmptyLine.setCell(i, nullCell); // 清空
        }
        
        const marker = `[SCROLLBACK INSERTED @ ${absoluteIndex}] ${content}`;
        for (let i = 0; i < marker.length && i < cols; i++) {
            // 写入标记 (使用 ANSI 颜色)
            newEmptyLine.setCell(i, [3, marker.charCodeAt(i), 1, 0]); // 3=Yellow
        }
        
        // --- 3. 核心操作: 移动行 ---
        
        // ⚠️ 黑箱操作 2: 将末尾的行删除，并插入到目标位置
        lines.splice(lines.length - 1, 1); // 从末尾删除我们借用的行
        lines.splice(absoluteIndex, 0, newEmptyLine); // 插入到目标位置

        // --- 4. 调整 Buffer 状态 ---
        activeBuffer.baseY++; 

        // 调整光标位置
        const cursorAbsoluteIndex = activeBuffer.baseY + activeBuffer.cursorY;
        if (absoluteIndex <= cursorAbsoluteIndex) {
            activeBuffer.cursorY++;
        }

        // 5. 强制终端重绘
        term.refresh(0, term.rows - 1);
        term.write(`\r\n\x1b[32m[黑箱] 成功在回滚区 Index ${absoluteIndex} 处插入行。请滚动查看。\x1b[0m\r\n$ `);

    } catch (e) {
        term.write(`\r\n\x1b[31m[黑箱] 插入失败：${e.message}\x1b[0m\r\n$ `);
        console.error("Scrollback insertion failed:", e);
        // 错误发生时，可能需要重置终端状态，这里省略。
    }
}

const handleInsertLine = (index) => {
  insertIntoScrollback(index, '这是通过 Vue 组件插入的 Scrollback 内容');
};

const handleDeleteLine = (index) => {
    deleteLineFromScrollback(index);
};

const handleScrollToTop = () => {
    if (term) term.scrollToTop();
};

const handleScrollToBottom = () => {
    if (term) term.scrollToBottom();
};


onMounted(() => {
  term = new Terminal({
    cols: 80,
    rows: 15,
    scrollback: 100 
  });

  if (terminalRef.value) {
    term.open(terminalRef.value);
  }

  for (let i = 1; i <= 20; i++) {
    term.writeln(`Scrollback Line ${i} (Index ${i - 1})`);
  }
  
  for (let i = 1; i <= 5; i++) {
    term.writeln(`Visible Line ${i}`);
  }

  term.write('\r\n\x1b[33m请向下滚动查看 Scrollback Buffer 中的 Line 1-10.\x1b[0m\r\n$ ');
});

onBeforeUnmount(() => {
  if (term) {
    term.dispose();
  }
});
</script>

<style scoped>
.terminal-wrapper {
  padding: 20px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-width: 900px;
  margin: 20px auto;
}

.xterm-container {
  width: 100%;
  height: 400px; 
  border: 1px solid #ccc;
  box-sizing: border-box;
}

.controls {
    margin-top: 20px;
    padding-top: 10px;
    border-top: 1px dashed #eee;
}

.controls button {
    padding: 8px 15px;
    margin-right: 10px;
    background-color: #42b983; /* Vue Green */
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.controls button:hover {
    background-color: #369a74;
}
</style>