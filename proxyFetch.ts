// 扩展 XMLHttpRequest 接口以添加内部属性
declare global {
  interface XMLHttpRequest {
    _proxy?: {
      method: string;
      url: string;
      headers: Record<string, string>;
    };
  }
}

// 定义用于 onRequest 回调的请求对象类型
export interface ProxyRequest {
  method: string;
  url: string;
  body: XMLHttpRequestBodyInit | null | undefined;
  setRequestHeader: (name: string, value: string) => void;
  getHeaders?: () => Headers;
}

// 定义代理规则的类型
export interface ProxyRule {
  match: (url: string, method: string) => boolean;
  handler: (request: ProxyRequest) => Promise<ProxyRequest["body"]>;
}

// 定义配置选项的类型
export interface ProxyOptions {
  rules: ProxyRule[];
}

let isProxyEnabled = false;

/**
 * 设置 XMLHttpRequest 的代理
 * @param {ProxyOptions} options
 * @returns {() => void} restore 函数
 */
function setupXHRProxy(options: ProxyOptions): () => void {
  // 保存原始的 XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const defaultRules = [
    {
      match: (url: string, method: string) => url.includes("/api/resource/"),
      handler: async (request: ProxyRequest) => {
        return request.body;
      },
    },
  ];

  XMLHttpRequest.prototype.open = function (method: string, url: string) {
    this._proxy = { method, url, headers: {} };
    originalOpen.apply(this, arguments as any);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (
    name: string,
    value: string
  ) {
    if (this._proxy) {
      this._proxy.headers[name] = value;
    }
    originalSetRequestHeader.apply(this, arguments as any);
  };

  XMLHttpRequest.prototype.send = function (
    body?: XMLHttpRequestBodyInit | null
  ) {
    let modifiedBody: XMLHttpRequestBodyInit | null | undefined = body;
    const request = this._proxy;

    if (isProxyEnabled && request) {
      const rules = options.rules ?? defaultRules;
      const matchedRule = rules.find((rule) =>
        rule.match(request.url, request.method)
      );

      if (matchedRule) {
        const proxyHandler = async () => {
          try {
            const proxyRequest: ProxyRequest = {
              method: request.method,
              url: request.url,
              body: body,
              setRequestHeader: (name, value) =>
                originalSetRequestHeader.call(this, name, value),
            };
            modifiedBody = await matchedRule.handler(proxyRequest);
          } catch (e) {
            console.error("[XHR Proxy] 代理规则执行失败:", e);
          } finally {
            originalSend.call(this, modifiedBody);
          }
        };
        proxyHandler();
        return; // 阻止同步发送
      }
    }
    // 没有匹配规则或代理未启用，发送原始请求
    originalSend.call(this, body);
  };

  return () => {
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
    XMLHttpRequest.prototype.setRequestHeader = originalSetRequestHeader;
  };
}

/**
 * 设置 Fetch API 的代理
 * @param {ProxyOptions} options
 * @returns {() => void} restore 函数
 */
function setupFetchProxy(options: ProxyOptions): () => void {
  // 保存原始的 Fetch 方法
  const originalFetch = window.fetch;

  window.fetch = async function (
    input: RequestInfo,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input.url;
    const method = init?.method?.toUpperCase() || "GET";

    if (isProxyEnabled) {
      const matchedRule = options.rules.find((rule) => rule.match(url, method));
      if (matchedRule) {
        const headers = new Headers(init?.headers);
        let body = init?.body;

        const proxyRequest: ProxyRequest = {
          method,
          url,
          body,
          setRequestHeader: (name, value) => {
            headers.set(name, value);
          },
          getHeaders: () => headers,
        };

        try {
          body = await matchedRule.handler(proxyRequest);
        } catch (e) {
          console.error("[Fetch Proxy] 代理规则执行失败:", e);
        }

        const newInit = { ...init, headers, body, method };
        return originalFetch(input, newInit);
      }
    }
    // 没有匹配规则或代理未启用，发送原始请求
    return originalFetch(input, init);
  };

  return () => {
    window.fetch = originalFetch;
  };
}

/**
 * requestProxy 函数，作为代理功能的入口
 * @param {ProxyOptions} options - 包含代理规则的配置对象。
 * @returns {{restore: () => void}} 一个包含 restore 方法的对象。
 */
function requestProxy(options: ProxyOptions): { restore: () => void } {
  if (isProxyEnabled) {
    console.warn("requestProxy 已启用。请勿重复调用。");
    return { restore: () => {} };
  }

  const restoreXHR = setupXHRProxy(options);
  const restoreFetch = setupFetchProxy(options);

  isProxyEnabled = true;
  console.log("requestProxy 代理已启用。");

  return {
    restore: () => {
      restoreXHR();
      restoreFetch();
      isProxyEnabled = false;
      console.log("requestProxy 代理已禁用，原始方法已恢复。");
    },
  };
}

export default requestProxy;
