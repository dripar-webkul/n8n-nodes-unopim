import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { unopimApiRequestAllItems } from '../transport';

async function optionsFrom(
	context: ILoadOptionsFunctions,
	endpoint: string,
	labelKey = 'code',
): Promise<INodePropertyOptions[]> {
	const rows = await unopimApiRequestAllItems.call(context, endpoint);

	return rows.map((row: IDataObject) => ({
		name: String(row[labelKey] ?? row.code ?? row.id),
		value: String(row.code ?? row.id),
	}));
}

export async function getLocales(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return optionsFrom(this, '/locales');
}

export async function getChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return optionsFrom(this, '/channels');
}

export async function getCurrencies(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return optionsFrom(this, '/currencies');
}

export async function getFamilies(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return optionsFrom(this, '/families');
}

export async function getAttributes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return optionsFrom(this, '/attributes');
}

export async function getAttributeGroups(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return optionsFrom(this, '/attribute-groups');
}

export async function getCategories(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return optionsFrom(this, '/categories');
}

export async function getEvents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const { unopimApiRequest } = await import('../transport');

	const response = await unopimApiRequest.call(this, 'GET', '/n8n/me');

	const events = (response.events as string[]) ?? [];

	return events.map((event) => ({
		name: event
			.split('.')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' '),
		value: event,
	}));
}
