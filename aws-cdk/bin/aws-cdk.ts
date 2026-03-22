#!/opt/homebrew/opt/node/bin/node
import * as cdk from 'aws-cdk-lib/core';
import { BudgetStack } from '../lib/stacks/budget-stack';

const app = new cdk.App();

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'eu-west-1' };

new BudgetStack(app, 'BudgetStack', { env });
