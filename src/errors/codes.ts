/**
 * O cliente decide o que fazer pelo código, nunca pela mensagem: a mensagem é
 * texto de interface e pode mudar sem aviso.
 */
export enum ErrorCode {
	BAD_REQUEST = 'BAD_REQUEST',
	VALIDATION_FAILED = 'VALIDATION_FAILED',
	INVALID_SIGNATURE = 'INVALID_SIGNATURE',
	UNSUPPORTED_MEDIA_TYPE = 'UNSUPPORTED_MEDIA_TYPE',
	ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
	CREATOR_NOT_FOUND = 'CREATOR_NOT_FOUND',
	ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
	UTM_CODE_TAKEN = 'UTM_CODE_TAKEN',
	COUPON_TAKEN = 'COUPON_TAKEN',
	CURRENCY_MISMATCH = 'CURRENCY_MISMATCH',
	INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export const ErrorMessage: Record<ErrorCode, string> = {
	[ErrorCode.BAD_REQUEST]: 'Invalid request.',
	[ErrorCode.VALIDATION_FAILED]: 'Invalid data.',
	[ErrorCode.INVALID_SIGNATURE]: 'Missing or invalid webhook signature.',
	[ErrorCode.UNSUPPORTED_MEDIA_TYPE]: 'Send the body as application/json.',
	[ErrorCode.ROUTE_NOT_FOUND]: 'Route not found.',
	[ErrorCode.CREATOR_NOT_FOUND]: 'Creator not found.',
	[ErrorCode.ORDER_NOT_FOUND]: 'Order not found.',
	[ErrorCode.UTM_CODE_TAKEN]: 'This UTM code already belongs to a creator.',
	[ErrorCode.COUPON_TAKEN]: 'This coupon already belongs to a creator.',
	[ErrorCode.CURRENCY_MISMATCH]:
		'The refund currency is different from the order currency.',
	[ErrorCode.INTERNAL_ERROR]: 'Internal error.',
};
