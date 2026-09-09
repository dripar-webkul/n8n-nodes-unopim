import type { IDataObject } from 'n8n-workflow';

export interface RecordedCall {
	method?: string;
	url: string;
	headers?: IDataObject;
	body?: unknown;
	qs?: IDataObject;
}

export interface FakeContextOptions {
	clientId?: string;
	baseUrl?: string;
	responses?: Array<unknown | (() => unknown)>;
}

export function fakeContext(options: FakeContextOptions = {}) {
	const clientId = options.clientId ?? `client-${Math.random().toString(36).slice(2)}`;

	const calls: RecordedCall[] = [];
	const queue = [...(options.responses ?? [])];

	const helpers = {
		async httpRequest(request: RecordedCall) {
			calls.push(request);

			const next = queue.shift();

			if (typeof next === 'function') {
				return (next as () => unknown)();
			}

			return next ?? {};
		},
	};

	return {
		calls,
		clientId,
		helpers,
		getNode: () => ({ name: 'UnoPim', type: 'n8n-nodes-unopim.unoPim' }),
		async getCredentials() {
			return {
				baseUrl: options.baseUrl ?? 'https://demo.unopim.com',
				clientId,
				clientSecret: 'secret',
				username: 'integration+1@api.local',
				password: 'password',
			};
		},
	};
}

export function tokenResponse(token = 'token-1', expiresIn = 3600) {
	return { access_token: token, expires_in: expiresIn };
}

export function httpError(statusCode: number) {
	return () => {
		const error = new Error(`HTTP ${statusCode}`) as Error & { statusCode: number };

		error.statusCode = statusCode;

		throw error;
	};
}

export function page(size: number, startId: number) {
	return {
		data: Array.from({ length: size }, (_, index) => ({ id: startId + index })),
	};
}
