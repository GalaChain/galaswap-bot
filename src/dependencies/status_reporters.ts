import assert from 'assert';
import BigNumber from 'bignumber.js';
import locko from 'locko';
import pRetry from 'p-retry';
import util from 'util';
import { ISwapToAccept, ISwapToTerminate } from '../strategies/swap_strategy.js';
import { areSameTokenClass } from '../types/type_helpers.js';
import {
  getActualSwapRate,
  getCurrentMarketRate,
  getSwapGoodnessRate,
} from '../utils/get_current_market_rate.js';
import { IGalaSwapToken, IRawSwap } from './galaswap/types.js';

const sleep = util.promisify(setTimeout);

function getRateDescription(rate: number) {
  const asPercent = rate * 100;
  if (asPercent >= 100) {
    return `${(asPercent - 100).toFixed(2)}% better than market rate`;
  } else {
    return `${(100 - asPercent).toFixed(2)}% worse than market rate`;
  }
}

function getQuantum(offeredOrWanted: readonly [{ quantity: string }]) {
  return offeredOrWanted[0].quantity;
}

function getQuantity(quantum: string, uses: string) {
  return new BigNumber(quantum).multipliedBy(uses).toFixed();
}

function getSwapDetails(
  galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
  swap: Readonly<
    Pick<IRawSwap, 'wanted' | 'offered' | 'uses' | 'usesSpent'> &
      Partial<Pick<IRawSwap, 'swapRequestId'>>
  >,
) {
  const wantedTokenValue = galaSwapTokens.find((t) =>
    areSameTokenClass(t, swap.wanted[0].tokenInstance),
  );
  const offeredTokenValue = galaSwapTokens.find((t) =>
    areSameTokenClass(t, swap.offered[0].tokenInstance),
  );

  assert(wantedTokenValue, 'Wanted token value not found');
  assert(offeredTokenValue, 'Offered token value not found');

  const wantedQuantum = getQuantum(swap.wanted);
  const offeringQuantum = getQuantum(swap.offered);
  const totalWantedQuantity = getQuantity(wantedQuantum, swap.uses);
  const totalOfferingQuantity = getQuantity(offeringQuantum, swap.uses);

  const wantedQuantityRemaining = BigNumber(wantedQuantum)
    .multipliedBy(BigNumber(swap.uses).minus(swap.usesSpent))
    .toFixed();

  const offeringQuantityRemaining = BigNumber(offeringQuantum)
    .multipliedBy(BigNumber(swap.uses).minus(swap.usesSpent))
    .toFixed();

  return {
    wantedSymbol: wantedTokenValue.symbol,
    offeringSymbol: offeredTokenValue.symbol,
    totalWantedQuantity,
    totalOfferingQuantity,
    wantedQuantityRemaining,
    offeringQuantityRemaining,
    cleanId: swap.swapRequestId?.replaceAll('\u0000', '\\u0000'),
  };
}

function diffSwaps(
  galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
  before: Parameters<typeof getSwapDetails>[1],
  after: Parameters<typeof getSwapDetails>[1],
) {
  const beforeDetails = getSwapDetails(galaSwapTokens, before);
  const afterDetails = getSwapDetails(galaSwapTokens, after);

  const remainingOfferedQuantityDifference = BigNumber(
    beforeDetails.offeringQuantityRemaining,
  ).minus(afterDetails.offeringQuantityRemaining);

  const remainingWantedQuantityDifference = BigNumber(beforeDetails.wantedQuantityRemaining).minus(
    afterDetails.wantedQuantityRemaining,
  );

  return {
    remainingOfferedQuantityDifference,
    remainingWantedQuantityDifference,
  };
}

export interface IStatusReporter {
  reportAcceptingSwap(
    galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
    swapToAccept: Readonly<ISwapToAccept>,
  ): Promise<void>;
  reportTerminatingSwap(
    galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
    swap: Readonly<ISwapToTerminate>,
  ): Promise<void>;
  sendCreatedSwapAcceptedMessage(
    galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
    swapStateBefore: Readonly<IRawSwap>,
    swapStateAfter: Readonly<IRawSwap>,
  ): Promise<void>;
  reportCreatingSwap(
    galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
    swap: Pick<IRawSwap, 'offered' | 'wanted' | 'uses'>,
  ): Promise<void>;
  sendAlert(message: string): Promise<void>;
}

export class ConsoleStatusReporter implements IStatusReporter {
  async reportAcceptingSwap(...args: Parameters<IStatusReporter['reportAcceptingSwap']>) {
    console.log('I am Accepting a Swap', args);
  }

  async reportTerminatingSwap(...args: Parameters<IStatusReporter['reportTerminatingSwap']>) {
    console.log('I am Terminating a Swap', args);
  }

  async sendCreatedSwapAcceptedMessage(
    ...args: Parameters<IStatusReporter['sendCreatedSwapAcceptedMessage']>
  ) {
    console.log('My Swap Has Been Accepted', args);
  }

  async reportCreatingSwap(...args: Parameters<IStatusReporter['reportCreatingSwap']>) {
    console.log('I Am Creating a Swap', args);
  }

  async sendAlert(...args: Parameters<IStatusReporter['sendAlert']>) {
    console.log('ALERT:', args);
  }
}

export class SlackWebhookStatusReporter implements IStatusReporter {
  constructor(
    private readonly swapAcceptanceWebhookUri: string,
    private readonly alertWebhookUri: string,
  ) {}

  async reportAcceptingSwap(
    galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
    swapToAccept: Readonly<ISwapToAccept>,
  ) {
    const swapDetails = getSwapDetails(galaSwapTokens, swapToAccept);
    const giving = swapToAccept.wanted[0];
    const receiving = swapToAccept.offered[0];

    const givingSymbol = swapDetails.wantedSymbol;
    const receivingSymbol = swapDetails.offeringSymbol;

    const totalGivingAmount = BigNumber(giving.quantity).multipliedBy(swapToAccept.usesToAccept);

    const totalReceivingAmount = BigNumber(receiving.quantity).multipliedBy(
      swapToAccept.usesToAccept,
    );

    const actualSwapRate = getActualSwapRate(
      totalGivingAmount.toNumber(),
      totalReceivingAmount.toNumber(),
    );

    const marketRate = getCurrentMarketRate(
      giving.tokenInstance,
      receiving.tokenInstance,
      galaSwapTokens,
    );

    assert(marketRate, 'Market rate not found');

    const goodnessRate = getSwapGoodnessRate(actualSwapRate, marketRate);

    await this.fetch(this.swapAcceptanceWebhookUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text' as const,
              text: 'I am Accepting a Swap',
            },
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*Swap ID*\n${swapDetails.cleanId}`,
              },
            ],
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*I am giving*\n${totalGivingAmount} ${givingSymbol}`,
              },
              {
                type: 'mrkdwn' as const,
                text: `*I am receiving*\n${totalReceivingAmount} ${receivingSymbol}`,
              },
            ],
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*Actual Swap Rate*\n${actualSwapRate.toFixed(4)} ${receivingSymbol} per ${givingSymbol}`,
              },
              {
                type: 'mrkdwn' as const,
                text: `*Fair Market Rate*\n${marketRate.toFixed(4)} ${receivingSymbol} per ${givingSymbol}`,
              },
            ],
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*Swap Rate Compared to Fair Market*\n${getRateDescription(goodnessRate)}`,
              },
            ],
          },
        ].filter(Boolean),
      }),
    });
  }

  async reportTerminatingSwap(
    galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
    swap: Readonly<ISwapToTerminate>,
  ) {
    const swapDetails = getSwapDetails(galaSwapTokens, swap);
    const givingQuantity = swapDetails.totalOfferingQuantity;
    const receivingQuantity = swapDetails.totalWantedQuantity;

    await this.fetch(this.swapAcceptanceWebhookUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text' as const,
              text: 'I am Terminating a Swap',
            },
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*Swap ID*\n${swap.swapRequestId.replaceAll('\u0000', '\\u0000')}`,
              },
              {
                type: 'mrkdwn' as const,
                text: `*Termination reason*\n${swap.terminationReason ?? 'None provided'}`,
              },
            ],
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*I was offering (total)*\n${givingQuantity} ${swapDetails.offeringSymbol}`,
              },
              {
                type: 'mrkdwn' as const,
                text: `*I was asking for (total)*\n${receivingQuantity} ${swapDetails.wantedSymbol}`,
              },
            ],
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*Remaining amount I was offering*\n${swapDetails.offeringQuantityRemaining} ${swapDetails.offeringSymbol}`,
              },
              {
                type: 'mrkdwn' as const,
                text: `*Remaining amount I was asking for*\n${swapDetails.wantedQuantityRemaining} ${swapDetails.wantedSymbol}`,
              },
            ],
          },
        ].filter(Boolean),
      }),
    });
  }

  async sendCreatedSwapAcceptedMessage(
    galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
    swapStateBefore: Readonly<IRawSwap>,
    swapStateAfter: Readonly<IRawSwap>,
  ) {
    const swapDetailsBefore = getSwapDetails(galaSwapTokens, swapStateBefore);
    const swapDetailsAfter = getSwapDetails(galaSwapTokens, swapStateAfter);
    const diff = diffSwaps(galaSwapTokens, swapStateBefore, swapStateAfter);

    await this.fetch(this.swapAcceptanceWebhookUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text' as const,
              text: 'My Swap Has Been Accepted',
            },
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*Swap ID*\n${swapDetailsBefore.cleanId}`,
              },
            ],
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*I gave*\n${diff.remainingOfferedQuantityDifference} ${swapDetailsBefore.offeringSymbol}`,
              },
              {
                type: 'mrkdwn' as const,
                text: `*I received*\n${diff.remainingWantedQuantityDifference} ${swapDetailsBefore.wantedSymbol}`,
              },
            ],
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*Remaining to give*\n${swapDetailsAfter.offeringQuantityRemaining} ${swapDetailsAfter.offeringSymbol}`,
              },
              {
                type: 'mrkdwn' as const,
                text: `*Remaining to receive*\n${swapDetailsAfter.wantedQuantityRemaining} ${swapDetailsBefore.wantedSymbol}`,
              },
            ],
          },
        ].filter(Boolean),
      }),
    });
  }

  async reportCreatingSwap(
    galaSwapTokens: readonly Readonly<IGalaSwapToken>[],
    swap: Readonly<Pick<IRawSwap, 'offered' | 'wanted' | 'uses'>>,
  ) {
    const swapDetails = getSwapDetails(galaSwapTokens, { ...swap, usesSpent: '0' });
    const givingSymbol = swapDetails.offeringSymbol;
    const receivingSymbol = swapDetails.wantedSymbol;
    const givingQuantity = swapDetails.totalOfferingQuantity;
    const receivingQuantity = swapDetails.totalWantedQuantity;

    await this.fetch(this.swapAcceptanceWebhookUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text' as const,
              text: 'I Am Creating a Swap',
            },
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*I am offering*\n${givingQuantity} ${givingSymbol}`,
              },
              {
                type: 'mrkdwn' as const,
                text: `*I am asking for*\n${receivingQuantity} ${receivingSymbol}`,
              },
            ],
          },
          {
            type: 'section' as const,
            fields: [
              {
                type: 'mrkdwn' as const,
                text: `*Total Uses*\n${swap.uses}`,
              },
            ],
          },
        ].filter(Boolean),
      }),
    });
  }

  async sendAlert(message: string) {
    await this.fetch(this.alertWebhookUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: `ALERT: ${message}`,
      }),
    });
  }

  private fetch(param1: Parameters<typeof fetch>[0], param2: Parameters<typeof fetch>[1]) {
    return locko.doWithLock('slack_webhook_sender', async () => {
      await pRetry(async () => {
        const response = await fetch(param1, param2);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch: ${response.status} ${response.statusText} ${await response.text()}`,
          );
        }

        return response;
      });

      // Since we do this in an exclusive lock, this restricts us from sending more than 1 webhook per second
      // so that we do not get impacted by rate limiting.
      await sleep(1_000);
    });
  }
}
