# GalaSwap Trading Bot

This is an example of a trading bot that uses the GalaSwap API to trade on the GalaSwap exchange.

It comes with two built-in trading strategies:

1. Basic Swap Accepter: Identifies and accepts swaps that are being offered at a rate better than the current going market rate (based on prices from GalaSwap, which typically come from CoinGecko).
2. Basic Swap Creator: Offers liquidity by creating swaps at a specified rate. Cancels and recreates swaps when the market rates change sufficiently.

## Getting the Code

`git clone https://github.com/GalaChain/galaswap-bot.git`

## Installation

You must have [Docker](https://www.docker.com/get-started/) installed if you wish to run the bot in Docker (which is the easiest way to get started).

It's also recommended to have a Discord server and create two `Webhooks` inside of it. The bot will use one for sending trade notifications and the other for sending error notifications. If you omit these, the bot will output these notifications to the console instead. You can also use Slack webhooks if you prefer.

If you are going to develop and modify the bot, you should have [Node.js](https://nodejs.org/en/download) installed. Check the [.nvmrc](./.nvmrc) file for the recommended version. At the time of this writing, you should use the latest Node v20.x.x release. Run `npm install` in this directory to install the needed Node.js dependencies.

## Configuration

First create a `.env` file in the root directory of this project. This is where secret values will be stored. Enter the following, adding in your own values after the `=` signs:

```
MONGO_PASSWORD=a password for the database instance (this can be any password you want, if you're using Docker, but it should only include letters and numbers)
GALA_WALLET_ADDRESS=your GalaChain wallet address (see the "Getting your Private Key" section at https://galaswap.gala.com/info/api.html)
GALA_PRIVATE_KEY=the GalaChain private key of your Gala account (see the "Getting your Private Key" section at https://galaswap.gala.com/info/api.html)
```

Make sure not to use any special characters in `MONGO_PASSWORD`.

You may also specify additional optional variables:

```
DISCORD_WEBHOOK_URI=Your Discord Incoming Webhook URI for trade notifications
DISCORD_ALERT_WEBHOOK_URI=Your Discord Incoming Webhook URI for error notifications (defaults to the same as DISCORD_WEBHOOK_URI)
EXECUTION_DELAY_MS=A number of milliseconds to delay before accepting or creating a swap (may be useful for testing) (default: 0)
SLACK_WEBHOOK_URI=Your Slack Incoming Webhook URI for trade notifications (if you would rather use Slack than Discord)
SLACK_ALERT_WEBHOOK_URI=Your Slack Incoming Webhook URI for error notifications (if you would rather use Slack than Discord) (defaults to the same as SLACK_WEBHOOK_URI)
```

Next, if you're going to use the included strategies, you should configure them to your liking in the [./config](./config) directory. There are three files there:

1. `basic_swap_accepter.json`: This configures the conditions under which the bot will accept swaps. There are two subsections in here:
   - `tradeLimits`: This is a list of pairs that the bot will accept swaps for. For each pair you can configure:
     - `rate`: The rate that the bot will accept, compared to the market rate. For example, if GALA is currently trading at 4 cents and you configure trading GUSDC->GALA with a rate of `1.05`, the bot will accept swaps that offer at least 26.25 GALA per GUSDC. That is 5% better than the market rate (which would be 25 GALA per GUSDC).
     - `giveLimitPerReset`: The maximum amount of the `givingTokenClass` you're willing to give per reset. This is useful if you want to limit how much trading the bot is allowed to do in a given time period.
     - `resetIntervalMs`: The time period in milliseconds that the bot will wait before resetting the `giveLimitPerReset` counter. For example if this is set to `3600000` and `giveLimitPerReset` is set to `1000`, then this strategy won't spend more than `1000` of the `givingTokenClass` for accepting swaps over a one hour period.
     - `maxPriceMovementPercent`: The maximum difference between the min and max price of either of the tokens in the pair during the number of milliseconds specified in the below option (`maxPriceMovementWindowMs`). If prices move more than this much during the specified period of time, the bot will stop accepting swaps for this pair until prices become less volatile. For example a value of `0.03` allows up to 3% price movement.
     - `maxPriceMovementWindowMs`: The length of time in milliseconds that the bot will look back to calculate volatility as explained above.
     - `maxReceivingTokenPriceUSD` (optional): If the price of the receiving token goes above this number of USD, the bot will stop accepting swaps for this pair.
     - `minReceivingTokenAmount` (optional): The minimum amount of the receiving token that the bot will accept in a swap. If the bot cannot get at least this amount of the receiving token by accepting a swap, it will not accept the swap.
   - `minimumBalances`: This is a list of minimum balances that the bot will maintain. The bot will not accept any swaps that would cause its balance to go below these minimums.
2. `basic_swap_creator.json`: This defines swaps that the bot should create. There are three subsections in this configuration:
   - `targetActiveSwaps`: This is a list of pairs that the bot will try to keep active swaps for. For each pair you can configure:
     - `targetProfitability`: The rate that the bot will offer, compared to the market rate. For example, `1.05` means the bot will offer swaps that are 5% better (for itself) than the current market rate.
     - `minProfitability`: As market rates change, the bot will watch the swap, and if its profitability becomes less than this number, the bot will cancel the swap and recreate it with the `targetProfitability`.
     - `maxProfitability`: Similarly, if the swap becomes more profitable than this number, the bot will cancel the swap and recreate it with the `targetProfitability`.
     - `targetGivingSize`: The amount of the `givingTokenClass` that the bot will offer in each swap.
     - `giveLimitPerReset`: The maximum amount of the `givingTokenClass` that the bot should give in swaps it creates per reset.
     - `resetIntervalMs`: The time period in milliseconds that the bot will wait before resetting the `giveLimitPerReset` counter.
     - `maxPriceMovementPercent`: The maximum difference between the min and max price of either of the tokens in the pair during the number of milliseconds specified in the below option (`maxPriceMovementWindowMs`). If prices move more than this much during the specified period of time, the bot will stop creating swaps for this pair until prices become less volatile. For example a value of `0.03` allows up to 3% price movement.
     - `maxPriceMovementWindowMs`: The length of time in milliseconds that the bot will look back to calculate volatility as explained above.
     - `maxReceivingTokenPriceUSD` (optional): If the price of the receiving token goes above this number of USD, the bot will stop creating swaps for this pair.
   - `receivingTokenRoundingConfigs`: When the bot calculates how many tokens it wants to receive in a swap, it will round the number of tokens up to the number of `decimalPlaces` that you configure here.
   - `creationLimits`: The bot will stop creating new swaps when it gives a specified amount of the `givingTokenClass` within a specified time period. That's configurable here.
3. `token_config.json`: This config file contains two sections:
   - `priceLimits`: If the price of a token goes out of the range specified here, the bot will completely stop operating until you restart it. This can be useful as a failsafe in case of extreme market conditions. Note that any of your open swaps will remain open. If you don't want to use this, you may specify an empty array `[]` in this file.
   - `projectTokens`: By default, the bot will only fetch price information for "trending" tokens (including $GALA and most other tokens that have prices available on CoinGecko). To fetch prices for other tokens, include their symbols here. Don't include more than a handful of project tokens or you may get rate-limited.

The default configuration has some sane defaults for trading GALA and GUSDC in both directions.

## Running the Bot

After you've configured the bot, you can run it with the following command run in this directory:

```
sudo docker compose up --build -d
```

To stop the bot, run:

```
sudo docker compose down
```

You may need to omit `sudo` in both commands on Windows or depending on how you have Docker installed.

Note that if you have the `basic_swap_creator.json` strategy enabled, the bot will cancel any swaps you have open that do not match the configuration in that file.

## Writing Your Own Strategies

With knowledge of TypeScript, it should be fairly straightforward to write your own strategies. You can put them into the `src/strategies` directory, import them in `src/bot_main.ts`, and add them in the `strategiesToUse` array. On each tick, your strategy should return an array of swaps to accept, swaps to terminate, and swaps to create (any or all of those arrays may be empty).

To debug and step through your strategy, you can add breakpoints in [VS Code](https://code.visualstudio.com/) and run the bot in debug mode by running the provided `Debug Bot` launch configuration in VS Code. Consider adding `EXECUTION_DELAY_MS` (described above) to your `.env` file so that even if you forget to add breakpoints, the bot will pause before accepting or creation swaps.

You will also need to add a `MONGO_URI` variables in your `.env` file with the URI of a MongoDB database to use.

## Errors

If the bot encounters an error condition that it does not recognize, it is designed to enter an infinite loop and stop trading. To restart the bot, you can run `sudo docker compose restart bot`.

Note that if you have made changes to the bot config, you should instead restart it with `sudo docker compose down bot && sudo docker compose up --build -d`, which will cause the image to re-build.

## Disclaimer

In addition to reading the terms of the [LICENSE](./LICENSE) please review the following:

The following disclaimer is intended to inform users of our trading bot about the potential risks and limitations associated with its use. Please read this disclaimer carefully before utilizing our trading bot.

- **No financial advice**. Gala does not provide financial, investment, legal, tax or any other professional advice. Gala is not a broker, financial advisor, investment advisor, portfolio manager or tax advisor. Nothing on or in the bot shall constitute or be construed as an offering of any currency or any financial instrument or as investment advice or investment recommendations. Gala Games does not guarantee that the Bot will generate profits or prevent losses. Past performance is not indicative of future results. You should be aware that trading involves inherent risks and fluctuations in the market that can lead to financial losses.
- **Risk of loss**. You acknowledge that you could lose some or all of your money. Cryptocurrencies are new and not fully tested. Using cryptocurrencies and blockchain technology involves risks that are still being discovered. There are other risks with using the bot and dealing with cryptocurrencies that Gala Games cannot predict. These risks might happen in unexpected ways. Even if we warn you about risks, Gala Games is not responsible for any losses or bad outcomes from using the software. Gala Games does not promise that the bot will make money or prevent losses. Past performance does not predict future results. Trading has risks and market changes that can cause financial losses..
- **Data and information**. Gala Games will try to make sure the information on this website and through the software is accurate, but it is not responsible for any missing or incorrect information. The content is not customized for any individual, entity, or group. Gala Games does not give opinions on the future or expected value of any currency, cryptocurrency, or other interest.
  User responsibility. The bot is provided "as is" and "as available." Gala Games and its directors, officers, employees, and agents do not make any other promises or guarantees, including about merchantability, fitness for a particular purpose, title, non-infringement, completeness, timeliness, security, reliability, suitability, accuracy, currency, availability, error-free operation, defect-free operation, uninterrupted service, or that any known or unknown defects will be fixed. The bot or the server may have viruses or other harmful components. Your only remedy is to stop using the bot at any time.
- **Cybersecurity**. Gala Games does not guarantee that files or data available for download from the internet or the software will be free of viruses or other harmful code. You are fully responsible for your use of the software and your computer, internet, and data security. Gala Games and its directors, officers, employees, and agents are not liable for any loss or damage caused by denial-of-service attacks, distributed denial-of-service attacks, overloading, flooding, mailbombing, crashing, viruses, trojan horses, worms, logic bombs, or other harmful material that may infect your or Gala Games' computer equipment, programs, data, or other proprietary material due to your use of the software, any services or items found through the software, or downloading any material posted on it or linked to it.
- **Technical issues**. Gala Games is not responsible for any technical issues or interruptions that may occur. This includes server downtime, network failures, or errors in the Bot's functionality.
- **Legal compliance**. You are responsible for following all laws and regulations related to trading activities in your area. It is your responsibility to make sure using the bot complies with local laws. This includes, but is not limited to, not using the bot for purposes of engaging in unlawful trading activities such as price manipulation, wash trading, disruptive trading, or other forms of improper trading or activity.
- **Right to suspend or terminate access**. Gala reserves the right, with or without notice to you, to take whatever action it deems appropriate to suspend or terminate your access to any Gala platform and/or restrict your access to the trading bot. You agree to hold Gala harmless from any alleged losses resulting from such action.

By using our trading bot, you acknowledge that you have read, understood, and agree to the terms and conditions outlined in this disclaimer. You accept full responsibility for any trading decisions and outcomes resulting from the use of our trading bot. We recommend seeking professional advice if you have any doubts or concerns about using our bot.
