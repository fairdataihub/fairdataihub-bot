"use strict";

const { Octokit } = require("@octokit/rest");
require("dotenv").config();

const { SLACK_WEBHOOK_URL, GITHUB_PAT } = process.env;
const DEDUPE_REDIS_URL = process.env.WEBHOOK_DEDUP_REDIS_URL || process.env.REDIS_URL;
const DELIVERY_TTL_MS = 10 * 60 * 1000;
const processedDeliveries = new Map();
let redisClientPromise;

const ALLOWED_OWNERS = new Set(["fairdataihub", "misanlab"]);
const IGNORED_ISSUE_BOTS = new Set([
  "renovate[bot]",
  "doi-checker-app[bot]",
  "license-check-bot[bot]",
  "codefair-io[bot]",
  "codefair-app[bot]",
  "sourcery-ai[bot]",
  "vercel[bot]",
]);
const IGNORED_PR_BOTS = new Set(["renovate[bot]"]);

const isAllowedOwner = (owner) => ALLOWED_OWNERS.has(owner);
const isIgnoredIssueBot = (user) => user?.type === "Bot" && IGNORED_ISSUE_BOTS.has(user.login);
const isIgnoredPrBot = (user) => user?.type === "Bot" && IGNORED_PR_BOTS.has(user.login);
const getRepoRef = (context) => ({
  owner: context.payload.repository.owner.login,
  repo: context.payload.repository.name,
});

const createPatOctokit = () => {
  if (!GITHUB_PAT) {
    return null;
  }

  return new Octokit({ auth: GITHUB_PAT });
};

const getRedisClient = async (app) => {
  if (!DEDUPE_REDIS_URL) {
    return null;
  }

  if (redisClientPromise === undefined) {
    redisClientPromise = (async () => {
      try {
        const { createClient } = require("redis");
        const client = createClient({ url: DEDUPE_REDIS_URL });
        client.on("error", (error) => {
          app.log.error({ err: error }, "Redis dedupe client error");
        });
        await client.connect();
        return client;
      } catch (error) {
        app.log.error({ err: error }, "Failed to initialize Redis dedupe client");
        return null;
      }
    })();
  }

  return redisClientPromise;
};

const registerDelivery = async (app, context) => {
  const deliveryId = context.id;

  if (!deliveryId) {
    return true;
  }

  const redisClient = await getRedisClient(app);
  if (redisClient) {
    try {
      const dedupeKey = `fdih-bot:delivery:${deliveryId}`;
      const setResult = await redisClient.set(dedupeKey, "1", {
        NX: true,
        PX: DELIVERY_TTL_MS,
      });

      if (!setResult) {
        app.log.info({ deliveryId }, "Skipping duplicate webhook delivery (redis)");
        return false;
      }

      return true;
    } catch (error) {
      app.log.warn({ err: error, deliveryId }, "Redis dedupe failed; using in-memory fallback");
    }
  }

  const now = Date.now();
  for (const [id, ts] of processedDeliveries.entries()) {
    if (now - ts > DELIVERY_TTL_MS) {
      processedDeliveries.delete(id);
    }
  }

  if (processedDeliveries.has(deliveryId)) {
    app.log.info({ deliveryId }, "Skipping duplicate webhook delivery");
    return false;
  }

  processedDeliveries.set(deliveryId, now);
  return true;
};

const createCommentIfMissing = async (context, { issueNumber, body, marker }) => {
  const { owner, repo } = getRepoRef(context);
  const markerText = `<!-- ${marker} -->`;
  const comments = await context.octokit.paginate(context.octokit.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  const alreadyCommented = comments.some(
    (comment) => typeof comment.body === "string" && comment.body.includes(markerText)
  );

  if (alreadyCommented) {
    return false;
  }

  await context.octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `${body}\n\n${markerText}`,
  });

  return true;
};

const starRepository = async (octokit, owner, repo, app) => {
  try {
    await octokit.activity.starRepo({ owner, repo });
    return;
  } catch (error) {
    app.log.warn(
      { owner, repo, err: error },
      "Installation token star failed, trying PAT fallback"
    );
  }

  const patOctokit = createPatOctokit();
  if (!patOctokit) {
    app.log.warn({ owner, repo }, "Skipping star fallback because GITHUB_PAT is not configured");
    return;
  }

  await patOctokit.activity.starRepoForAuthenticatedUser({ owner, repo });
};

const addReactionsToRelease = async (octokit, owner, repo, releaseId, app) => {
  const reactions = ["+1", "heart", "hooray", "rocket"];

  const results = await Promise.allSettled(
    reactions.map((reaction) =>
      octokit.reactions.createForRelease({
        owner,
        repo,
        release_id: releaseId,
        content: reaction,
      })
    )
  );

  const failed = results
    .map((result, index) => ({ result, reaction: reactions[index] }))
    .filter(({ result }) => result.status === "rejected");

  if (failed.length === 0) {
    return;
  }

  const patOctokit = createPatOctokit();
  for (const { result, reaction } of failed) {
    const status = result.reason?.status;
    const alreadyExists = status === 409 || status === 422;

    if (alreadyExists) {
      continue;
    }

    if (!patOctokit) {
      app.log.error(
        { err: result.reason, owner, repo, releaseId, reaction },
        "Failed to add release reaction and no PAT fallback is configured"
      );
      continue;
    }

    try {
      await patOctokit.reactions.createForRelease({
        owner,
        repo,
        release_id: releaseId,
        content: reaction,
      });
    } catch (fallbackError) {
      app.log.error(
        { err: fallbackError, owner, repo, releaseId, reaction },
        "Failed to add release reaction with PAT fallback"
      );
    }
  }
};

const sendSlackNotification = async (app, payload) => {
  if (!SLACK_WEBHOOK_URL) {
    app.log.warn("SLACK_WEBHOOK_URL is not configured; skipping notification.");
    return;
  }

  if (typeof fetch !== "function") {
    app.log.warn("Native fetch is unavailable; skipping Slack notification.");
    return;
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      app.log.error(
        {
          status: response.status,
          statusText: response.statusText,
          body: responseBody,
        },
        "Slack notification request failed"
      );
    }
  } catch (error) {
    app.log.error({ err: error }, "Failed to send Slack notification");
  }
};

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  app.log.info("Yay, the app was loaded!");

  /**
   * On an issue being opened
   * @param {import('probot').Context} context
   */
  app.on("issues.opened", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("issue opened");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    // Don't respond to the status messages
    if (
      context.payload.repository.name === "uptime" ||
      context.payload.repository.name === "upptime"
    ) {
      return;
    }

    // Don't respond to the issues opened by our bots or renovate
    if (isIgnoredIssueBot(context.payload.issue.user)) {
      return;
    }

    const issueNumber = context.payload.issue.number;

    await sendSlackNotification(app, {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `New issue opened in ${context.payload.repository.full_name}`,
            emoji: true,
          },
        },
        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Issue title:* ${context.payload.issue.title}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Issue Link:* ${context.payload.issue.html_url}`,
          },
        },
      ],
    });

    console.log("sending issue comment");
    return createCommentIfMissing(context, {
      issueNumber,
      body: "Hello! Thank you for opening this issue. Your input is valuable and helps improve the project. Can you please provide a detailed description of the problem you're encountering? Any additional information such as steps to reproduce the issue would be greatly appreciated. Thank you!",
      marker: "fdih-bot:issues-opened",
    });
  });

  /**
   * On an issue being closed
   * @param {import('probot').Context} context
   */
  app.on("issues.closed", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("issue closed");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    /**
     * * Don't respond to the status messages
     */
    if (
      context.payload.repository.name === "uptime" ||
      context.payload.repository.name === "upptime"
    ) {
      return;
    }

    // Don't respond to the issues closed by our bots or renovate
    if (isIgnoredIssueBot(context.payload.issue.user)) {
      return;
    }

    const issueNumber = context.payload.issue.number;

    console.log("sending issue comment");
    return createCommentIfMissing(context, {
      issueNumber,
      body: "If you're still experiencing any problems, please don't hesitate to open a new issue. Have a great day!",
      marker: "fdih-bot:issues-closed",
    });
  });

  /**
   * On a pull request being opened
   * @param {import('probot').Context} context
   */
  app.on("pull_request.opened", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("pull request opened");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    // Don't respond to the pull requests opened by renovate
    if (isIgnoredPrBot(context.payload.pull_request.user)) {
      return;
    }

    // Get the pull request number
    const prNumber = context.payload.pull_request.number;

    console.log("sending pr comment");
    return createCommentIfMissing(context, {
      issueNumber: prNumber,
      body: "Thank you for submitting this pull request! We appreciate your contribution to the project. Before we can merge it, we need to review the changes you've made to ensure they align with our code standards and meet the requirements of the project. We'll get back to you as soon as we can with feedback. Thanks again!",
      marker: "fdih-bot:pull-request-opened",
    });
  });

  /**
   * On a pull request being closed/merged
   * @param {import('probot').Context} context
   */
  app.on("pull_request.closed", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("pull request closed");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    // Don't respond to the pull requests closed by renovate
    if (isIgnoredPrBot(context.payload.pull_request.user)) {
      return;
    }

    // Get the pull request number
    const prNumber = context.payload.pull_request.number;

    const pr = context.payload.pull_request;
    const wasMerged = Boolean(pr.merged);
    const body = wasMerged
      ? "Thank you for getting this pull request merged. We appreciate your contribution and look forward to your next one!"
      : "Thanks for closing this pull request. If you plan to revisit this work later, feel free to reopen it or submit a new pull request.";
    const marker = wasMerged ? "fdih-bot:pull-request-merged" : "fdih-bot:pull-request-closed";

    console.log("sending pr comment");
    return createCommentIfMissing(context, {
      issueNumber: prNumber,
      body,
      marker,
    });
  });

  /**
   * On a pull request being edited
   * @param {import('probot').Context} context
   */
  app.on("pull_request.edited", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("pull request edited");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    // Don't respond to the pull requests opened by renovate
    if (isIgnoredPrBot(context.payload.pull_request.user)) {
      return;
    }

    // Get the pull request number
    const prNumber = context.payload.pull_request.number;

    console.log("sending pr comment");
    return createCommentIfMissing(context, {
      issueNumber: prNumber,
      body: "Thanks for making updates to your pull request. Our team will take a look and provide feedback as soon as possible. Please wait for any GitHub Actions to complete before editing your pull request. If you have any additional questions or concerns, feel free to let us know. Thank you for your contributions!",
      marker: "fdih-bot:pull-request-edited",
    });
  });

  /**
   * On a pull request being marked as ready for review
   * @param {import('probot').Context} context
   */
  app.on("pull_request.ready_for_review", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("pull request ready for review");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    // Get the pull request number
    const prNumber = context.payload.pull_request.number;

    console.log("sending pr comment");
    return createCommentIfMissing(context, {
      issueNumber: prNumber,
      body: "Thanks for making your pull request ready for review! Our team will take a look and provide feedback as soon as possible.",
      marker: "fdih-bot:pull-request-ready-for-review",
    });
  });

  /**
   * On a new star being added to a repository
   * @param {import('probot').Context} context
   */
  app.on("star.created", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("repo starred");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      console.log("repo not fairdataihub or misanlab");
      return;
    }

    await sendSlackNotification(app, {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `New star created! :star: \n The <${context.payload.repository.html_url}|${context.payload.repository.name}> repository in the <${context.payload.repository.owner.html_url}|${context.payload.repository.owner.login}> organization was just starred by <${context.payload.sender.html_url}|${context.payload.sender.login}>! :tada: `,
          },
          accessory: {
            type: "image",
            image_url: `https://api.dicebear.com/5.x/thumbs/png?seed=${context.id}`,
            alt_text: "image",
          },
        },
        {
          type: "divider",
        },
      ],
    });

    return;
  });

  /**
   * On repository being unstarred
   * @param {import('probot').Context} context
   */
  app.on("star.deleted", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("repo unstarred");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    await sendSlackNotification(app, {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Star removed! :star: \n The <${context.payload.repository.html_url}|${context.payload.repository.name}> repository in the <${context.payload.repository.owner.html_url}|${context.payload.repository.owner.login}> organization lost a star from <${context.payload.sender.html_url}|${context.payload.sender.login}>! :cry: `,
          },
          accessory: {
            type: "image",
            image_url: `https://api.dicebear.com/5.x/micah/png?seed=${context.id}&mouth=frown,nervous,sad,surprised`,
            alt_text: "image",
          },
        },
        {
          type: "divider",
        },
      ],
    });

    return;
  });

  /**
   * On repository being forked
   * @param {import('probot').Context} context
   */
  app.on("fork", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("repo forked");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    await sendSlackNotification(app, {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `New fork created! :fork_and_knife: \n The <${context.payload.repository.html_url}|${context.payload.repository.name}> repository in the <${context.payload.repository.owner.html_url}|${context.payload.repository.owner.login}> organization was just forked by <${context.payload.forkee.owner.html_url}|${context.payload.forkee.owner.login}>! :monocle_face: `,
          },
          accessory: {
            type: "image",
            image_url: `https://api.dicebear.com/5.x/shapes/png?seed=${context.id}`,
            alt_text: "image",
          },
        },
        {
          type: "divider",
        },
      ],
    });

    return;
  });

  /**
   * On a release being published
   * @param {import('probot').Context} context
   */
  app.on("release.published", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("release published");

    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    // if the repository name is SODA-for-SPARC and the release is a beta release, return
    if (
      context.payload.repository.name === "SODA-for-SPARC" &&
      context.payload.release?.name?.toLowerCase().includes("beta")
    ) {
      return;
    }

    // Get the release
    const release = context.payload.release;

    // Get repo owner and name
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    // Add reactions to the release
    await addReactionsToRelease(context.octokit, owner, repo, release.id, app);

    await sendSlackNotification(app, {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `New release published! :rocket: \n The <${context.payload.repository.html_url}|${context.payload.repository.name}> repository in the <${context.payload.repository.owner.html_url}|${context.payload.repository.owner.login}> organization just published a new release! :tada: `,
          },
          accessory: {
            type: "image",
            image_url: `https://api.dicebear.com/5.x/big-smile/png?seed=${context.id}`,
            alt_text: "image",
          },
        },
        {
          type: "divider",
        },
      ],
    });

    return;
  });

  /**
   * On a label being added to an issue
   * @param {import('probot').Context} context
   */
  app.on("issues.labeled", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("label added");

    // Get the label name
    if (!isAllowedOwner(context.payload.repository.owner.login)) {
      return;
    }

    const labelName = context.payload.label.name;
    const issueBody = context.payload.issue.body || "";
    const missingDetails = [];
    const issueNumber = context.payload.issue.number;

    if (labelName === "bug" || labelName === "needs-more-info") {
      if (!/steps? to reproduce/i.test(issueBody)) {
        missingDetails.push("steps to reproduce");
      }
      if (!/expected/i.test(issueBody)) {
        missingDetails.push("expected behavior");
      }
      if (!/actual|happened/i.test(issueBody)) {
        missingDetails.push("actual behavior");
      }
      if (!/version|environment|os/i.test(issueBody)) {
        missingDetails.push("environment details (versions, OS, tooling)");
      }
    } else if (labelName === "enhancement") {
      if (!/use case|problem/i.test(issueBody)) {
        missingDetails.push("the problem or use case this enhancement solves");
      }
      if (!/proposed|solution|approach/i.test(issueBody)) {
        missingDetails.push("a proposed solution or approach");
      }
      if (!/impact|benefit|trade-?off/i.test(issueBody)) {
        missingDetails.push("expected impact and trade-offs");
      }
    } else {
      return;
    }

    if (missingDetails.length === 0) {
      return;
    }

    const issueComment = [
      "Thanks for the update. To help maintainers review this faster, please add:",
      ...missingDetails.map((item) => `- ${item}`),
    ].join("\n");

    console.log("sending issue comment");
    return createCommentIfMissing(context, {
      issueNumber,
      body: issueComment,
      marker: `fdih-bot:issues-labeled:${labelName}`,
    });
  });

  /**
   * On adding the GitHub App to an organization
   * @param {import('probot').Context} context
   */
  app.on("installation.created", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("app installed");

    const owner = context.payload.installation.account.login;

    // Check if the repo is in the fairdataihub or misanlab org
    if (!isAllowedOwner(owner)) {
      return;
    }

    for (const repository of context.payload.repositories) {
      const repoName = repository.name;

      try {
        if (repository.fork) {
          continue;
        }

        await starRepository(context.octokit, owner, repoName, app);

        const releases = await context.octokit.repos.listReleases({
          owner,
          repo: repoName,
        });

        for (const release of releases.data) {
          if (release.draft) {
            continue;
          }

          await addReactionsToRelease(context.octokit, owner, repoName, release.id, app);
        }

        await sendSlackNotification(app, {
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `New installation created! :rocket: \n The app was installed to the ${repoName} repository in the <${context.payload.installation.account.html_url}|${owner}> organization! :tada:`,
              },
              accessory: {
                type: "image",
                image_url: `https://api.dicebear.com/5.x/fun-emoji/png?seed=${context.id}`,
                alt_text: "image",
              },
            },
            {
              type: "divider",
            },
          ],
        });
      } catch (error) {
        app.log.error(
          { err: error, owner, repo: repoName },
          "Failed to process installation.created repository"
        );
      }
    }

    return;
  });

  /**
   * On adding a repository to the app
   * @param {import('probot').Context} context
   */
  app.on("installation_repositories.added", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("repo added");

    const owner = context.payload.installation.account.login;

    if (!isAllowedOwner(owner)) {
      return;
    }

    for (const repo of context.payload.repositories_added) {
      const repoName = repo.name;

      try {
        if (repo.fork) {
          continue;
        }

        await starRepository(context.octokit, owner, repoName, app);

        const releases = await context.octokit.repos.listReleases({
          owner,
          repo: repoName,
        });

        for (const release of releases.data) {
          if (release.draft) {
            continue;
          }

          await addReactionsToRelease(context.octokit, owner, repoName, release.id, app);
        }

        await sendSlackNotification(app, {
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `New repository added! ➕ \n The app was installed to the ${repoName} repository in the <${context.payload.installation.account.html_url}|${owner}> organization! :tada:`,
              },
              accessory: {
                type: "image",
                image_url: `https://api.dicebear.com/5.x/fun-emoji/png?seed=${context.id}`,
                alt_text: "image",
              },
            },
            {
              type: "divider",
            },
          ],
        });
      } catch (error) {
        app.log.error(
          { err: error, owner, repo: repoName },
          "Failed to process installation_repositories.added repository"
        );
      }
    }

    return;
  });

  /**
   * On creating a repository
   * @param {import('probot').Context} context
   */
  app.on("repository.created", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("repo created");

    const owner = context.payload.repository.owner.login;
    const repoName = context.payload.repository.name;

    // Check if the repo is in the fairdataihub or misanlab org
    if (!isAllowedOwner(owner)) {
      return;
    }

    // Check if the repo is a fork
    if (context.payload.repository.fork) {
      return;
    }

    // Star the repo
    await starRepository(context.octokit, owner, repoName, app);

    // Get the repo's releases
    const releases = await context.octokit.repos.listReleases({
      owner: owner,
      repo: repoName,
    });

    // loop through the releases
    for (const release of releases.data) {
      // Check if the release is a draft
      if (release.draft) {
        continue;
      }

      await addReactionsToRelease(context.octokit, owner, repoName, release.id, app);
    }

    await sendSlackNotification(app, {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `New repository created! ✨ \n The app was installed to the ${repoName} repository in the <${context.payload.installation.account.html_url}|${owner}> organization! :tada:`,
          },
          accessory: {
            type: "image",
            image_url: `https://api.dicebear.com/5.x/fun-emoji/png?seed=${context.id}`,
            alt_text: "image",
          },
        },
        {
          type: "divider",
        },
      ],
    });

    return;
  });

  /**
   * On push to master
   * @param {import("probot").Context} context
   */
  app.on("push", async (context) => {
    if (!(await registerDelivery(app, context))) {
      return;
    }

    console.log("push to master");
  });
};
