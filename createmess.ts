// src/utils/message.ts

import { v4 as uuidv4 } from 'uuid';
import { AppMessage, MessageType, MessageSource } from '@/types/message';

/**
 * 创建符合模板的消息对象。
 * @param {MessageType} type 消息类型。
 * @param {MessageSource} source 消息来源。
 * @param {any} data 业务数据。
 * @returns {AppMessage} 完整的消息对象。
 */
export const createMessage = (type: MessageType, source: MessageSource, data: any): AppMessage => {
  const metadata = {
    messageId: uuidv4(),
    source,
    timestamp: Date.now(),
    type,
    version: '1.0',
  };

  // 这里使用类型断言来确保返回类型正确，
  // 实际项目中可以编写更复杂的验证逻辑。
  return { metadata, data } as AppMessage;
};
