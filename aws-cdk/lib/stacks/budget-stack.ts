import * as cdk from 'aws-cdk-lib/core';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class BudgetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const monthlyBudgetLimit = 50;

    const alertEmail = ssm.StringParameter.valueForStringParameter(
      this, '/config/alert-email',
    );

    // SNS topic for budget alerts
    const budgetAlertTopic = new sns.Topic(this, 'BudgetAlertTopic', {
      displayName: 'Budget Alerts',
    });

    budgetAlertTopic.addSubscription(
      new subscriptions.EmailSubscription(alertEmail),
    );

    // AWS Budget: $50/month with alerts at 50%, 80%, 100%
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'MonthlySpendBudget',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: monthlyBudgetLimit,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 50,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'SNS', address: budgetAlertTopic.topicArn }],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'SNS', address: budgetAlertTopic.topicArn }],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'SNS', address: budgetAlertTopic.topicArn }],
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'SNS', address: budgetAlertTopic.topicArn }],
        },
      ],
    });

    // CloudWatch Dashboard with billing widget
    const dashboard = new cloudwatch.Dashboard(this, 'BillingDashboard', {
      dashboardName: 'CostOverview',
    });

    // Text widget with budget info + graph widget with billing metric
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: [
          '# Cost Control',
          `**Monthly Budget:** $${monthlyBudgetLimit} USD`,
          '**Alerts:** 50%, 80%, 100% of budget + forecast > 100%',
          '',
          '[View AWS Budgets Console](https://console.aws.amazon.com/billing/home#/budgets)',
        ].join('\n'),
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Estimated Charges (USD)',
        width: 18,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            dimensionsMap: { Currency: 'USD' },
            statistic: 'Maximum',
            period: cdk.Duration.hours(6),
            region: 'us-east-1',
          }),
        ],
        leftYAxis: {
          min: 0,
          max: monthlyBudgetLimit * 1.5,
          label: 'USD',
        },
        leftAnnotations: [
          {
            value: monthlyBudgetLimit,
            label: `Budget Limit ($${monthlyBudgetLimit})`,
            color: '#d62728',
          },
        ],
      }),
    );
  }
}
