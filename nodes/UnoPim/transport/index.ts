import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	IPollFunctions,
	IHttpRequestOptions,
	IWebhookFunctions,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export type UnoPimContext =
	| IExecuteFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| IPollFunctions
	| IWebhookFunctions;

export const MAX_PAGE_SIZE = 100;

export const INTEGRATION_NOT_INSTALLED =
	'UnoPim n8n Integration is not installed or enabled on this UnoPim instance.';

export const INTEGRATION_NOT_INSTALLED_HINT =
	'Please ask your UnoPim administrator to install and activate the n8n Integration extension, ' +
	'then try connecting again. Learn more: https://store.webkul.com/unopim-n8n-connector.html';

const PLATFORM_PREFIX = '/n8n/';

function statusCodeOf(error: unknown): number | undefined {
	const source = error as {
		statusCode?: number;
		httpCode?: number | string;
		response?: { status?: number };
		cause?: { response?: { status?: number } };
	};

	const code =
		source?.statusCode ??
		source?.response?.status ??
		source?.cause?.response?.status ??
		source?.httpCode;

	return code === undefined ? undefined : Number(code);
}

function responseBodyOf(error: unknown): IDataObject | undefined {
	const source = error as {
		response?: { data?: unknown; body?: unknown };
		cause?: { response?: { data?: unknown; body?: unknown } };
		error?: unknown;
	};

	const raw =
		source?.response?.data ??
		source?.response?.body ??
		source?.cause?.response?.data ??
		source?.cause?.response?.body ??
		source?.error;

	if (typeof raw === 'string') {
		try {
			const parsed = JSON.parse(raw) as unknown;

			return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
				? (parsed as IDataObject)
				: undefined;
		} catch {
			return undefined;
		}
	}

	return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
		? (raw as IDataObject)
		: undefined;
}

function errorLines(errors: unknown): string[] {
	if (typeof errors === 'string') {
		return errors.trim() === '' ? [] : [errors.trim()];
	}

	if (errors !== null && typeof errors === 'object') {
		return Object.values(errors).flatMap((value) => errorLines(value));
	}

	return [];
}

function toApiError(context: UnoPimContext, error: unknown): NodeApiError {
	const body = responseBodyOf(error);

	const summary = typeof body?.message === 'string' ? body.message.trim() : '';

	const details = errorLines(body?.errors).filter((line) => line !== summary);

	const message = [summary, ...details].filter((part) => part !== '').join(' ');

	if (message === '') {
		return new NodeApiError(context.getNode(), error as never);
	}

	const statusCode = statusCodeOf(error);

	const apiError = new NodeApiError(context.getNode(), error as never, {
		message,
		httpCode: statusCode === undefined ? undefined : String(statusCode),
	});

	apiError.description = body?.errors === undefined ? undefined : JSON.stringify(body.errors);

	return apiError;
}

export interface UnoPimListResponse {
	data?: IDataObject[];
	current_page?: number;
	last_page?: number;
	total?: number;
	search_after?: string | number | null;
}

interface CachedToken {
	token: string;
	expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

function normalise(baseUrl: unknown): string {
	return String(baseUrl ?? '').trim().replace(/\/+$/, '');
}

export async function accessToken(
	context: UnoPimContext,
	forceRefresh = false,
): Promise<{ token: string; baseUrl: string; cacheKey: string }> {
	const credentials = await context.getCredentials('unoPimApi');

	const base = normalise(credentials.baseUrl);
	const cacheKey = `${base}|${credentials.clientId}|${credentials.username}`;

	const cached = tokenCache.get(cacheKey);

	if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
		return { token: cached.token, baseUrl: base, cacheKey };
	}

	const response = (await context.helpers.httpRequest({
		method: 'POST',
		url: `${base}/oauth/token`,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			grant_type: 'password',
			client_id: String(credentials.clientId ?? ''),
			client_secret: String(credentials.clientSecret ?? ''),
			username: String(credentials.username ?? ''),
			password: String(credentials.password ?? ''),
			scope: '',
		}).toString(),
		json: true,
	})) as { access_token?: string; expires_in?: number };

	if (!response?.access_token) {
		throw new Error(
			'UnoPim did not return an access token. Check the UnoPim URL and the four API key values.',
		);
	}

	const lifetime = (response.expires_in ?? 3600) * 1000;

	tokenCache.set(cacheKey, {
		token: response.access_token,
		expiresAt: Date.now() + Math.max(lifetime - 60_000, 30_000),
	});

	return { token: response.access_token, baseUrl: base, cacheKey };
}

export async function unopimApiRequest(
	this: UnoPimContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
): Promise<IDataObject> {
	const send = async (forceRefresh: boolean): Promise<IDataObject> => {
		const { token, baseUrl } = await accessToken(this, forceRefresh);

		const options: IHttpRequestOptions = {
			method,
			url: `${baseUrl}/api/v1/rest${endpoint}`,
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${token}`,
			},
			qs,
			json: true,
		};

		if (Object.keys(body).length > 0) {
			options.body = body;
		}

		return (await this.helpers.httpRequest(options)) as IDataObject;
	};

	const fail = (error: unknown): never => {
		if (endpoint.startsWith(PLATFORM_PREFIX) && statusCodeOf(error) === 404) {
			throw new NodeOperationError(this.getNode(), INTEGRATION_NOT_INSTALLED, {
				description: INTEGRATION_NOT_INSTALLED_HINT,
			});
		}

		throw toApiError(this, error);
	};

	try {
		return await send(false);
	} catch (error) {
		if (statusCodeOf(error) !== 401) {
			fail(error);
		}
	}

	try {
		return await send(true);
	} catch (error) {
		fail(error);
	}

	throw new NodeOperationError(this.getNode(), 'UnoPim request failed without a response.');
}

export async function unopimApiRequestAllItems(
	this: UnoPimContext,
	endpoint: string,
	qs: IDataObject = {},
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];

	const query: IDataObject = {
		...qs,
		limit: MAX_PAGE_SIZE,
		pagination_type: 'search_after',
	};

	let searchAfter: unknown;

	do {
		if (searchAfter !== undefined) {
			query.search_after = searchAfter;
		}

		const response = (await unopimApiRequest.call(
			this,
			'GET',
			endpoint,
			{},
			query,
		)) as UnoPimListResponse;

		const page = response.data ?? [];

		items.push(...page);

		searchAfter = nextCursor(response, page, searchAfter);
	} while (searchAfter !== undefined);

	return items;
}

function nextCursor(
	response: UnoPimListResponse,
	page: IDataObject[],
	previous: unknown,
): unknown {
	if (page.length === 0) {
		return undefined;
	}

	const cursor =
		response.search_after ?? (page.length === MAX_PAGE_SIZE ? page[page.length - 1]?.id : undefined);

	if (cursor === null || cursor === undefined || cursor === previous) {
		return undefined;
	}

	return cursor;
}

export async function unopimApiRequestLimited(
	this: UnoPimContext,
	endpoint: string,
	limit: number,
	qs: IDataObject = {},
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];

	let page = 1;

	while (items.length < limit) {
		const response = (await unopimApiRequest.call(this, 'GET', endpoint, {}, {
			...qs,
			limit: Math.min(MAX_PAGE_SIZE, limit - items.length),
			page,
		})) as UnoPimListResponse;

		const rows = response.data ?? [];

		items.push(...rows);

		if (rows.length === 0 || (response.last_page ?? page) <= page) {
			break;
		}

		page += 1;
	}

	return items.slice(0, limit);
}
