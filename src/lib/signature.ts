const encoder = new TextEncoder();

const key = (secret: string, usage: 'sign' | 'verify') =>
	crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		[usage],
	);

const fromBase64 = (value: string) => {
	try {
		return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
	} catch {
		return;
	}
};

/** Base64 do HMAC-SHA256 do corpo bruto, o mesmo formato do X-Shopify-Hmac-Sha256. */
export const sign = async (secret: string, body: string) => {
	const mac = await crypto.subtle.sign(
		'HMAC',
		await key(secret, 'sign'),
		encoder.encode(body),
	);
	return btoa(String.fromCharCode(...new Uint8Array(mac)));
};

/** `crypto.subtle.verify` compara em tempo constante. */
export const verifySignature = async (
	secret: string,
	body: string,
	signature: string | undefined,
) => {
	if (!secret || !signature) return false;
	const mac = fromBase64(signature.trim());
	if (!mac) return false;
	return crypto.subtle.verify(
		'HMAC',
		await key(secret, 'verify'),
		mac,
		encoder.encode(body),
	);
};

export const sha256 = async (body: string) => {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(body));
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
};
