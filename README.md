# fairdataihub-bot

A GitHub App built with [Probot](https://github.com/probot/probot). We use this bot to handle tasks related to the fairdataihub organization. You can find the source code for the bot at [fairdataihub/fairdataihub-bot](https://github.com/fairdataihub/fairdataihub-bot).

You can use this bot as a template for your own bot or as a reference for how to use the probot framework.

## Setup

```sh
# Install dependencies
yarn install

# Run the bot
yarn start
```

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

[ISC](LICENSE) © 2023 fairdataihub
