import type { ICredentialType, INodeProperties } from 'n8n-workflow';

// see: https://mcp.slack.com/.well-known/oauth-authorization-server
const SCOPES = [
	'search:read.public',
	'search:read.private',
	'search:read.mpim',
	'search:read.im',
	'search:read.files',
	'search:read.users',
	'chat:write',
	'channels:history',
	'groups:history',
	'mpim:history',
	'im:history',
	'canvases:read',
	'canvases:write',
	'users:read',
	'users:read.email',
];

// based: https://github.com/n8n-io/n8n/blob/34af844c95f84179e66dacb205e15c9e8d0f7986/packages/nodes-base/credentials/SlackOAuth2Api.credentials.ts
export class McpForSlackOAuth2Api implements ICredentialType {
	name = 'mcpForSlackOAuth2Api';
	extends = ['oAuth2Api'];
	icon = { light: 'file:example.svg', dark: 'file:example.dark.svg' } as const;
	displayName = 'MCP for Slack OAuth2 API';
	documentationUrl = 'https://docs.slack.dev/ai/slack-mcp-server/';
	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://slack.com/oauth/v2_user/authorize',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://slack.com/api/oauth.v2.user.access',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			// for fallback default bot scope, if this field is empty, it will fail with "invalid_scope" error
			default: undefined,
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			// TODO: support dynamic scopes in the future for restricted scopes
			default: `user_scope=${SCOPES.join(' ')}`,
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];
}
