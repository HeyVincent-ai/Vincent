declare module '@ovhcloud/node-ovh' {
  interface OvhClientOptions {
    endpoint: string;
    appKey: string;
    appSecret: string;
    consumerKey: string;
  }

  interface OvhClient {
    requestPromised(method: string, path: string, body?: unknown): Promise<unknown>;
    request(method: string, path: string, callback: (err: unknown, data: unknown) => void): void;
    request(
      method: string,
      path: string,
      body: unknown,
      callback: (err: unknown, data: unknown) => void
    ): void;
  }

  function ovh(options: OvhClientOptions): OvhClient;
  export = ovh;
}
