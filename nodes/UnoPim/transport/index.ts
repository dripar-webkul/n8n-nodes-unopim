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
import { NodeApiError } from 'n8n-workflow';

export type UnoPimContext =
	| IExecuteFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| IPollFunctions
	| IWebhookFunctions;

export const MAX_PAGE_SIZE = 100;

export interface UnoPimListResponse {
	data?: IDataObject[];
	current_page?: number;
	last_page?: number;
	total?: number;
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

	try {
		return await send(false);
	} catch (error) {
		if ((error as { statusCode?: number }).statusCode !== 401) {
			throw new NodeApiError(this.getNode(), error as never);
		}
	}

	try {
		return await send(true);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as never);
	}
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

		searchAfter = page.length === MAX_PAGE_SIZE ? page[page.length - 1]?.id : undefined;
	} while (searchAfter !== undefined);

	return items;
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
