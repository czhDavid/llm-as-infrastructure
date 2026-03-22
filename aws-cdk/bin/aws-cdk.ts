#!/opt/homebrew/opt/node/bin/node
import * as cdk from 'aws-cdk-lib/core';
import { BudgetStack } from '../lib/stacks/budget-stack';
import { BedrockDemoStack } from '../lib/stacks/bedrock-demo-stack';
import { BedrockGuardrailsDemoStack } from '../lib/stacks/bedrock-guardrails-demo-stack';
import { BedrockAgentDemoStack } from '../lib/stacks/bedrock-agent-demo-stack';

const app = new cdk.App();

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'eu-west-1' };

new BudgetStack(app, 'BudgetStack', { env });
new BedrockDemoStack(app, 'BedrockDemoStack', { env });

new BedrockGuardrailsDemoStack(app, 'BedrockGuardrailsDemoStack', { env });
new BedrockAgentDemoStack(app, 'BedrockAgentDemoStack', { env });
