export type MessageType =
  | "resourceTree.refresh"
  | "resourceTree.openNode"
  | "resourceTree.clickNode"
  | "resourceTree.addNode"
  | "resourceTree.openAddNodeModal"
  | "resourceTree.updateNode"
  | "resourceTree.openUpdateNodeModal"
  | "resourceTree.removeNode"
  | "resourceTree.openRemoveNodeModal"
  | "navtag.clickTag"
  | "navtag.closeTag"
  | "quoteRelation.openDialog"
  | "microApp.refreshList";

/**
 * 消息来源，明确是哪个组件实例发送的
 */
export interface MessageSource {
  componentName: string;
  instanceId?: string;
}

export interface MessageTarget {
  componentName: string;
}

/**
 * 消息元数据：统一的信封信息
 */
export interface MessageMetadata {
  messageId: string;
  source: MessageSource;
  to?: MessageTarget;
  timestamp: number;
  version: string;
}

// 空载荷的消息接口，用于不需要传递具体数据的消息
export interface EmptyPayload {}

// 仅包含资源ID的业务数据
export interface ResourceIdPayload {
  resourceId: string;
}

// 仅包含父节点ID的业务数据
export interface ResourceParentIdPayload {
  resourceParentId: string;
}

// 添加或更新节点的业务数据
export interface ResourceNodeDataPayload {
  resourceParentId?: string;
  resourceId: string;
  type: string;
  name: string;
}

/**
 * 打开添加节点模态框的 Payload (命令)
 */
export interface ResourceTreeNodeOpenAddModalPayload {
  resourceType: string;
  resourceParentId: string;
}

/**
 * 打开引用关系对话框的 Payload
 */
export interface QuoteRelationOpenDialogPayload {
  name: string;
}

export type Message =
  | {
      metadata: MessageMetadata & { type: "resourceTree.refresh" };
      data: EmptyPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "resourceTree.openNode" };
      data: ResourceIdPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "resourceTree.clickNode" };
      data: ResourceNodeDataPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "resourceTree.addNode" };
      data: ResourceParentIdPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "resourceTree.openAddNodeModal" };
      data: ResourceNodeDataPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "resourceTree.updateNode" };
      data: ResourceNodeDataPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "resourceTree.openUpdateNodeModal" };
      data: ResourceIdPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "resourceTree.removeNode" };
      data: ResourceIdPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "resourceTree.openRemoveNodeModal" };
      data: ResourceIdPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "navtag.clickTag" };
      data: EmptyPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "navtag.closeTag" };
      data: EmptyPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "quoteRelation.openDialog" };
      data: QuoteRelationOpenDialogPayload;
      extraData?: Record<string, any>;
    }
  | {
      metadata: MessageMetadata & { type: "microApp.refreshList" };
      data: EmptyPayload;
      extraData?: Record<string, any>;
    };

/**
 * 消息生成函数
 *
 * 根据消息类型、来源和业务数据，生成一个完整的、符合 AppMessage 接口的消息对象。
 *
 * @param type 消息类型，必须是 MessageType 中的一种。
 * @param source 消息来源，包含组件名和实例ID。
 * @param data 消息携带的业务数据，其类型必须与 type 匹配。
 * @param extraData 可选的额外数据，用于临时或非标准信息。
 * @returns 返回一个类型安全的 AppMessage 对象。
 */
export const createMessage = <T extends MessageType>(
  type: T,
  source: MessageSource,
  data: Message extends { metadata: { type: T }; data: infer P } ? P : never,
  extraData?: Record<string, any>
): Message => {
  const metadata = {
    messageId: uuidv4(),
    source: source,
    timestamp: Date.now(),
    type: type,
    version: "1.0",
  };

  const message = {
    metadata,
    data,
    ...(extraData && { extraData }),
  };

  return message as Message;
};

const handleNodeClick = () => {
  // TypeScript 会自动推断出 data 必须是 { resourceId: string } 类型
  const message: Message = createMessage(
    "resourceTree.openNode",
    { componentName: props.componentName, instanceId: props.nodeId },
    { resourceId: props.nodeId }
  );

  if (emitter) {
    // 发送消息
    emitter.emit(message.metadata.type, message);
  }
};
