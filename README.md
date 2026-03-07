# n8n-nodes-mcp-client-for-slack

This is an n8n community node. It lets you use [Slack MCP Server](https://docs.slack.dev/ai/slack-mcp-server/) on n8n AI Agent nodes.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Credentials

See: https://docs.n8n.io/integrations/builtin/credentials/slack/#using-oauth2

Please refer to the `SCOPES` in `credentials/McpForSlackOAuth2Api.credentials.ts` for the required scopes of this node. Please make those scopes available in the Slack App you created.

## Compatibility

Tested with n8n version: 2.10.3, and Google Gemini Chat Model.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

MIT License