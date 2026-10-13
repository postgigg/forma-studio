import type { IncomingMessage, ServerResponse } from "node:http";
export function createFrameService(options: {
  json: (res: ServerResponse, status: number, body: unknown) => void;
}): {
  handle: (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ) => Promise<boolean>;
};
