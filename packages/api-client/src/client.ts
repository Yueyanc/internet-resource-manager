import { z } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  }
  catch {
    if (init?.signal?.aborted) {
      throw init.signal.reason;
    }
    throw new ApiError(0, 'unavailable', '无法连接服务，请确认后端正在运行');
  }
  let body: unknown;
  try {
    body = await response.json();
  }
  catch {
    throw new ApiError(response.status, 'invalid_response', '服务返回了无法识别的数据');
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('irm:unauthorized'));
    }
    const result = errorSchema.safeParse(body);
    throw new ApiError(response.status, result.success ? result.data.error.code : 'request_failed', result.success ? result.data.error.message : '请求失败');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(response.status, 'invalid_response', '服务数据格式不符合约定');
  }
  return result.data;
}
