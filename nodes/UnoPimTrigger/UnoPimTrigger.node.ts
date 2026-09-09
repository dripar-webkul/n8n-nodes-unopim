import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import * as loadOptions from '../UnoPim/methods/loadOptions';
import { unopimApiRequest } from '../UnoPim/transport';

interface Subscription extends IDataObject {
	id: number;
	target_url: string;
}

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool -- a trigger starts a workflow; an agent cannot call it as a tool
export class UnoPimTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'UnoPim Trigger',
		name: 'unoPimTrigger',
		icon: 'file:unopim.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when the UnoPim catalog changes',
		defaults: {
			name: 'UnoPim Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'unoPimApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event Name or ID',
				name: 'event',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getEvents',
				},
				default: 'product.updated',
				required: true,
				description:
					'Catalog change to listen for. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Channel Name or ID',
						name: 'channel',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getChannels',
						},
						default: '',
						description:
							'Deliver only the values scoped to this channel. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Flatten Values',
						name: 'flatten',
						type: 'boolean',
						default: false,
						description:
							'Whether to collapse the attribute value scopes onto one level, producing keys such as price__default__en_US. Leave off to keep the values nested, which expressions can walk directly.',
					},
					{
						displayName: 'Locale Name or ID',
						name: 'locale',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getLocales',
						},
						default: '',
						description:
							'Deliver only the values scoped to this locale. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Signing Secret',
						name: 'secret',
						type: 'string',
						typeOptions: { password: true },
						default: '',
						description:
							'Shared secret UnoPim signs each delivery with. When set, a delivery whose signature does not match is rejected.',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			getEvents: loadOptions.getEvents as (
				this: ILoadOptionsFunctions,
			) => Promise<INodePropertyOptions[]>,
			getLocales: loadOptions.getLocales,
			getChannels: loadOptions.getChannels,
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node');

				const response = await unopimApiRequest.call(this, 'GET', '/n8n/subscriptions');

				const subscriptions = (response.data as Subscription[]) ?? [];

				const match = subscriptions.find(
					(subscription) => subscription.target_url === webhookUrl,
				);

				if (!match) {
					delete staticData.subscriptionId;

					return false;
				}

				staticData.subscriptionId = match.id;

				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node');

				const options = this.getNodeParameter('options', {}) as IDataObject;

				const body: IDataObject = {
					event: this.getNodeParameter('event') as string,
					target_url: webhookUrl,
					workflow_id: this.getWorkflow().id,
					node_id: this.getNode().name,
				};

				for (const key of ['locale', 'channel', 'secret'] as const) {
					if (options[key]) {
						body[key] = options[key];
					}
				}

				if (options.flatten) {
					body.flatten = true;
				}

				const subscription = await unopimApiRequest.call(
					this,
					'POST',
					'/n8n/subscriptions',
					body,
				);

				if (subscription.id === undefined) {
					return false;
				}

				staticData.subscriptionId = subscription.id;

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');

				if (staticData.subscriptionId === undefined) {
					return true;
				}

				try {
					await unopimApiRequest.call(
						this,
						'DELETE',
						`/n8n/subscriptions/${staticData.subscriptionId}`,
					);
				} catch {
					return false;
				}

				delete staticData.subscriptionId;

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const options = this.getNodeParameter('options', {}) as IDataObject;

		const body = this.getBodyData() as IDataObject;

		const secret = options.secret as string | undefined;

		if (secret) {
			const signature = this.getHeaderData()['x-unopim-signature'] as string | undefined;

			if (!isSignatureValid(JSON.stringify(body), secret, signature)) {
				throw new NodeOperationError(
					this.getNode(),
					'The delivery signature did not match the signing secret. Check that the same secret is set on both sides.',
				);
			}
		}

		return {
			workflowData: [this.helpers.returnJsonArray(body)],
		};
	}
}

export function isSignatureValid(
	body: string,
	secret: string,
	signature?: string,
): boolean {
	if (!signature) {
		return false;
	}

	const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

	const received = Buffer.from(signature);
	const computed = Buffer.from(expected);

	return received.length === computed.length && timingSafeEqual(received, computed);
}
