import type { INodePropertyOptions } from 'n8n-workflow';

export type OperationKey =
	| 'create'
	| 'delete'
	| 'get'
	| 'getMany'
	| 'patch'
	| 'update';

export interface ResourceDefinition {
	value: string;
	name: string;
	description: string;
	endpoint: string;
	operations: OperationKey[];
	identifier: string;
}

export const RESOURCES: ResourceDefinition[] = [
	{
		value: 'product',
		name: 'Product',
		description: 'A simple product',
		endpoint: '/products',
		operations: ['getMany', 'get', 'create', 'update', 'patch', 'delete'],
		identifier: 'SKU',
	},
	{
		value: 'configurableProduct',
		name: 'Configurable Product',
		description: 'A product with variants',
		endpoint: '/configurable-products',
		operations: ['getMany', 'get', 'create', 'update', 'patch', 'delete'],
		identifier: 'Code',
	},
	{
		value: 'category',
		name: 'Category',
		description: 'A catalog category',
		endpoint: '/categories',
		operations: ['getMany', 'get', 'create', 'update', 'patch', 'delete'],
		identifier: 'Code',
	},
	{
		value: 'attribute',
		name: 'Attribute',
		description: 'A product attribute',
		endpoint: '/attributes',
		operations: ['getMany', 'get', 'create', 'update', 'patch', 'delete'],
		identifier: 'Code',
	},
	{
		value: 'attributeGroup',
		name: 'Attribute Group',
		description: 'A grouping of attributes',
		endpoint: '/attribute-groups',
		operations: ['getMany', 'get', 'create', 'update', 'patch', 'delete'],
		identifier: 'Code',
	},
	{
		value: 'family',
		name: 'Attribute Family',
		description: 'An attribute family',
		endpoint: '/families',
		operations: ['getMany', 'get', 'create', 'update', 'patch', 'delete'],
		identifier: 'Code',
	},
	{
		value: 'categoryField',
		name: 'Category Field',
		description: 'A field on the category form',
		endpoint: '/category-fields',
		operations: ['getMany', 'get', 'create', 'update', 'patch', 'delete'],
		identifier: 'Code',
	},
	{
		value: 'associationType',
		name: 'Association Type',
		description: 'A product association type',
		endpoint: '/association-types',
		operations: ['getMany', 'get', 'create', 'update', 'patch', 'delete'],
		identifier: 'Code',
	},
	{
		value: 'locale',
		name: 'Locale',
		description: 'An enabled locale',
		endpoint: '/locales',
		operations: ['getMany', 'get', 'create', 'update', 'delete'],
		identifier: 'Code',
	},
	{
		value: 'channel',
		name: 'Channel',
		description: 'A sales channel',
		endpoint: '/channels',
		operations: ['getMany', 'get', 'create', 'update', 'delete'],
		identifier: 'Code',
	},
	{
		value: 'currency',
		name: 'Currency',
		description: 'An enabled currency',
		endpoint: '/currencies',
		operations: ['getMany', 'get', 'create', 'update', 'delete'],
		identifier: 'Code',
	},
];

export const RESOURCE_OPTIONS: INodePropertyOptions[] = RESOURCES.map((resource) => ({
	name: resource.name,
	value: resource.value,
	description: resource.description,
}));

export const OPERATION_LABELS: Record<OperationKey, { name: string; action: string }> = {
	getMany: { name: 'Get Many', action: 'Get many records' },
	get: { name: 'Get', action: 'Get a record' },
	create: { name: 'Create', action: 'Create a record' },
	update: { name: 'Update', action: 'Replace a record' },
	patch: { name: 'Update Partially', action: 'Update part of a record' },
	delete: { name: 'Delete', action: 'Delete a record' },
};

export function resourceByValue(value: string): ResourceDefinition {
	const resource = RESOURCES.find((candidate) => candidate.value === value);

	if (!resource) {
		throw new Error(`Unknown resource "${value}"`);
	}

	return resource;
}
