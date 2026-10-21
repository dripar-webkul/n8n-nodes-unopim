/* eslint-disable @n8n/community-nodes/no-restricted-imports -- test files are not published; "files" limits the package to dist/ */
import { createHmac } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { IDataObject } from 'n8n-workflow';

import { isSignatureValid, UnoPimTrigger } from '../dist/nodes/UnoPimTrigger/UnoPimTrigger.node.js';
import { fakeContext, tokenResponse } from './support.ts';

const SECRET = 'shared-secret';
const BODY = JSON.stringify({ sku: 'SKU-1', event: 'product.updated' });

function sign(body: string, secret: string): string {
	return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('isSignatureValid', () => {
	it('accepts a signature made with the same secret', () => {
		assert.equal(isSignatureValid(BODY, SECRET, sign(BODY, SECRET)), true);
	});

	it('rejects a signature made with a different secret', () => {
		assert.equal(isSignatureValid(BODY, SECRET, sign(BODY, 'other-secret')), false);
	});

	it('rejects a signature over a different body', () => {
		assert.equal(isSignatureValid(BODY, SECRET, sign('{"sku":"SKU-2"}', SECRET)), false);
	});

	it('rejects a missing signature', () => {
		assert.equal(isSignatureValid(BODY, SECRET, undefined), false);
	});

	it('rejects an empty signature', () => {
		assert.equal(isSignatureValid(BODY, SECRET, ''), false);
	});

	it('rejects a signature without the algorithm prefix', () => {
		const bare = createHmac('sha256', SECRET).update(BODY).digest('hex');

		assert.equal(isSignatureValid(BODY, SECRET, bare), false);
	});

	it('rejects a truncated signature without throwing', () => {
		assert.equal(isSignatureValid(BODY, SECRET, 'sha256=abc'), false);
	});

	it('rejects a signature of the right length but wrong bytes', () => {
		const valid = sign(BODY, SECRET);
		const tampered = valid.slice(0, -1) + (valid.endsWith('a') ? 'b' : 'a');

		assert.equal(isSignatureValid(BODY, SECRET, tampered), false);
	});
});

describe('checkExists', () => {
	const WEBHOOK_URL = 'https://n8n.example.com/webhook/abc/webhook';

	function hookContext(subscriptions: IDataObject[]) {
		const context = fakeContext({
			responses: [tokenResponse(), { data: subscriptions }],
		});
		const staticData: IDataObject = { subscriptionId: 7 };

		return {
			context,
			staticData,
			hook: {
				...context,
				getNodeWebhookUrl: () => WEBHOOK_URL,
				getWorkflowStaticData: () => staticData,
			},
		};
	}

	const checkExists = new UnoPimTrigger().webhookMethods.default.checkExists;

	it('reports an active subscription for this webhook as registered', async () => {
		const { hook, staticData } = hookContext([{ id: 9, target_url: WEBHOOK_URL, is_active: true }]);

		assert.equal(await checkExists.call(hook as never), true);
		assert.equal(staticData.subscriptionId, 9);
	});

	it('reports a subscription switched off by failed deliveries as missing so it is registered again', async () => {
		const { hook, staticData } = hookContext([{ id: 9, target_url: WEBHOOK_URL, is_active: false }]);

		assert.equal(await checkExists.call(hook as never), false);
		assert.equal(staticData.subscriptionId, undefined);
	});

	it('asks for a full page so a key with many subscriptions still finds its own', async () => {
		const { hook, context } = hookContext([]);

		await checkExists.call(hook as never);

		assert.equal(context.calls.at(-1)?.qs?.limit, 100);
	});
});

describe('webhook', () => {
	const BODY_DATA = { sku: 'SKU-1' };

	function webhookContext(secret: string | undefined, signature?: string) {
		const response: { statusCode?: number; payload?: unknown } = {};

		const res = {
			status(code: number) {
				response.statusCode = code;

				return res;
			},
			json(payload: unknown) {
				response.payload = payload;

				return res;
			},
		};

		return {
			response,
			context: {
				getNodeParameter: () => (secret === undefined ? {} : { secret }),
				getBodyData: () => BODY_DATA,
				getHeaderData: () => (signature === undefined ? {} : { 'x-unopim-signature': signature }),
				getResponseObject: () => res,
				getNode: () => ({ name: 'UnoPim Trigger' }),
				helpers: { returnJsonArray: (data: IDataObject) => [{ json: data }] },
			},
		};
	}

	const webhook = new UnoPimTrigger().webhook;

	it('answers 401 without starting the workflow when the signature does not match', async () => {
		const { context, response } = webhookContext(SECRET, sign(JSON.stringify(BODY_DATA), 'other-secret'));

		const result = await webhook.call(context as never);

		assert.deepEqual(result, { noWebhookResponse: true });
		assert.equal(response.statusCode, 401);
		assert.deepEqual(response.payload, { message: 'Invalid signature' });
	});

	it('answers 401 when a signing secret is set but the delivery is unsigned', async () => {
		const { context, response } = webhookContext(SECRET);

		const result = await webhook.call(context as never);

		assert.equal(result.workflowData, undefined);
		assert.equal(response.statusCode, 401);
	});

	it('starts the workflow when the signature matches', async () => {
		const { context, response } = webhookContext(SECRET, sign(JSON.stringify(BODY_DATA), SECRET));

		const result = await webhook.call(context as never);

		assert.deepEqual(result.workflowData, [[{ json: BODY_DATA }]]);
		assert.equal(response.statusCode, undefined);
	});

	it('starts the workflow without checking when no secret is set', async () => {
		const { context } = webhookContext(undefined);

		const result = await webhook.call(context as never);

		assert.deepEqual(result.workflowData, [[{ json: BODY_DATA }]]);
	});
});
