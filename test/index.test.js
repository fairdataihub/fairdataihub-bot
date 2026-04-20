const nock = require("nock");
// Requiring our app implementation
const myProbotApp = require("../app");
const { Probot, ProbotOctokit } = require("probot");
// Requiring our fixtures
const payload = require("./fixtures/issues.opened");
const fs = require("fs");
const path = require("path");

const privateKey = fs.readFileSync(path.join(__dirname, "fixtures/mock-cert.pem"), "utf-8");

describe("My Probot app", () => {
  let probot;

  const mockAccessToken = () =>
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          issues: "write",
        },
      });

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      appId: 123,
      privateKey,
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });
    // Load our app into probot
    probot.load(myProbotApp);
  });

  test("creates a comment when an issue is opened", async () => {
    const tokenScope = mockAccessToken();
    const listScope = nock("https://api.github.com")
      .get("/repos/fairdataihub/testing-things/issues/1/comments")
      .query(true)
      .reply(200, []);
    const commentScope = nock("https://api.github.com")
      .post("/repos/fairdataihub/testing-things/issues/1/comments", (body) => {
        expect(body.body).toContain("Hello! Thank you for opening this issue.");
        expect(body.body).toContain("<!-- fdih-bot:issues-opened -->");
        return true;
      })
      .reply(200);

    // Receive a webhook event
    await probot.receive({ name: "issues", payload });

    expect(tokenScope.isDone()).toBe(true);
    expect(listScope.isDone()).toBe(true);
    expect(commentScope.isDone()).toBe(true);
  });

  test("does not create duplicate issue comment when marker already exists", async () => {
    const tokenScope = mockAccessToken();
    const listScope = nock("https://api.github.com")
      .get("/repos/fairdataihub/testing-things/issues/1/comments")
      .query(true)
      .reply(200, [{ body: "existing\n\n<!-- fdih-bot:issues-opened -->" }]);
    const commentScope = nock("https://api.github.com")
      .post("/repos/fairdataihub/testing-things/issues/1/comments")
      .reply(200);

    await probot.receive({ name: "issues", payload });

    expect(tokenScope.isDone()).toBe(true);
    expect(listScope.isDone()).toBe(true);
    expect(commentScope.isDone()).toBe(false);
  });

  test("posts merged message when pull request is merged", async () => {
    const tokenScope = mockAccessToken();
    const payloadPrMerged = {
      action: "closed",
      pull_request: {
        number: 2,
        merged: true,
        user: { login: "contributor", type: "User" },
      },
      repository: {
        name: "testing-things",
        owner: { login: "fairdataihub" },
      },
      installation: { id: 2 },
    };

    const listScope = nock("https://api.github.com")
      .get("/repos/fairdataihub/testing-things/issues/2/comments")
      .query(true)
      .reply(200, []);
    const commentScope = nock("https://api.github.com")
      .post("/repos/fairdataihub/testing-things/issues/2/comments", (body) => {
        expect(body.body).toContain("merged");
        expect(body.body).toContain("<!-- fdih-bot:pull-request-merged -->");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: payloadPrMerged });

    expect(tokenScope.isDone()).toBe(true);
    expect(listScope.isDone()).toBe(true);
    expect(commentScope.isDone()).toBe(true);
  });

  test("posts closed message when pull request is not merged", async () => {
    const tokenScope = mockAccessToken();
    const payloadPrClosed = {
      action: "closed",
      pull_request: {
        number: 3,
        merged: false,
        user: { login: "contributor", type: "User" },
      },
      repository: {
        name: "testing-things",
        owner: { login: "fairdataihub" },
      },
      installation: { id: 2 },
    };

    const listScope = nock("https://api.github.com")
      .get("/repos/fairdataihub/testing-things/issues/3/comments")
      .query(true)
      .reply(200, []);
    const commentScope = nock("https://api.github.com")
      .post("/repos/fairdataihub/testing-things/issues/3/comments", (body) => {
        expect(body.body).toContain("closing this pull request");
        expect(body.body).toContain("<!-- fdih-bot:pull-request-closed -->");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: payloadPrClosed });

    expect(tokenScope.isDone()).toBe(true);
    expect(listScope.isDone()).toBe(true);
    expect(commentScope.isDone()).toBe(true);
  });

  test("posts labeled issue guidance when key details are missing", async () => {
    const tokenScope = mockAccessToken();
    const payloadIssueLabeled = {
      action: "labeled",
      label: { name: "bug" },
      issue: {
        number: 4,
        body: "App fails sometimes.",
      },
      repository: {
        name: "testing-things",
        owner: { login: "fairdataihub" },
      },
      installation: { id: 2 },
    };

    const listScope = nock("https://api.github.com")
      .get("/repos/fairdataihub/testing-things/issues/4/comments")
      .query(true)
      .reply(200, []);
    const commentScope = nock("https://api.github.com")
      .post("/repos/fairdataihub/testing-things/issues/4/comments", (body) => {
        expect(body.body).toContain("please add");
        expect(body.body).toContain("steps to reproduce");
        expect(body.body).toContain("<!-- fdih-bot:issues-labeled:bug -->");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "issues", payload: payloadIssueLabeled });

    expect(tokenScope.isDone()).toBe(true);
    expect(listScope.isDone()).toBe(true);
    expect(commentScope.isDone()).toBe(true);
  });

  test("does not post labeled issue guidance when details are complete", async () => {
    const tokenScope = mockAccessToken();
    const payloadIssueLabeledComplete = {
      action: "labeled",
      label: { name: "bug" },
      issue: {
        number: 5,
        body: "Steps to reproduce: do X. Expected: Y. Actual: Z happened. Environment: node on macOS.",
      },
      repository: {
        name: "testing-things",
        owner: { login: "fairdataihub" },
      },
      installation: { id: 2 },
    };

    const commentScope = nock("https://api.github.com")
      .post("/repos/fairdataihub/testing-things/issues/5/comments")
      .reply(200);

    await probot.receive({ name: "issues", payload: payloadIssueLabeledComplete });

    expect(tokenScope.isDone()).toBe(false);
    expect(commentScope.isDone()).toBe(false);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about testing with Nock see:
// https://github.com/nock/nock
