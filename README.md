[![Contributors][contributors-shield]][contributors-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]
[![Curated with FAIRshare](https://raw.githubusercontent.com/fairdataihub/FAIRshare/main/badge.svg)](https://fairdataihub.org/fairshare)
[![DOI][zenodo-shield]][zenodo-url]

[contributors-shield]: https://img.shields.io/github/contributors/fairdataihub/fairdataihub-bot.svg?style=flat-square
[contributors-url]: https://github.com/fairdataihub/fairdataihub-bot/graphs/contributors
[stars-shield]: https://img.shields.io/github/stars/fairdataihub/fairdataihub-bot.svg?style=flat-square
[stars-url]: https://github.com/fairdataihub/fairdataihub-bot/stargazers
[issues-shield]: https://img.shields.io/github/issues/fairdataihub/fairdataihub-bot.svg?style=flat-square
[issues-url]: https://github.com/fairdataihub/fairdataihub-bot/issues
[license-shield]: https://img.shields.io/github/license/fairdataihub/fairdataihub-bot.svg?style=flat-square
[license-url]: https://github.com/fairdataihub/fairdataihub-bot/blob/main/LICENSE
[zenodo-shield]: https://zenodo.org/badge/DOI/10.5281/zenodo.7602308.svg
[zenodo-url]: https://doi.org/10.5281/zenodo.7602308

# fairdataihub bot GitHub App

A GitHub App built with [Probot](https://github.com/probot/probot). We use this bot to handle tasks related to the fairdataihub organization. You can find the source code for the bot at [fairdataihub/fairdataihub-bot](https://github.com/fairdataihub/fairdataihub-bot).

You can use this bot as a template for your own bot or as a reference for how to use the probot framework.

## Setup

```sh
# Install dependencies
yarn install

# Run the bot
yarn start
```

## Environment Variables

- `SLACK_WEBHOOK_URL` (optional): Slack incoming webhook URL for notifications.
- `GITHUB_PAT` (optional): Personal access token fallback used when some repository actions fail with installation tokens.
- `WEBHOOK_DEDUP_REDIS_URL` (optional): Redis connection string for cross-instance webhook de-duplication.
- `REDIS_URL` (optional): Fallback Redis connection string if `WEBHOOK_DEDUP_REDIS_URL` is not set.

If no Redis URL is configured, the bot uses in-memory de-duplication. This works in single-instance deployments but does not prevent duplicates across multiple instances.

## Docker

```sh
# 1. Build container
docker build -t fairdataihub-bot .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> fairdataihub-bot
```

## Contributing

If you have suggestions for how fairdataihub-bot could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2023 fairdataihub
