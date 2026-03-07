import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type { JSONSchema7 } from 'json-schema';

// these packages are provided by n8n at runtime, so we can use them without declaring them as dependencies in package.json
import { DynamicStructuredTool } from '@langchain/core/tools';
import { jsonSchemaToZod } from '@n8n/json-schema-to-zod';
import { z } from 'zod';

const MCP_ENDPOINT = 'https://mcp.slack.com/mcp';
const MCP_PROTOCOL_VERSION = '2024-11-05';
const CREDENTIAL_TYPE = 'mcpForSlackOAuth2Api';

interface JsonRpcResponse {
	jsonrpc: string;
	id?: number;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

interface IN8nHttpFullResponse {
	body: unknown;
	headers: Record<string, string>;
	statusCode: number;
}

interface McpTool {
	name: string;
	description?: string;
	inputSchema?: JSONSchema7;
}

type McpContext = ISupplyDataFunctions | ILoadOptionsFunctions | IExecuteFunctions;

async function initializeMcpSession(context: McpContext): Promise<string | undefined> {
	const initResponse = (await context.helpers.httpRequestWithAuthentication.call(
		context,
		CREDENTIAL_TYPE,
		{
			method: 'POST',
			url: MCP_ENDPOINT,
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
			},
			body: {
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: MCP_PROTOCOL_VERSION,
					capabilities: {},
					clientInfo: { name: 'n8n-nodes-mcp-client-for-slack', version: '0.1.0' },
				},
			},
			json: true,
			returnFullResponse: true,
		} as IHttpRequestOptions,
	)) as IN8nHttpFullResponse;

	const sessionId = initResponse.headers?.['mcp-session-id'];

	await context.helpers.httpRequestWithAuthentication.call(context, CREDENTIAL_TYPE, {
		method: 'POST',
		url: MCP_ENDPOINT,
		headers: {
			'Content-Type': 'application/json',
			...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
		},
		body: { jsonrpc: '2.0', method: 'notifications/initialized' },
		json: true,
		ignoreHttpStatusErrors: true,
	} as IHttpRequestOptions);

	return sessionId;
}

async function callMcpMethod(
	context: McpContext,
	sessionId: string | undefined,
	body: object,
): Promise<JsonRpcResponse> {
	return (await context.helpers.httpRequestWithAuthentication.call(context, CREDENTIAL_TYPE, {
		method: 'POST',
		url: MCP_ENDPOINT,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
			...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
		},
		body,
		json: true,
	} as IHttpRequestOptions)) as JsonRpcResponse;
}

async function getAllTools(context: McpContext): Promise<McpTool[]> {
	const sessionId = await initializeMcpSession(context);
	const response = await callMcpMethod(context, sessionId, {
		jsonrpc: '2.0',
		id: 2,
		method: 'tools/list',
		params: {},
	});

	if (response.error) {
		throw new NodeOperationError(context.getNode(), response.error.message);
	}

	return (response.result as { tools?: McpTool[] } | undefined)?.tools ?? [];
}

function normalizeToolCallResult(result: unknown): string {
	if (result && typeof result === 'object') {
		if ('content' in result && Array.isArray(result.content)) {
			const textParts = result.content
				.filter(
					(item): item is { type?: string; text: string } =>
						typeof item === 'object' &&
						item !== null &&
						'text' in item &&
						typeof item.text === 'string',
				)
				.map((item) => item.text);

			if (textParts.length > 0) {
				return textParts.join('\n\n');
			}

			return JSON.stringify(result.content);
		}

		if ('toolResult' in result && typeof result.toolResult === 'string') {
			return result.toolResult;
		}
	}

	return typeof result === 'string' ? result : JSON.stringify(result);
}

async function callSelectedTool(
	context: McpContext,
	toolName: string,
	argumentsInput: Record<string, unknown>,
	sessionId?: string,
): Promise<string> {
	const activeSessionId = sessionId ?? (await initializeMcpSession(context));

	const response = await callMcpMethod(context, activeSessionId, {
		jsonrpc: '2.0',
		id: 2,
		method: 'tools/call',
		params: {
			name: toolName,
			arguments: argumentsInput,
		},
	});

	if (response.error) {
		throw new NodeOperationError(
			context.getNode(),
			`Tool "${toolName}" failed: ${response.error.message}`,
		);
	}

	return normalizeToolCallResult(response.result);
}

function extractToolArguments(itemJson: IDataObject): Record<string, unknown> {
	const explicitArguments = itemJson.arguments;
	if (
		explicitArguments &&
		typeof explicitArguments === 'object' &&
		!Array.isArray(explicitArguments)
	) {
		return explicitArguments as Record<string, unknown>;
	}

	const rest = { ...itemJson };
	delete rest.tool;
	delete rest.arguments;
	delete rest.response;
	return rest;
}

async function getConfiguredTool(context: McpContext, itemIndex: number): Promise<McpTool> {
	const toolName = context.getNodeParameter('toolName', itemIndex) as string;
	const allTools = await getAllTools(context);

	if (!allTools.length) {
		throw new NodeOperationError(context.getNode(), 'Slack MCP server returned no tools');
	}

	const selectedTool = allTools.find((tool) => tool.name === toolName);
	if (!selectedTool) {
		throw new NodeOperationError(context.getNode(), `Unknown Slack MCP tool: ${toolName}`);
	}

	return selectedTool;
}

export class McpClientForSlack implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MCP Client for Slack',
		name: 'mcpClientForSlack',
		icon: { light: 'file:example.svg', dark: 'file:example.dark.svg' },
		group: ['output'],
		version: [1],
		description: 'Expose a single Slack MCP tool to an AI Agent',
		defaults: {
			name: 'MCP Client for Slack',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiTool],
		credentials: [
			{
				name: CREDENTIAL_TYPE,
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Tool Name or ID',
				name: 'toolName',
				type: 'options',
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				typeOptions: {
					loadOptionsMethod: 'getTools',
				},
				required: true,
			},
		],
	};

	methods = {
		loadOptions: {
			async getTools(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const tools = await getAllTools(this);

				return tools.map((tool) => ({
					name: tool.name,
					value: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema,
				}));
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const selectedTool = await getConfiguredTool(this, itemIndex);
		const inputSchema =
			selectedTool.inputSchema ??
			({
				type: 'object',
				properties: {},
			} satisfies JSONSchema7);
		const rawSchema = jsonSchemaToZod(inputSchema);
		const objectSchema =
			rawSchema instanceof z.ZodObject ? rawSchema : z.object({ value: rawSchema });

		// FIXME: error TS2589: Type instantiation is excessively deep and possibly infinite.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const tool = new (DynamicStructuredTool as any)({
			name: selectedTool.name,
			description: selectedTool.description ?? '',
			schema: objectSchema,
			verboseParsingErrors: true,
			func: async (input: Record<string, unknown>) =>
				await callSelectedTool(this, selectedTool.name, input),
		});

		return {
			response: tool,
		};
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const selectedTool = await getConfiguredTool(this, itemIndex);
				const item = items[itemIndex];
				const sessionId = await initializeMcpSession(this);

				const responseText = await callSelectedTool(
					this,
					selectedTool.name,
					extractToolArguments(item.json),
					sessionId,
				);

				returnData.push({
					json: {
						response: responseText,
					},
					pairedItem: {
						item: itemIndex,
					},
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error instanceof Error ? error.message : 'Unknown error',
						},
						pairedItem: {
							item: itemIndex,
						},
					});
					continue;
				}

				throw error instanceof NodeOperationError
					? error
					: new NodeOperationError(this.getNode(), error, { itemIndex });
			}
		}

		return [returnData];
	}
}
