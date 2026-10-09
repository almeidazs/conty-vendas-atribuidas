import type { z } from '@hono/zod-openapi';
import type { PaginationSchema } from '../lib/openapi';

export type Pagination = z.infer<typeof PaginationSchema>;
export type Page<T> = { data: T[]; pagination: Pagination };
export type PageInput = { page: number; perPage: number };
