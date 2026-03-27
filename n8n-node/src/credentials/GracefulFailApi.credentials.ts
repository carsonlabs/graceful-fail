import {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GracefulFailApi implements ICredentialType {
	name = 'gracefulFailApi';
	displayName = 'Graceful Fail API';
	documentationUrl = 'https://selfheal.dev/docs';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: 'gf_...',
			description: 'Your Graceful Fail API key. Get one at selfheal.dev.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};
}
