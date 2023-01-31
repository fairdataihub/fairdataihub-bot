"use strict";

const short = require("short-uuid");
const axios = require("axios");
require("dotenv").config();

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  app.log.info("Yay, the app was loaded!");

  // On opening a new issue
  app.on("issues.opened", async (context) => {
    console.log("issue opened");

    if (
      context.payload.repository.owner.login !== "fairdataihub" &&
      context.payload.repository.owner.login !== "misanlab"
    ) {
      return;
    }

    const issueComment = context.issue({
      body: "Hello! Thank you for opening this issue. Your input is valuable and helps improve the project. Can you please provide a detailed description of the problem you're encountering? Any additional information such as steps to reproduce the issue would be greatly appreciated. Thank you!",
    });

    console.log("sending slack message");
    await axios.post(SLACK_WEBHOOK_URL, {
      text: `New issue opened by ${context.payload.issue.user.login} in ${context.payload.repository.full_name}`,
    });

    console.log("sending issue comment");
    return context.octokit.issues.createComment(issueComment);
  });

  // On closing an issue
  app.on("issues.closed", async (context) => {
    console.log("issue closed");

    if (
      context.payload.repository.owner.login !== "fairdataihub" &&
      context.payload.repository.owner.login !== "misanlab"
    ) {
      return;
    }

    const issueComment = context.issue({
      body: "If you're still experiencing any problems, please don't hesitate to open a new issue. Have a great day!",
    });

    console.log("sending issue comment");
    return context.octokit.issues.createComment(issueComment);
  });

  // On opening a new pull request
  app.on("pull_request.opened", async (context) => {
    console.log("pull request opened");

    if (
      context.payload.repository.owner.login !== "fairdataihub" &&
      context.payload.repository.owner.login !== "misanlab"
    ) {
      return;
    }

    // Get the pull request number
    const prNumber = context.payload.pull_request.number;

    const issueComment = context.issue({
      body: "Thank you for submitting this pull request! We appreciate your contribution to the project. Before we can merge it, we need to review the changes you've made to ensure they align with our code standards and meet the requirements of the project. We'll get back to you as soon as we can with feedback. Thanks again!",
      issue_number: prNumber,
    });

    console.log("sending pr comment");
    return context.octokit.issues.createComment(issueComment);
  });

  // On closing a pull request
  app.on("pull_request.closed", async (context) => {
    console.log("pull request closed");

    if (
      context.payload.repository.owner.login !== "fairdataihub" &&
      context.payload.repository.owner.login !== "misanlab"
    ) {
      return;
    }

    // Get the pull request number
    const prNumber = context.payload.pull_request.number;

    const issueComment = context.issue({
      body: "Thanks for closing this pull request! If you have any further questions, please feel free to open a new issue. We are always happy to help!",
      issue_number: prNumber,
    });

    console.log("sending pr comment");
    return context.octokit.issues.createComment(issueComment);
  });

  // On editing a pull request
  app.on("pull_request.edited", async (context) => {
    console.log("pull request edited");

    if (
      context.payload.repository.owner.login !== "fairdataihub" &&
      context.payload.repository.owner.login !== "misanlab"
    ) {
      return;
    }

    // Get the pull request number
    const prNumber = context.payload.pull_request.number;

    const issueComment = context.issue({
      body: "Thanks for making updates to your pull request. Our team will take a look and provide feedback as soon as possible. Please wait for any GitHub Actions to complete before editing your pull request. If you have any additional questions or concerns, feel free to let us know. Thank you for your contributions!",
      issue_number: prNumber,
    });

    console.log("sending pr comment");
    return context.octokit.issues.createComment(issueComment);
  });

  app.on("pull_request.ready_for_review", async (context) => {
    console.log("pull request ready for review");

    if (
      context.payload.repository.owner.login !== "fairdataihub" &&
      context.payload.repository.owner.login !== "misanlab"
    ) {
      return;
    }

    // Get the pull request number
    const prNumber = context.payload.pull_request.number;

    const issueComment = context.issue({
      body: "Thanks for making your pull request ready for review! Our team will take a look and provide feedback as soon as possible.",
      issue_number: prNumber,
    });

    console.log("sending pr comment");
    return context.octokit.issues.createComment(issueComment);
  });

  // On repo being starred
  app.on("star.created", async (context) => {
    console.log("repo starred");

    if (
      context.payload.repository.owner.login !== "fairdataihub" &&
      context.payload.repository.owner.login !== "misanlab"
    ) {
      console.log("repo not fairdataihub or misanlab");
      return;
    }

    const image_url = `https://api.dicebear.com/5.x/thumbs/svg?seed=${Math.random()}`;
    console.log(image_url);

    await axios.post(SLACK_WEBHOOK_URL, {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `New star created! :star: \n The <${context.payload.repository.html_url}|${context.payload.repository.name}> repository in the <${context.payload.repository.owner.html_url}|${context.payload.repository.owner.login}> organization was just starred by <${context.payload.sender.html_url}|${context.payload.sender.login}>! :tada: `,
          },
          accessory: {
            type: "image",
            image_url,
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

  // On repo being unstarred
  app.on("star.deleted", async (context) => {
    console.log("repo unstarred");

    if (
      context.payload.repository.owner.login !== "fairdataihub" &&
      context.payload.repository.owner.login !== "misanlab"
    ) {
      return;
    }

    const image_url = `https://api.dicebear.com/5.x/micah/svg?seed=${Math.random()}&mouth=frown,nervous,sad,surprised`;
    console.log(image_url);

    await axios.post(SLACK_WEBHOOK_URL, {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Star removed! :star: \n The <${context.payload.repository.html_url}|${context.payload.repository.name}> repository in the <${context.payload.repository.owner.html_url}|${context.payload.repository.owner.login}> organization lost a star from <${context.payload.sender.html_url}|${context.payload.sender.login}>! :cry: `,
          },
          accessory: {
            type: "image",
            image_url,
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

  // On creating a new fork
  app.on("fork", async (context) => {
    console.log("repo forked");

    await axios.post(SLACK_WEBHOOK_URL, {
      text: `New fork created by ${context.payload.forkee.owner.login} of ${context.payload.repository.full_name}`,
    });

    return;
  });

  // On adding a label to an issue
  app.on("label.created", async (context) => {
    console.log("label added");

    let issueComment = "";

    // Get the label name
    const labelName = context.payload.label.name;

    if (labelName === "bug" || labelName === "needs-more-info") {
      issueComment = context.issue({
        body: "We appreciate your contribution to the project. Can you please provide more details, such as steps to reproduce the problem, and any relevant information to help us understand the issue better? This will help us in resolving the issue as soon as possible.",
      });
    } else if (labelName === "enhancement") {
      issueComment = context.issue({
        body: "We appreciate your contribution to the project. Can you please provide more details, such as the use case for the enhancement, and any relevant information to help us understand the issue better? This will help us in resolving the issue as soon as possible.",
      });
    } else {
      return;
    }

    console.log("sending issue comment");
    return context.octokit.issues.createComment(issueComment);
  });

  // On adding app to the account
  app.on("installation.created", async (context) => {
    console.log("app installed");

    const owner = context.payload.installation.account.login;

    for (const repo of context.payload.repositories) {
      const repoName = repo.name;

      await axios.post(SLACK_WEBHOOK_URL, {
        text: `New installation created by ${owner} in ${repoName}`,
      });

      return;
    }
  });

  // On adding adding a repository to the app
  app.on("installation_repositories.added", async (context) => {
    console.log("repo added");

    const owner = context.payload.installation.account.login;

    for (const repo of context.payload.repositories_added) {
      const repoName = repo.name;

      await axios.post(SLACK_WEBHOOK_URL, {
        text: `New repository added by ${owner} in ${repoName}`,
      });

      return;
    }
  });

  // on creating a new repository
  app.on("repository.created", async (context) => {
    console.log("repo created");

    const owner = context.payload.repository.owner.login;
    const repoName = context.payload.repository.name;

    await axios.post(SLACK_WEBHOOK_URL, {
      text: `New repository created by ${owner} in ${repoName}`,
    });

    return;
  });

  // on commiting to the master branch
  app.on("push", async (context) => {
    console.log("push to master");
  });
};
