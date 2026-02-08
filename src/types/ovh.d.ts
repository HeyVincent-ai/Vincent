declare module '@ovhcloud/node-ovh' {
  interface OvhClientOptions {
    endpoint: string;
    appKey: string;
    appSecret: string;
    consumerKey: string;
  }

  interface OvhClient {
    requestPromised(method: string, path: string, body?: any): Promise<any>;
    request(method: string, path: string, callback: (err: any, data: any) => void): void;
    request(method: string, path: string, body: any, callback: (err: any, data: any) => void): void;
  }

  function ovh(options: OvhClientOptions): OvhClient;
  export = ovh;
}
