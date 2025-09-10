// 扩展 XMLHttpRequest 接口以添加内部属性
declare global {
  interface XMLHttpRequest {
    _proxy?: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: XMLHttpRequestBodyInit | null | undefined;
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

// 定义不同阶段的处理器
interface ProxyHandler {
  onOpen?: (request: ProxyRequest) => void;
  onSetRequestHeader?: (
    request: ProxyRequest,
    name: string,
    value: string
  ) => void;
  onSend?: (request: ProxyRequest) => Promise<ProxyRequest["body"]>;
}

// 定义代理规则的类型
export interface ProxyRule {
  match: (url: string, method: string) => boolean;
  handler: ProxyHandler;
}

// 定义配置选项的类型
export interface ProxyOptions {
  rules: ProxyRule[];
}

let isProxyEnabled = false;
let originalOpen: (
  method: string,
  url: string,
  async?: boolean,
  user?: string,
  password?: string
) => void;
let originalSend: (body?: XMLHttpRequestBodyInit) => void;
let originalSetRequestHeader: (name: string, value: string) => void;
let originalFetch: typeof window.fetch;

/**
 * 设置 XMLHttpRequest 的代理
 * @param {ProxyOptions} options
 * @returns {() => void} restore 函数
 */
function setupXHRProxy(options: ProxyOptions): () => void {
  originalOpen = XMLHttpRequest.prototype.open;
  originalSend = XMLHttpRequest.prototype.send;
  originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string,
    async = true,
    user = "",
    password = ""
  ) {
    const matchedRule = options.rules.find((rule) => rule.match(url, method));
    this._proxy = { method, url, headers: {}, body: null };

    if (matchedRule?.handler.onOpen) {
      const proxyRequest: ProxyRequest = {
        method,
        url,
        body: null,
        setRequestHeader: (name, value) => (this._proxy!.headers[name] = value),
      };
      matchedRule.handler.onOpen(proxyRequest);
      // 更新 url 和 method
      this._proxy.url = proxyRequest.url;
      this._proxy.method = proxyRequest.method;
    }

    originalOpen.call(
      this,
      this._proxy.method as any,
      this._proxy.url as any,
      async,
      user,
      password
    );
  };

  XMLHttpRequest.prototype.setRequestHeader = function (
    name: string,
    value: string
  ) {
    if (this._proxy) {
      const matchedRule = options.rules.find((rule) =>
        rule.match(this._proxy!.url, this._proxy!.method)
      );
      if (matchedRule?.handler.onSetRequestHeader) {
        const proxyRequest: ProxyRequest = {
          method: this._proxy.method,
          url: this._proxy.url,
          body: null,
          setRequestHeader: (n, v) => (this._proxy!.headers[n] = v),
        };
        matchedRule.handler.onSetRequestHeader(proxyRequest, name, value);
      } else {
        this._proxy.headers[name] = value;
      }
    }
    originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (body?: XMLHttpRequestBodyInit) {
    if (this._proxy) {
      const matchedRule = options.rules.find((rule) =>
        rule.match(this._proxy!.url, this._proxy!.method)
      );
      if (matchedRule?.handler.onSend) {
        const originalThis = this;
        const proxyRequest: ProxyRequest = {
          method: this._proxy.method,
          url: this._proxy.url,
          body: body,
          setRequestHeader: (name, value) =>
            (this._proxy!.headers[name] = value),
        };

        const executeSend = (
          newBody: XMLHttpRequestBodyInit | null | undefined
        ) => {
          for (const headerName in this._proxy!.headers) {
            originalSetRequestHeader.call(
              originalThis,
              headerName,
              this._proxy!.headers[headerName]
            );
          }
          originalSend.call(originalThis, newBody);
        };

        matchedRule.handler
          .onSend(proxyRequest)
          .then((newBody) => executeSend(newBody))
          .catch((e) => {
            console.error("[XHR Proxy] 代理规则执行失败:", e);
            executeSend(body);
          });
      } else {
        originalSend.call(this, body);
      }
    } else {
      originalSend.call(this, body);
    }
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
  originalFetch = window.fetch;

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method || "GET";
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
        if (matchedRule.handler.onSend) {
          body = await matchedRule.handler.onSend(proxyRequest);
        }
      } catch (e) {
        console.error("[Fetch Proxy] 代理规则执行失败:", e);
      }

      const newInit = { ...init, headers, body, method };
      return originalFetch(input, newInit);
    }

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
export function requestProxy(options: ProxyOptions): { restore: () => void } {
  if (isProxyEnabled) {
    console.warn("requestProxy 已启用。请勿重复调用。");
    return { restore: () => {} };
  }

  const restoreXHR = setupXHRProxy(options);
  const restoreFetch = setupFetchProxy(options);

  isProxyEnabled = true;
  console.log("requestProxy 已启用。");

  return {
    restore: () => {
      restoreXHR();
      restoreFetch();
      isProxyEnabled = false;
      console.log("requestProxy 已禁用。");
    },
  };
}

export default requestProxy;
