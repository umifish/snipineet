/**
 * Fast Scrollback Operations for xterm.js 5.5.0
 * 基于 xterm.js 内部 API 实现高性能的滚动缓冲区操作
 * 
 * 功能：
 * 1. 删除指定行，下方内容自动上移
 * 2. 插入新行到指定位置，当前行及后续内容下移
 */

import type { Terminal } from '@xterm/xterm';

/**
 * 获取 xterm.js 的 _core 对象
 */
function getCore(term: Terminal): any {
  return (term as any)._core;
}

/**
 * 获取 buffer 对象（使用 normal buffer，而不是 active）
 * 支持多种访问方式以兼容不同版本的 xterm.js
 */
function getBuffer(term: Terminal): any {
  const core = getCore(term);
  if (!core) {
    console.warn('[getBuffer] _core not found');
    return null;
  }
  
  // 方法1: 直接访问 core.buffer.normal（demo.ts 的方式）
  if (core.buffer?.normal) {
    return core.buffer.normal;
  }
  
  // 方法2: 通过 _bufferService 访问（从调试信息看，buffer 有 _bufferService）
  if (core._bufferService) {
    // 尝试访问 _bufferService.buffer.normal
    if (core._bufferService.buffer?.normal) {
      return core._bufferService.buffer.normal;
    }
    // 或者 _bufferService 本身就是 buffer
    if (core._bufferService.lines && typeof core._bufferService.getLine === 'function') {
      return core._bufferService;
    }
  }
  
  // 方法3: 通过 bufferService 访问
  if (core.bufferService) {
    if (core.bufferService.buffer?.normal) {
      return core.bufferService.buffer.normal;
    }
    if (core.bufferService.lines && typeof core.bufferService.getLine === 'function') {
      return core.bufferService;
    }
  }
  
  // 方法4: 尝试访问 active buffer
  if (core.buffer?.active) {
    return core.buffer.active;
  }
  
  // 方法5: 通过公开的 API 访问
  const publicBuffer = (term as any).buffer?.active ?? (term as any).buffer;
  if (publicBuffer && typeof publicBuffer.getLine === 'function') {
    // 如果公开 API 返回的 buffer 有 lines 属性，可以使用它
    if ('lines' in publicBuffer) {
      return publicBuffer;
    }
  }
  
  // 如果都找不到，输出详细的调试信息
  console.warn('[getBuffer] Buffer not found');
  console.log('=== Debug Info ===');
  console.log('Core structure:', {
    hasBuffer: 'buffer' in core,
    hasBufferService: '_bufferService' in core || 'bufferService' in core,
    coreKeys: Object.keys(core).filter(k => 
      k.toLowerCase().includes('buffer') || 
      k.toLowerCase().includes('service')
    )
  });
  
  if (core.buffer) {
    console.log('core.buffer structure:', {
      bufferKeys: Object.keys(core.buffer),
      hasNormal: 'normal' in core.buffer,
      hasActive: 'active' in core.buffer,
      normalType: typeof core.buffer.normal,
      activeType: typeof core.buffer.active
    });
  }
  
  if (core._bufferService) {
    console.log('_bufferService structure:', {
      serviceKeys: Object.keys(core._bufferService),
      hasBuffer: 'buffer' in core._bufferService
    });
  }
  
  return null;
}

/**
 * 强制重新渲染终端
 */
function scheduleRedraw(term: Terminal): void {
  const core = getCore(term);
  core?._renderService?.scheduleRedraw?.();
}

/**
 * 获取 buffer 的 lines 集合
 * 尝试多种可能的访问方式
 */
function getBufferLines(buffer: any): any {
  if (!buffer) return null;
  
  // 方法1: 直接访问 buffer.lines（最直接的方式）
  // 从调试信息看，lines 确实存在于 buffer 中
  if ('lines' in buffer) {
    const lines = buffer.lines;
    // 检查 lines 是否可用（可能是 getter，需要检查实际值）
    if (lines !== null && lines !== undefined) {
      // 检查是否有 splice 方法（数组或 CircularList）
      if (typeof lines.splice === 'function' || Array.isArray(lines)) {
        return lines;
      }
      // 也可能是其他类型的对象，只要有 get/set 方法也可以
      if (typeof lines.get === 'function' || typeof lines.length !== 'undefined') {
        return lines;
      }
    }
  }
  
  // 方法2: 尝试通过 _bufferService 访问（从调试信息看，buffer 有 _bufferService）
  if (buffer._bufferService?.buffer?.lines) {
    return buffer._bufferService.buffer.lines;
  }
  
  // 方法3: 尝试其他可能的属性名
  const possibleNames = ['_lines', 'linesArray', 'lineArray', 'bufferLines', 'scrollbackLines'];
  for (const name of possibleNames) {
    if (buffer[name] && (Array.isArray(buffer[name]) || typeof buffer[name].splice === 'function')) {
      return buffer[name];
    }
  }
  
  // 方法4: 查找所有包含 'line' 的属性
  for (const key in buffer) {
    if (key.toLowerCase().includes('line') && key !== 'lines') {
      const candidate = buffer[key];
      if (candidate && (Array.isArray(candidate) || typeof candidate.splice === 'function')) {
        return candidate;
      }
    }
  }
  
  return null;
}

/**
 * 计算从底部开始的行索引对应的实际行号
 * @param buffer buffer 对象
 * @param indexFromBottom 从底部开始的行索引（1 表示最后一行）
 * @returns 实际的行索引（从顶部开始，0-based）
 */
function rowFromBottom(buffer: any, indexFromBottom: number): number {
  if (!buffer) return -1;
  
  // 使用 ybase 来计算实际行索引
  // ybase 是当前视口底部在 buffer 中的位置
  if (typeof buffer.ybase === 'number') {
    return buffer.ybase - indexFromBottom;
  }
  
  // 回退方法：使用 buffer.length
  const total = buffer.length ?? 0;
  return total - indexFromBottom;
}

/**
 * 删除指定行（从底部开始计数）
 * @param term Terminal 实例
 * @param indexFromBottom 从底部开始的行索引（1 表示最后一行）
 * @returns 是否成功删除
 */
export function fastDeleteScrollbackLine(term: Terminal, indexFromBottom: number): boolean {
  const buffer = getBuffer(term);
  if (!buffer) {
    console.warn('[fastDeleteScrollbackLine] Buffer not found');
    
    // 输出详细的调试信息
    const core = getCore(term);
    console.log('=== Debug Info ===');
    console.log('Terminal:', {
      hasBuffer: 'buffer' in term,
      buffer: (term as any).buffer,
      hasCore: !!core
    });
    
    if (core) {
      console.log('Core:', {
        hasBuffer: 'buffer' in core,
        buffer: core.buffer,
        coreKeys: Object.keys(core).filter(k => k.includes('buffer') || k.includes('Buffer'))
      });
    }
    
    return false;
  }

  // 尝试获取 buffer.lines
  // 从调试信息看，lines 确实存在于 buffer 中（在 bufferKeys 的第 20 个位置）
  let lines = buffer.lines;
  
  // 如果直接访问失败，尝试通过 getBufferLines 查找
  if (!lines) {
    lines = getBufferLines(buffer);
  }
  
  if (!lines) {
    console.warn('[fastDeleteScrollbackLine] buffer.lines is not available');
    console.log('Buffer structure:', {
      bufferKeys: Object.keys(buffer),
      hasLength: 'length' in buffer,
      length: buffer.length,
      hasYbase: 'ybase' in buffer,
      ybase: buffer.ybase,
      hasLines: 'lines' in buffer,
      linesType: typeof buffer.lines,
      linesValue: buffer.lines,
      bufferType: buffer.constructor?.name
    });
    return false;
  }
  
  // 检查 lines 是否有 splice 方法
  if (typeof lines.splice !== 'function' && !Array.isArray(lines)) {
    console.warn('[fastDeleteScrollbackLine] buffer.lines does not have splice method');
    console.log('Lines structure:', {
      linesType: typeof lines,
      linesConstructor: lines.constructor?.name,
      linesKeys: Object.keys(lines),
      hasSplice: typeof lines.splice === 'function',
      isArray: Array.isArray(lines)
    });
    return false;
  }

  const row = rowFromBottom(buffer, indexFromBottom);
  const total = lines.length;
  
  if (row < 0 || row >= total) {
    console.warn(`[fastDeleteScrollbackLine] Invalid row index: ${row} (total: ${total}, indexFromBottom: ${indexFromBottom})`);
    return false;
  }

  try {
    // 删除指定行
    lines.splice(row, 1);
    
    // 注意：不需要在开头添加空白行，删除后下方的行会自动上移
    
    // 更新 buffer 的长度（如果可写）
    if (buffer.length !== undefined) {
      buffer.length = lines.length;
    }
    
    scheduleRedraw(term);
    return true;
  } catch (e) {
    console.error('[fastDeleteScrollbackLine] Error:', e);
    return false;
  }
}

/**
 * 在指定位置插入新行（从底部开始计数）
 * @param term Terminal 实例
 * @param indexFromBottom 从底部开始的行索引（1 表示在最后一行之前插入，0 表示在最后一行之后插入）
 * @param text 要插入的文本内容
 * @returns 是否成功插入
 */
export function fastInsertScrollbackLine(term: Terminal, indexFromBottom: number, text: string): boolean {
  const buffer = getBuffer(term);
  if (!buffer) {
    console.warn('[fastInsertScrollbackLine] Buffer not found');
    return false;
  }

  // 尝试获取 buffer.lines
  // 从调试信息看，lines 确实存在于 buffer 中
  let lines = buffer.lines;
  
  // 如果直接访问失败，尝试通过 getBufferLines 查找
  if (!lines) {
    lines = getBufferLines(buffer);
  }
  
  if (!lines) {
    console.warn('[fastInsertScrollbackLine] buffer.lines is not available');
    return false;
  }
  
  // 检查 lines 是否有 splice 方法
  if (typeof lines.splice !== 'function' && !Array.isArray(lines)) {
    console.warn('[fastInsertScrollbackLine] buffer.lines does not have splice method');
    return false;
  }

  const row = rowFromBottom(buffer, indexFromBottom);
  const total = lines.length;
  
  if (row < 0 || row > total) {
    console.warn(`[fastInsertScrollbackLine] Invalid row index: ${row} (total: ${total}, indexFromBottom: ${indexFromBottom})`);
    return false;
  }

  try {
    // 创建新行
    if (typeof buffer._getBlankLine !== 'function') {
      console.warn('[fastInsertScrollbackLine] buffer._getBlankLine is not available');
      return false;
    }
    
    const newLine = buffer._getBlankLine();
    
    // 插入文本到新行
    if (typeof newLine.insertChars === 'function') {
      newLine.insertChars(text);
    } else {
      console.warn('[fastInsertScrollbackLine] newLine.insertChars is not available');
      return false;
    }
    
    // 在指定位置插入新行
    lines.splice(row, 0, newLine);
    
    // 检查是否超过最大行数限制，如果超过则删除最旧的行
    const maxLines = (term.options.scrollback || 1000) + term.rows;
    while (lines.length > maxLines) {
      lines.pop();
    }
    
    // 更新 buffer 的长度（如果可写）
    if (buffer.length !== undefined) {
      buffer.length = lines.length;
    }
    
    scheduleRedraw(term);
    return true;
  } catch (e) {
    console.error('[fastInsertScrollbackLine] Error:', e);
    return false;
  }
}

/**
 * 批量修改滚动缓冲区
 * @param term Terminal 实例
 * @param items 修改项数组，每个项包含 indexFromBottom 和 text
 * @returns 是否成功修改
 */
export function fastBatchModifyScrollback(
  term: Terminal,
  items: Array<{ indexFromBottom: number; text: string }>
): boolean {
  const buffer = getBuffer(term);
  if (!buffer) {
    console.warn('[fastBatchModifyScrollback] Buffer not found');
    return false;
  }

  // 尝试获取 buffer.lines
  // 从调试信息看，lines 确实存在于 buffer 中
  let lines = buffer.lines;
  
  // 如果直接访问失败，尝试通过 getBufferLines 查找
  if (!lines) {
    lines = getBufferLines(buffer);
  }
  
  if (!lines) {
    console.warn('[fastBatchModifyScrollback] buffer.lines is not available');
    return false;
  }

  const total = lines.length;

  try {
    for (const item of items) {
      const row = rowFromBottom(buffer, item.indexFromBottom);
      if (row < 0 || row >= total) {
        console.warn(`[fastBatchModifyScrollback] Invalid row index: ${row} (total: ${total}, indexFromBottom: ${item.indexFromBottom})`);
        continue;
      }

      // 创建新行并插入文本
      if (typeof buffer._getBlankLine !== 'function') {
        console.warn('[fastBatchModifyScrollback] buffer._getBlankLine is not available');
        continue;
      }
      
      const newLine = buffer._getBlankLine();
      
      if (typeof newLine.insertChars === 'function') {
        newLine.insertChars(item.text);
      } else {
        console.warn('[fastBatchModifyScrollback] newLine.insertChars is not available');
        continue;
      }

      // 更新行
      if (typeof lines.set === 'function') {
        lines.set(row, newLine);
      } else if (typeof lines.splice === 'function') {
        lines.splice(row, 1, newLine);
      } else {
        console.warn('[fastBatchModifyScrollback] No method to update line');
        continue;
      }
    }

    scheduleRedraw(term);
    return true;
  } catch (e) {
    console.error('[fastBatchModifyScrollback] Error:', e);
    return false;
  }
}
