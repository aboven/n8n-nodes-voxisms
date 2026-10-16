import type { INodeCredentialDescription, INodeProperties } from 'n8n-workflow';

// Version 1 always uses the legacy phone-number credential. Version 2 lets the user pick
// either credential with the Authentication selector below, defaulting to an API key.
export const LEGACY_CREDENTIAL = 'voxiSmsApi';
export const GROUP_CREDENTIAL = 'voxiSmsGroupApi';

// Deliberately not named `authentication`: n8n's editor hides a parameter with that name
// (its "main auth field") and moves the choice into the credential dialog. A visible
// selector needs another name.
export const AUTH_METHOD = 'authMethod';

export type AuthMethod = 'apiKey' | 'legacy';

export const authMethodProperties: INodeProperties[] = [
	{
		// Version 1 has no selector. This hidden default lets the shared credential rules
		// below resolve to the legacy credential, as version 1 always did.
		displayName: 'Authentication',
		name: AUTH_METHOD,
		type: 'hidden',
		default: 'legacy',
		displayOptions: { show: { '@version': [1] } },
	},
	{
		displayName: 'Authentication',
		name: AUTH_METHOD,
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'API Key',
				value: 'apiKey',
				description: 'Connect with a phone-group API key (recommended)',
			},
			{
				name: 'Legacy Customer ID + Token',
				value: 'legacy',
				description: 'Connect with the Customer ID and Token of a single registered phone',
			},
		],
		default: 'apiKey',
		displayOptions: { show: { '@version': [2] } },
	},
];

// n8n evaluates these rules both with defaults filled in (editor, execution) and without
// them (publish validation reads saved parameters, which omit the default `apiKey` choice
// and the version 1 hidden value). Keying both rules on an explicit `legacy` value works in
// either case. The API key credential uses `hide` rather than `show: { authMethod: ['apiKey'] }`
// on purpose: once every selector option appears in credential `show` rules, n8n treats the
// selector as its main auth field and hides it from the node.
export const credentialDescriptions: INodeCredentialDescription[] = [
	{
		name: LEGACY_CREDENTIAL,
		required: true,
		displayOptions: { show: { [AUTH_METHOD]: ['legacy'] } },
	},
	{
		name: GROUP_CREDENTIAL,
		required: true,
		displayOptions: { show: { '@version': [2] }, hide: { [AUTH_METHOD]: ['legacy'] } },
	},
];

// Version 1 is always legacy; the selector is read only for version 2. Returns undefined
// for an unknown selector value so callers can fail instead of guessing.
export function resolveAuthMethod(typeVersion: number, selected: unknown): AuthMethod | undefined {
	if (typeVersion < 2) return 'legacy';
	return selected === 'apiKey' || selected === 'legacy' ? selected : undefined;
}

export const credentialFor = (method: AuthMethod): string =>
	method === 'apiKey' ? GROUP_CREDENTIAL : LEGACY_CREDENTIAL;
