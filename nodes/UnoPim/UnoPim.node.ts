import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	OPERATION_LABELS,
	RESOURCE_OPTIONS,
	RESOURCES,
	resourceByValue,
	type OperationKey,
} from './actions/resources';
import * as loadOptions from './methods/loadOptions';
import {
	unopimApiRequest,
	unopimApiRequestAllItems,
	unopimApiRequestLimited,
} from './transport';

const OPERATIONS_NEEDING_IDENTIFIER: OperationKey[] = ['get', 'update', 'patch', 'delete'];
const OPERATIONS_NEEDING_BODY: OperationKey[] = ['create', 'update', 'patch'];

function operationProperty(): INodeProperties[] {
	return RESOURCES.map((resource) => ({
		displayName: 'Operation',
		name: 'operation',
		type: 'options' as const,
		noDataExpression: true,
		displayOptions: {
			show: { resource: [resource.value] },
		},
		options: resource.operations.map((operation) => ({
			name: OPERATION_LABELS[operation].name,
			value: operation,
			action: `${OPERATION_LABELS[operation].action} in ${resource.name.toLowerCase()}`,
		})),
		default: resource.operations[0],
	}));
}

function identifierProperty(): INodeProperties[] {
	return RESOURCES.map((resource) => ({
		displayName: resource.identifier,
		name: 'identifier',
		type: 'string' as const,
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: [resource.value],
				operation: resource.operations.filter((operation) =>
					OPERATIONS_NEEDING_IDENTIFIER.includes(operation),
				),
			},
		},
		description: `The ${resource.identifier.toLowerCase()} of the ${resource.name.toLowerCase()} to act on`,
	}));
}

export class UnoPim implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'UnoPim',
		name: 'unoPim',
		icon: 'file:unopim.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read and write the UnoPim catalog',
		defaults: {
			name: 'UnoPim',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'unoPimApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: RESOURCE_OPTIONS,
				default: 'product',
			},

			...operationProperty(),
			...identifierProperty(),

			{
				displayName: 'Data',
				name: 'data',
				type: 'json',
				default: '{}',
				required: true,
				displayOptions: {
					show: {
						operation: OPERATIONS_NEEDING_BODY,
					},
				},
				description:
					'The record body, as UnoPim\'s API expects it. For a product this is the object carrying sku, family, status and values.',
			},

			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: { operation: ['getMany'] },
				},
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				displayOptions: {
					show: {
						operation: ['getMany'],
						returnAll: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: {
					show: { operation: ['getMany'] },
				},
				options: [
					{
						displayName: 'Filters (JSON)',
						name: 'filters',
						type: 'json',
						default: '{}',
						description:
							'UnoPim filter object, for example {"sku":[{"operator":"IN","value":["A","B"]}]}',
					},
					{
						displayName: 'Sort',
						name: 'sort',
						type: 'string',
						default: '',
						placeholder: 'updated_at',
						description: 'Column to sort by',
					},
				],
			},
		],
	};

	methods = {
		loadOptions,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		const returnData: INodeExecutionData[] = [];

		const resourceName = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as OperationKey;

		const resource = resourceByValue(resourceName);

		for (let i = 0; i < items.length; i++) {
			try {
				const rows = await runOperation.call(this, resource.endpoint, operation, i);

				returnData.push(
					...rows.map((row) => ({
						json: row,
						pairedItem: { item: i },
					})),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});

					continue;
				}

				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}

		return [returnData];
	}
}

async function runOperation(
	this: IExecuteFunctions,
	endpoint: string,
	operation: OperationKey,
	itemIndex: number,
): Promise<IDataObject[]> {
	if (operation === 'getMany') {
		return listRecords.call(this, endpoint, itemIndex);
	}

	const identifier = OPERATIONS_NEEDING_IDENTIFIER.includes(operation)
		? encodeURIComponent(this.getNodeParameter('identifier', itemIndex) as string)
		: '';

	const body = OPERATIONS_NEEDING_BODY.includes(operation)
		? parseJsonParameter.call(this, 'data', itemIndex)
		: {};

	const method: IHttpRequestMethods = {
		create: 'POST',
		update: 'PUT',
		patch: 'PATCH',
		delete: 'DELETE',
		get: 'GET',
		getMany: 'GET',
	}[operation] as IHttpRequestMethods;

	const path = operation === 'create' ? endpoint : `${endpoint}/${identifier}`;

	const response = await unopimApiRequest.call(this, method, path, body);

	return [response ?? {}];
}

async function listRecords(
	this: IExecuteFunctions,
	endpoint: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const qs: IDataObject = {};

	if (options.sort) {
		qs.sort = options.sort;
	}

	const filters = parseJsonParameter.call(this, 'options.filters', itemIndex, options.filters);

	if (Object.keys(filters).length > 0) {
		qs.filters = JSON.stringify(filters);
	}

	if (this.getNodeParameter('returnAll', itemIndex) as boolean) {
		return unopimApiRequestAllItems.call(this, endpoint, qs);
	}

	const limit = this.getNodeParameter('limit', itemIndex) as number;

	return unopimApiRequestLimited.call(this, endpoint, limit, qs);
}

function parseJsonParameter(
	this: IExecuteFunctions,
	name: string,
	itemIndex: number,
	raw?: unknown,
): IDataObject {
	const value = raw ?? this.getNodeParameter(name, itemIndex, '{}');

	if (value === undefined || value === null || value === '') {
		return {};
	}

	if (typeof value === 'object') {
		return value as IDataObject;
	}

	try {
		return JSON.parse(value as string) as IDataObject;
	} catch {
		throw new NodeOperationError(
			this.getNode(),
			`The value in "${name}" is not valid JSON. Fix the JSON, or pass an object from a previous node.`,
			{ itemIndex },
		);
	}
}
