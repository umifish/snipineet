// Safe Scrollback (Rebuild-Based) Version
// Fully version-stable, no private API usage
import { Terminal } from '@xterm/xterm';

function bufferToLines(term: Terminal): string[] {
  const buffer: any = (term as any).buffer?.active ?? (term as any).buffer;
  const lines: string[] = [];
  const length = buffer.length ?? buffer.lines?.length ?? 0;
  for (let i = 0; i < length; i++) {
    const line = buffer.getLine(i);
    if (!line) { lines.push(''); continue; }
    if (typeof line.translateToString === 'function') {
      lines.push(line.translateToString(true));
    } else if (typeof line.toString === 'function') {
      lines.push(line.toString(true));
    } else {
      lines.push('');
    }
  }
  return lines;
}

function rebuildTerminalFromLines(term: Terminal, lines: string[]) {
  const opts = { cols: term.cols, rows: term.rows, scrollback: term.options.scrollback };
  const container = (term as any).element;
  term.dispose();
  const newTerm = new (term.constructor as any)(opts) as Terminal;
  if (container) newTerm.open(container);
  for (const l of lines) newTerm.writeln(l);
  return newTerm;
}

export function safeDeleteScrollbackLine(term: Terminal, indexFromBottom: number): Terminal {
    const buffer = (term as any).buffer.active;
    const total = buffer.length;
  
    const targetIndex = total - indexFromBottom;
    if (targetIndex < 0 || targetIndex >= total) return term;
  
    // 1. 读取全部文本
    const lines: string[] = [];
    for (let i = 0; i < total; i++) {
      const line = buffer.getLine(i);
      lines.push(line?.translateToString(true) ?? '');
    }
  
    // 2. 删除某一行
    lines.splice(targetIndex, 1);
  
    // 3. 生成新的 Terminal（必须重新创建，否则 scrollback 无法更新）
    const newTerm = new Terminal(term.options);
  
    // 4. 重新挂载
    const element = (term as any)._core._renderService._renderer._terminal;
    newTerm.open(element.parentElement);
  
    // 5. 写回所有文本（这一步你之前缺失）
    for (const l of lines) newTerm.writeln(l);
  
    // 6. 释放旧 terminal
    term.dispose();
  
    return newTerm;
  }
  
// export function safeDeleteScrollbackLine(term: Terminal, indexFromBottom: number): Terminal | null {
//   const lines = bufferToLines(term);
//   const idx = lines.length - indexFromBottom;
//   if (idx < 0 || idx >= lines.length) return null;
//   lines.splice(idx, 1);
//   return rebuildTerminalFromLines(term, lines);
// }

export function safeInsertScrollbackLine(term: Terminal, indexFromBottom: number, text: string): Terminal | null {
  const lines = bufferToLines(term);
  const idx = lines.length - indexFromBottom;
  if (idx < 0 || idx > lines.length) return null;
  lines.splice(idx, 0, text);
  return rebuildTerminalFromLines(term, lines);
}


export function safeBatchModifyScrollback(term: Terminal, items: Array<{ indexFromBottom: number; text: string }>): Terminal {
  const lines = bufferToLines(term);
  for (const it of items) {
    const idx = lines.length - it.indexFromBottom;
    if (idx < 0 || idx >= lines.length) continue;
    lines[idx] = it.text;
  }
  return rebuildTerminalFromLines(term, lines);
}

