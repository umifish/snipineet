// src/utils/scrollback.ts
// TypeScript 函数式 scrollback 工具

import { Terminal } from '@xterm/xterm';

function getCore(term: Terminal) {
  return (term as any)._core;
}

function getBuffer(term: Terminal) {
  const core = getCore(term);
  return core.buffer.normal;
}

export function rowFromBottom(term: Terminal, indexFromBottom: number): number {
  const buffer = getBuffer(term);
  return buffer.ybase - indexFromBottom;
}

function scheduleRedraw(term: Terminal) {
  const core = getCore(term);
  core._renderService?.scheduleRedraw?.();
}

export function deleteScrollbackLine(term: Terminal, indexFromBottom: number): boolean {
  const buffer = getBuffer(term);
  const row = rowFromBottom(term, indexFromBottom);
  if (row < 0 || row >= buffer.lines.length) return false;

  try {
    buffer.lines.splice(row, 1);
    const blank = buffer._getBlankLine();
    buffer.lines.unshift(blank);
    scheduleRedraw(term);
    return true;
  } catch (e) {
    console.error('deleteScrollbackLine error', e);
    return false;
  }
}

export function insertScrollbackLine(term: Terminal, indexFromBottom: number, text: string): boolean {
  const buffer = getBuffer(term);
  const row = rowFromBottom(term, indexFromBottom);
  if (row < 0 || row > buffer.lines.length) return false;

  try {
    const newLine = buffer._getBlankLine();
    newLine.insertChars(text);
    buffer.lines.splice(row, 0, newLine);

    const maxLines = (term.options.scrollback || 1000) + term.rows;
    while (buffer.lines.length > maxLines) buffer.lines.pop();

    scheduleRedraw(term);
    return true;
  } catch (e) {
    console.error('insertScrollbackLine error', e);
    return false;
  }
}

export function batchModifyScrollback(term: Terminal, items: { indexFromBottom: number; text: string }[]) {
  const buffer = getBuffer(term);
  try {
    for (const it of items) {
      const row = rowFromBottom(term, it.indexFromBottom);
      if (row < 0 || row >= buffer.lines.length) continue;

      const newLine = buffer._getBlankLine();
      newLine.insertChars(it.text);

      if (typeof buffer.lines.set === 'function') buffer.lines.set(row, newLine);
      else buffer.lines.splice(row, 1, newLine);
    }
    scheduleRedraw(term);
  } catch (e) {
    console.error('batchModifyScrollback error', e);
  }
}

export function readScrollbackLine(term: Terminal, indexFromBottom: number): string | null {
  const buffer = getBuffer(term);
  const row = rowFromBottom(term, indexFromBottom);
  const line = buffer.getLine(row);
  if (!line) return null;
  if (typeof line.translateToString === 'function') return line.translateToString(true);
  if (typeof line.toString === 'function') return line.toString(true);
  return null;
}
