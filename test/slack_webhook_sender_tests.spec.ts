import { IRawSwap } from '../src/dependencies/galaswap/types.js';
import { SlackWebhookStatusReporter } from '../src/dependencies/status_reporters.js';
import { testTokens } from './data/test_tokens.js';
import { makeAvailableSwap, makeTokenInstance } from './test_helpers.js';

describe('Slack Status Reporter Tests', () => {
  if (!process.env.TEST_SLACK_WEBHOOK) {
    return;
  }

  const sender = new SlackWebhookStatusReporter(
    process.env.TEST_SLACK_WEBHOOK,
    process.env.TEST_SLACK_WEBHOOK,
  );

  const swap = {
    swapRequestId: '1',
    uses: '10',
    usesSpent: '0',
    created: 0,
    expires: 0,
    offeredBy: 'client|someone',
    offered: [
      {
        tokenInstance: makeTokenInstance('GUSDC'),
        quantity: '100',
      },
    ] as const,
    wanted: [
      {
        tokenInstance: makeTokenInstance('GALA'),
        quantity: '1',
      },
    ] as const,
  } satisfies IRawSwap;

  it('Can send a swap acceptance message without error', async () => {
    await sender.reportAcceptingSwap(testTokens, {
      ...makeAvailableSwap(),
      usesToAccept: '1',
      goodnessRating: 1.5,
    });
  });

  it('Can send a swap termination message', async () => {
    await sender.reportTerminatingSwap(testTokens, {
      ...swap,
      terminationReason: 'Test',
    });
  });

  it('Can send a swap creation message', async () => {
    await sender.reportCreatingSwap(testTokens, swap);
  });

  it('Can send an alert message', async () => {
    await sender.sendAlert('Test');
  });

  it('Can send a created swap accepted message', async () => {
    await sender.sendCreatedSwapAcceptedMessage(testTokens, swap, {
      ...swap,
      usesSpent: '3',
    });
  });
});
