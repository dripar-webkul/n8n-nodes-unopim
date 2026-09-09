/* eslint-disable @n8n/community-nodes/no-restricted-imports -- test files are not published; "files" limits the package to dist/ */
import { createHmac } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { isSignatureValid } from '../dist/nodes/UnoPimTrigger/UnoPimTrigger.node.js';

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
