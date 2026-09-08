/* eslint-disable @n8n/community-nodes/no-restricted-imports -- test files are not published; "files" limits the package to dist/ */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
	OPERATION_LABELS,
	RESOURCES,
	RESOURCE_OPTIONS,
	resourceByValue,
} from '../dist/nodes/UnoPim/actions/resources.js';

describe('resource catalog', () => {
	it('covers every resource the admin API exposes', () => {
		assert.equal(RESOURCES.length, 11);
	});

	it('maps each resource to a distinct endpoint', () => {
		const endpoints = RESOURCES.map((resource) => resource.endpoint);

		assert.equal(new Set(endpoints).size, endpoints.length);
	});

	it('starts every endpoint with a slash so the transport can concatenate it', () => {
		for (const resource of RESOURCES) {
			assert.ok(resource.endpoint.startsWith('/'), `${resource.value} endpoint`);
		}
	});

	it('never points at the legacy misspelled configurable prefix', () => {
		const endpoints = RESOURCES.map((resource) => resource.endpoint);

		assert.ok(!endpoints.includes('/configrable-products'));
		assert.ok(endpoints.includes('/configurable-products'));
	});

	it('keeps simple and configurable products as separate resources', () => {
		assert.equal(resourceByValue('product').endpoint, '/products');
		assert.equal(resourceByValue('configurableProduct').endpoint, '/configurable-products');
	});

	it('offers listing on every resource', () => {
		for (const resource of RESOURCES) {
			assert.ok(resource.operations.includes('getMany'), `${resource.value} getMany`);
		}
	});

	it('labels the product identifier as a SKU and the rest as a code', () => {
		assert.equal(resourceByValue('product').identifier, 'SKU');
		assert.equal(resourceByValue('category').identifier, 'Code');
	});

	it('gives every operation a label and an action', () => {
		for (const resource of RESOURCES) {
			for (const operation of resource.operations) {
				assert.ok(OPERATION_LABELS[operation]?.name, `${operation} name`);
				assert.ok(OPERATION_LABELS[operation]?.action, `${operation} action`);
			}
		}
	});

	it('exposes one dropdown option per resource', () => {
		assert.equal(RESOURCE_OPTIONS.length, RESOURCES.length);
	});

	it('throws on an unknown resource rather than returning undefined', () => {
		assert.throws(() => resourceByValue('nope'), /Unknown resource/);
	});
});
