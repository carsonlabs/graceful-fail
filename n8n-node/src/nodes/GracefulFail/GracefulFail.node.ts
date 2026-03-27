import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class GracefulFail implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Graceful Fail',
		name: 'gracefulFail',
		icon: 'file:gracefulFail.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["httpMethod"] + " " + $parameter["destinationUrl"]}}',
		description: 'Proxy API requests through Graceful Fail for AI-powered error recovery',
		defaults: {
			name: 'Graceful Fail',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'gracefulFailApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Destination URL',
				name: 'destinationUrl',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://api.example.com/v1/endpoint',
				description: 'The target API URL to send the request to',
			},
			{
				displayName: 'HTTP Method',
				name: 'httpMethod',
				type: 'options',
				options: [
					{ name: 'GET', value: 'GET' },
					{ name: 'POST', value: 'POST' },
					{ name: 'PUT', value: 'PUT' },
					{ name: 'PATCH', value: 'PATCH' },
					{ name: 'DELETE', value: 'DELETE' },
				],
				default: 'POST',
				description: 'HTTP method for the destination request',
			},
			{
				displayName: 'Request Body (JSON)',
				name: 'requestBody',
				type: 'json',
				default: '{}',
				description: 'JSON payload to forward to the destination API',
				displayOptions: {
					hide: {
						httpMethod: ['GET', 'DELETE'],
					},
				},
			},
			{
				displayName: 'Extra Headers',
				name: 'extraHeaders',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Header',
				description: 'Additional headers to include in the proxied request',
				options: [
					{
						name: 'header',
						displayName: 'Header',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								placeholder: 'X-Custom-Header',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
			{
				displayName: 'Auto-Retry with Fix',
				name: 'autoRetry',
				type: 'boolean',
				default: false,
				description:
					'When enabled, if Graceful Fail intercepts an error and suggests a payload fix, the node will automatically apply the suggested diff and retry once',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const destinationUrl = this.getNodeParameter('destinationUrl', i) as string;
				const httpMethod = this.getNodeParameter('httpMethod', i) as string;
				const autoRetry = this.getNodeParameter('autoRetry', i) as boolean;

				let requestBody: object = {};
				if (httpMethod !== 'GET' && httpMethod !== 'DELETE') {
					const bodyParam = this.getNodeParameter('requestBody', i, '{}') as string | object;
					requestBody = typeof bodyParam === 'string' ? JSON.parse(bodyParam) : bodyParam;
				}

				const extraHeadersParam = this.getNodeParameter('extraHeaders', i, {}) as {
					header?: Array<{ name: string; value: string }>;
				};

				const extraHeaders: Record<string, string> = {};
				if (extraHeadersParam.header) {
					for (const h of extraHeadersParam.header) {
						if (h.name) {
							extraHeaders[h.name] = h.value;
						}
					}
				}

				const result = await this.makeProxyRequest(
					destinationUrl,
					httpMethod,
					requestBody,
					extraHeaders,
				);

				// Check if Graceful Fail intercepted an error
				if (result.graceful_fail_intercepted === true) {
					// If auto-retry is enabled and there's a suggested payload diff, retry
					if (autoRetry && result.error_analysis?.suggested_payload_diff) {
						const fixedBody = applyPayloadDiff(
							requestBody,
							result.error_analysis.suggested_payload_diff,
						);

						const retryResult = await this.makeProxyRequest(
							destinationUrl,
							httpMethod,
							fixedBody,
							extraHeaders,
						);

						if (retryResult.graceful_fail_intercepted === true) {
							// Retry also failed — return the retry error analysis
							returnData.push({
								json: {
									success: false,
									retried: true,
									original_error: result.error_analysis,
									retry_error: retryResult.error_analysis,
									applied_diff: result.error_analysis.suggested_payload_diff,
								},
								pairedItem: { item: i },
							});
						} else {
							// Retry succeeded
							returnData.push({
								json: {
									success: true,
									retried: true,
									applied_diff: result.error_analysis.suggested_payload_diff,
									data: retryResult,
								},
								pairedItem: { item: i },
							});
						}
					} else {
						// No auto-retry — return the error analysis
						returnData.push({
							json: {
								success: false,
								retried: false,
								graceful_fail_intercepted: true,
								error_analysis: result.error_analysis,
							},
							pairedItem: { item: i },
						});
					}
				} else {
					// Success — pass through the response
					returnData.push({
						json: {
							success: true,
							retried: false,
							data: result,
						},
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							success: false,
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}

	private async makeProxyRequest(
		this: IExecuteFunctions,
		destinationUrl: string,
		httpMethod: string,
		body: object,
		extraHeaders: Record<string, string>,
	): Promise<any> {
		const credentials = await this.getCredentials('gracefulFailApi');

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'X-Destination-URL': destinationUrl,
			'X-Destination-Method': httpMethod,
			...extraHeaders,
		};

		const options: any = {
			method: 'POST' as const,
			uri: 'https://selfheal.dev/api/proxy',
			headers,
			body,
			json: true,
		};

		// Auth is handled via the credential's authenticate config,
		// but we set it explicitly here since we're using helpers.request
		options.headers['Authorization'] = `Bearer ${credentials.apiKey}`;

		return await this.helpers.request(options);
	}
}

/**
 * Apply the suggested_payload_diff from Graceful Fail's error analysis
 * to produce a corrected request body for retry.
 */
function applyPayloadDiff(
	original: object,
	diff: { remove?: string[]; add?: Record<string, any>; modify?: Record<string, any> },
): object {
	const result: Record<string, any> = { ...original };

	// Remove fields
	if (diff.remove && Array.isArray(diff.remove)) {
		for (const key of diff.remove) {
			delete result[key];
		}
	}

	// Add new fields
	if (diff.add && typeof diff.add === 'object') {
		for (const [key, value] of Object.entries(diff.add)) {
			result[key] = value;
		}
	}

	// Modify existing fields
	if (diff.modify && typeof diff.modify === 'object') {
		for (const [key, value] of Object.entries(diff.modify)) {
			result[key] = value;
		}
	}

	return result;
}
