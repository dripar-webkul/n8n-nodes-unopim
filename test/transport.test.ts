/* eslint-disable @n8n/community-nodes/no-restricted-imports -- test files are not published; "files" limits the package to dist/ */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
	INTEGRATION_NOT_INSTALLED,
	MAX_PAGE_SIZE,
	accessToken,
	unopimApiRequest,
	unopimApiRequestAllItems,
	unopimApiRequestLimited,
} from '../dist/nodes/UnoPim/transport/index.js';

import { fakeContext, httpError, httpErrorWithBody, page, tokenResponse } from './support.ts';

describe('access token', () => {
	it('exchanges the api key values for a bearer token', async () => {
		const context = fakeContext({ responses: [tokenResponse('abc')] });

		const { token } = await accessToken(context);

		assert.equal(token, 'abc');
		assert.equal(context.calls[0].url, 'https://demo.unopim.com/oauth/token');
	});

	it('sends the token request form encoded because Passport reads the parsed body', async () => {
		const context = fakeContext({ responses: [tokenResponse()] });

		await accessToken(context);

		const request = context.calls[0];

		assert.equal(request.headers?.['Content-Type'], 'application/x-www-form-urlencoded');
		assert.equal(typeof request.body, 'string');
		assert.match(String(request.body), /grant_type=password/);
		assert.match(String(request.body), /client_secret=secret/);
	});

	it('reuses a cached token instead of asking again', async () => {
		const context = fakeContext({ responses: [tokenResponse('cached')] });

		await accessToken(context);
		const second = await accessToken(context);

		assert.equal(second.token, 'cached');
		assert.equal(context.calls.length, 1);
	});

	it('asks again when a refresh is forced', async () => {
		const context = fakeContext({
			responses: [tokenResponse('first'), tokenResponse('second')],
		});

		await accessToken(context);
		const refreshed = await accessToken(context, true);

		assert.equal(refreshed.token, 'second');
		assert.equal(context.calls.length, 2);
	});

	it('retires a token a minute before the server would', async (t) => {
		t.mock.timers.enable({ apis: ['Date'] });

		const context = fakeContext({
			responses: [tokenResponse('first', 3600), tokenResponse('second')],
		});

		await accessToken(context);

		t.mock.timers.tick((3600 - 59) * 1000);

		const again = await accessToken(context);

		assert.equal(again.token, 'second');
	});

	it('still caches a very short lived token so the endpoint is not hammered', async () => {
		const context = fakeContext({
			responses: [tokenResponse('short', 1), tokenResponse('second')],
		});

		await accessToken(context);
		const again = await accessToken(context);

		assert.equal(again.token, 'short');
		assert.equal(context.calls.length, 1);
	});

	it('normalises a base url carrying a trailing slash', async () => {
		const context = fakeContext({
			baseUrl: 'https://demo.unopim.com/',
			responses: [tokenResponse()],
		});

		const { baseUrl } = await accessToken(context);

		assert.equal(baseUrl, 'https://demo.unopim.com');
	});

	it('explains itself when no token comes back', async () => {
		const context = fakeContext({ responses: [{}] });

		await assert.rejects(accessToken(context), /did not return an access token/);
	});
});

describe('api request', () => {
	it('sends the bearer token on the catalog call', async () => {
		const context = fakeContext({ responses: [tokenResponse('bearer-1'), { data: [] }] });

		await unopimApiRequest.call(context, 'GET', '/products');

		const request = context.calls[1];

		assert.equal(request.url, 'https://demo.unopim.com/api/v1/rest/products');
		assert.equal(request.headers?.Authorization, 'Bearer bearer-1');
	});

	it('omits an empty body so a GET stays a GET', async () => {
		const context = fakeContext({ responses: [tokenResponse(), { data: [] }] });

		await unopimApiRequest.call(context, 'GET', '/products');

		assert.equal(context.calls[1].body, undefined);
	});

	it('sends a body when one is given', async () => {
		const context = fakeContext({ responses: [tokenResponse(), {}] });

		await unopimApiRequest.call(context, 'POST', '/products', { sku: 'SKU-1' });

		assert.deepEqual(context.calls[1].body, { sku: 'SKU-1' });
	});

	it('refreshes the token once and retries after a 401', async () => {
		const context = fakeContext({
			responses: [
				tokenResponse('stale'),
				httpError(401),
				tokenResponse('fresh'),
				{ data: [{ id: 1 }] },
			],
		});

		const result = await unopimApiRequest.call(context, 'GET', '/products');

		assert.deepEqual(result, { data: [{ id: 1 }] });
		assert.equal(context.calls[3].headers?.Authorization, 'Bearer fresh');
	});

	it('gives up after the retry also fails', async () => {
		const context = fakeContext({
			responses: [tokenResponse(), httpError(401), tokenResponse(), httpError(401)],
		});

		await assert.rejects(unopimApiRequest.call(context, 'GET', '/products'));
	});

	it('shows the message UnoPim gave for a rejected request', async () => {
		const errors = { immutable: ['The following fields cannot be modified: code.'] };

		const context = fakeContext({
			responses: [
				tokenResponse(),
				httpErrorWithBody(422, { success: false, message: 'Validation failed.', errors }),
			],
		});

		await assert.rejects(
			unopimApiRequest.call(context, 'PUT', '/association-types/upsell', { code: 'x' }),
			(error: Error & { description?: string; httpCode?: string }) => {
				assert.equal(
					error.message,
					'Validation failed. The following fields cannot be modified: code.',
				);
				assert.equal(error.description, JSON.stringify(errors));
				assert.equal(error.httpCode, '422');

				return true;
			},
		);
	});

	it('lists every field error so a continue on fail item says what to fix', async () => {
		const context = fakeContext({
			responses: [
				tokenResponse(),
				httpErrorWithBody(422, {
					message: 'Validation failed.',
					errors: {
						family: ['The family field is required.'],
						'values.common.sku': ['The values.common.sku field is required.'],
					},
				}),
			],
		});

		await assert.rejects(unopimApiRequest.call(context, 'POST', '/products', { parent: null }), {
			message:
				'Validation failed. The family field is required. The values.common.sku field is required.',
		});
	});

	it('reads the message from a response body that arrived as text', async () => {
		const context = fakeContext({
			responses: [
				tokenResponse(),
				httpErrorWithBody(422, JSON.stringify({ message: 'The sku has already been taken.' })),
			],
		});

		await assert.rejects(unopimApiRequest.call(context, 'POST', '/products', { sku: 'dup' }), {
			message: 'The sku has already been taken.',
		});
	});

	it('keeps the generic message when UnoPim gave none', async () => {
		const context = fakeContext({ responses: [tokenResponse(), httpErrorWithBody(422, {})] });

		await assert.rejects(unopimApiRequest.call(context, 'POST', '/products', { sku: '' }), {
			message: 'Your request is invalid or could not be processed by the service',
		});
	});

	it('still reports a missing connector on a platform 404 that carries a message', async () => {
		const context = fakeContext({
			responses: [tokenResponse(), httpErrorWithBody(404, { message: 'Not Found' })],
		});

		await assert.rejects(unopimApiRequest.call(context, 'GET', '/n8n/subscriptions'), {
			message: INTEGRATION_NOT_INSTALLED,
		});
	});

	it('does not retry a failure that is not an authentication problem', async () => {
		const context = fakeContext({ responses: [tokenResponse(), httpError(422)] });

		await assert.rejects(unopimApiRequest.call(context, 'POST', '/products', { sku: '' }));

		assert.equal(context.calls.length, 2);
	});
});

describe('pagination', () => {
	it('asks for keyset pages rather than offsets when returning everything', async () => {
		const context = fakeContext({ responses: [tokenResponse(), page(1, 1)] });

		await unopimApiRequestAllItems.call(context, '/products');

		assert.equal(context.calls[1].qs?.pagination_type, 'search_after');
		assert.equal(context.calls[1].qs?.limit, MAX_PAGE_SIZE);
	});

	it('walks every page until a short one arrives', async () => {
		const context = fakeContext({
			responses: [tokenResponse(), page(MAX_PAGE_SIZE, 1), page(4, 101)],
		});

		const items = await unopimApiRequestAllItems.call(context, '/products');

		assert.equal(items.length, MAX_PAGE_SIZE + 4);
	});

	it('carries the last id forward as the cursor', async () => {
		const context = fakeContext({
			responses: [tokenResponse(), page(MAX_PAGE_SIZE, 1), page(0, 0)],
		});

		await unopimApiRequestAllItems.call(context, '/products');

		assert.equal(context.calls[2].qs?.search_after, MAX_PAGE_SIZE);
	});

	it('follows the cursor the server returns, because UnoPim rows carry no id', async () => {
		const rows = (size: number) => Array.from({ length: size }, (_, index) => ({ code: `c${index}` }));
		const context = fakeContext({
			responses: [
				tokenResponse(),
				{ data: rows(MAX_PAGE_SIZE), search_after: 554 },
				{ data: rows(MAX_PAGE_SIZE), search_after: 812 },
				{ data: rows(12), search_after: null },
			],
		});

		const items = await unopimApiRequestAllItems.call(context, '/locales');

		assert.equal(items.length, MAX_PAGE_SIZE * 2 + 12);
		assert.equal(context.calls.length, 4);
		assert.equal(context.calls[3].qs?.search_after, 812);
	});

	it('stops when the server hands back the cursor it was given', async () => {
		const context = fakeContext({
			responses: [
				tokenResponse(),
				{ data: page(MAX_PAGE_SIZE, 1).data, search_after: 7 },
				{ data: page(MAX_PAGE_SIZE, 1).data, search_after: 7 },
			],
		});

		const items = await unopimApiRequestAllItems.call(context, '/products');

		assert.equal(items.length, MAX_PAGE_SIZE * 2);
		assert.equal(context.calls.length, 3);
	});

	it('stops at the requested limit', async () => {
		const context = fakeContext({
			responses: [tokenResponse(), { data: page(10, 1).data, last_page: 5 }],
		});

		const items = await unopimApiRequestLimited.call(context, '/products', 3);

		assert.equal(items.length, 3);
	});

	it('never asks for more than a page holds', async () => {
		const context = fakeContext({
			responses: [tokenResponse(), { data: page(MAX_PAGE_SIZE, 1).data, last_page: 1 }],
		});

		await unopimApiRequestLimited.call(context, '/products', 500);

		assert.equal(context.calls[1].qs?.limit, MAX_PAGE_SIZE);
	});

	it('stops when the last page is reached', async () => {
		const context = fakeContext({
			responses: [tokenResponse(), { data: page(2, 1).data, last_page: 1 }],
		});

		const items = await unopimApiRequestLimited.call(context, '/products', 50);

		assert.equal(items.length, 2);
		assert.equal(context.calls.length, 2);
	});

	it('passes the caller filters through', async () => {
		const context = fakeContext({
			responses: [tokenResponse(), { data: [], last_page: 1 }],
		});

		await unopimApiRequestLimited.call(context, '/products', 10, { sort: 'updated_at' });

		assert.equal(context.calls[1].qs?.sort, 'updated_at');
	});
});
