/* eslint-disable @n8n/community-nodes/no-restricted-imports -- test files are not published; "files" limits the package to dist/ */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { normaliseBaseUrl } from '../dist/credentials/UnoPimApi.credentials.js';

describe('normaliseBaseUrl', () => {
	it('keeps a clean url unchanged', () => {
		assert.equal(normaliseBaseUrl('https://demo.unopim.com'), 'https://demo.unopim.com');
	});

	it('strips a trailing slash so the path never doubles up', () => {
		assert.equal(normaliseBaseUrl('https://demo.unopim.com/'), 'https://demo.unopim.com');
	});

	it('strips several trailing slashes', () => {
		assert.equal(normaliseBaseUrl('https://demo.unopim.com///'), 'https://demo.unopim.com');
	});

	it('trims surrounding whitespace', () => {
		assert.equal(normaliseBaseUrl('  https://demo.unopim.com  '), 'https://demo.unopim.com');
	});

	it('accepts a sub-path installation', () => {
		assert.equal(
			normaliseBaseUrl('https://demo.unopim.com/pim/public/'),
			'https://demo.unopim.com/pim/public',
		);
	});

	it('rejects a url without a scheme', () => {
		assert.throws(() => normaliseBaseUrl('demo.unopim.com'), /must start with/);
	});

	it('rejects credentials embedded in the url', () => {
		assert.throws(
			() => normaliseBaseUrl('https://user:pass@demo.unopim.com'),
			/Remove the username and password/,
		);
	});

	it('rejects a query string', () => {
		assert.throws(
			() => normaliseBaseUrl('https://demo.unopim.com?token=1'),
			/must not contain a query string/,
		);
	});

	it('rejects a fragment', () => {
		assert.throws(
			() => normaliseBaseUrl('https://demo.unopim.com#section'),
			/must not contain a query string/,
		);
	});

	it('rejects a url that points at the admin panel instead of the application root', () => {
		assert.throws(
			() => normaliseBaseUrl('https://demo.unopim.com/admin'),
			/Remove "\/admin"/,
		);
	});

	it('rejects the admin panel url even with a trailing slash', () => {
		assert.throws(
			() => normaliseBaseUrl('https://demo.unopim.com/admin/'),
			/Remove "\/admin"/,
		);
	});

	it('names the corrected url in the message so it can be pasted back', () => {
		assert.throws(
			() => normaliseBaseUrl('https://demo.unopim.com/public/admin'),
			/https:\/\/demo\.unopim\.com\/public/,
		);
	});

	it('keeps a path that merely contains the word admin', () => {
		assert.equal(
			normaliseBaseUrl('https://demo.unopim.com/administrator'),
			'https://demo.unopim.com/administrator',
		);
	});

	it('rejects an empty value', () => {
		assert.throws(() => normaliseBaseUrl(''), /must start with/);
	});
});
