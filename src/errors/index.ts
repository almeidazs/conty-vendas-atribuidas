import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ErrorCode, ErrorMessage } from './codes';

// Único lugar que monta o corpo de erro, para todo erro sair no mesmo formato.
export const respond = <Status extends ContentfulStatusCode>(
	c: Context,
	status: Status,
	code: ErrorCode,
	errors?: unknown,
) =>
	c.json(
		{
			code,
			message: ErrorMessage[code],
			...(errors === undefined ? {} : { errors }),
		},
		status,
	);

export const badRequest = (
	c: Context,
	code = ErrorCode.BAD_REQUEST,
	errors?: unknown,
) => respond(c, 400, code, errors);

export const unauthorized = (c: Context, code = ErrorCode.INVALID_SIGNATURE) =>
	respond(c, 401, code);

export const notFound = (c: Context, code: ErrorCode) => respond(c, 404, code);

export const conflict = (c: Context, code: ErrorCode, errors?: unknown) =>
	respond(c, 409, code, errors);

export const unsupportedMediaType = (
	c: Context,
	code = ErrorCode.UNSUPPORTED_MEDIA_TYPE,
) => respond(c, 415, code);

export const unprocessable = (c: Context, code: ErrorCode, errors?: unknown) =>
	respond(c, 422, code, errors);

export const internalError = (c: Context, code = ErrorCode.INTERNAL_ERROR) =>
	respond(c, 500, code);

export { ErrorCode, ErrorMessage } from './codes';
