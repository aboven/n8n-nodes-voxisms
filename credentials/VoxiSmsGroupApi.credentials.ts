import type {
	IAuthenticate,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import { restrictToVoxiSmsApi } from '../nodes/shared/restrictRequest';
import { STATUS_PATH } from '../nodes/shared/signing';

const BASE_URL = 'https://api.voxisms.com/v2';

// Phone-group API key used by version 2 of the nodes.
export class VoxiSmsGroupApi implements ICredentialType {
	name = 'voxiSmsGroupApi';

	displayName = 'VoxiSMS API';

	icon: Icon = { light: 'file:../nodes/VoxiSms/voxisms.svg', dark: 'file:../nodes/VoxiSms/voxisms.dark.svg' };

	// API access is managed inside the phone-group cards.
	documentationUrl = 'https://app.voxiplan.com/voxisms';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Create an API key under API access in your phone group',
		},
	];

	authenticate: IAuthenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		restrictToVoxiSmsApi(requestOptions);
		const apiKey = String(credentials.apiKey ?? '').trim();
		if (!apiKey) {
			throw new Error('Enter a phone-group API key');
		}

		requestOptions.headers = { ...requestOptions.headers, Authorization: `Bearer ${apiKey}` };
		return requestOptions;
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: BASE_URL,
			url: STATUS_PATH,
			method: 'GET',
		},
	};
}
