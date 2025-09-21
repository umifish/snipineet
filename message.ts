// src/types/message.ts

/**
 * 消息来源的元数据
 */
export interface MessageSource {
  componentName: string;
  instanceId?: string; // 可选
}

/**
 * 通用消息元数据
 */
export interface BaseMessageMetadata {
  messageId: string;
  source: MessageSource;
  timestamp: number;
  type: string; // 消息类型
  version: string;
}

/**
 * 可兼容的消息类型
 */
export type MessageType =
  | "task.reordered"
  | "task.status_updated"
  | "board.clear_all"
  | "board.task_created";

/**
 * 定义不同消息类型的业务数据 (Payload)
 */

// 任务重新排序的消息数据
export interface TaskReorderedPayload {
  taskId: string;
  fromPosition: number;
  toPosition: number;
  boardId: string;
}

// 任务状态更新的消息数据
export interface TaskStatusUpdatedPayload {
  taskId: string;
  oldStatus: "pending" | "completed";
  newStatus: "pending" | "completed";
}

// 清空所有任务的消息数据
export interface BoardClearAllPayload {
  triggeredBy: string;
}

// 创建新任务的消息数据
export interface BoardTaskCreatedPayload {
  taskId: string;
  title: string;
  description: string;
  boardId: string;
}

/**
 * 消息的完整结构：使用判别式联合
 * 这让 TypeScript 能够根据 `metadata.type` 智能推断 `data` 的类型。
 */
export type AppMessage =
  | {
      metadata: BaseMessageMetadata & { type: "task.reordered" };
      data: TaskReorderedPayload;
    }
  | {
      metadata: BaseMessageMetadata & { type: "task.status_updated" };
      data: TaskStatusUpdatedPayload;
    }
  | {
      metadata: BaseMessageMetadata & { type: "board.clear_all" };
      data: BoardClearAllPayload;
    }
  | {
      metadata: BaseMessageMetadata & { type: "board.task_created" };
      data: BoardTaskCreatedPayload;
    };
