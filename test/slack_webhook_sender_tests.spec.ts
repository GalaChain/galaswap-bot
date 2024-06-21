import { IRawSwap } from '../src/dependencies/galaswap/types.js';
import {
  DiscordStatusReporter,
  SlackWebhookStatusReporter,
} from '../src/dependencies/status_reporters.js';
import { testTokens } from './data/test_tokens.js';
import { makeAvailableSwap, makeTokenInstance } from './test_helpers.js';

const senderConfigs = [
  {
    name: 'Slack',
    webhook: process.env.TEST_SLACK_WEBHOOK,
    create: (webhook: string) => new SlackWebhookStatusReporter(webhook, webhook),
  },
  {
    name: 'Discord',
    webhook: process.env.TEST_DISCORD_WEBHOOK,
    create: (webhook: string) => new DiscordStatusReporter(webhook, webhook),
  },
];

for (const senderConfig of senderConfigs) {
  describe(`${senderConfig.name} Status Reporter Tests`, () => {
    if (!senderConfig.webhook) {
      console.log(`No ${senderConfig.name} webhook provided, skipping tests`);
      return;
    }

    const sender = senderConfig.create(senderConfig.webhook);

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
}
