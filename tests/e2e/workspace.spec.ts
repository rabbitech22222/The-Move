import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type { WorkspaceData, Project } from "../../lib/domain";

const origin = "http://localhost:3000";
const source = "https://www.bbc.com/news";

async function login(page: Page, operator = 1) {
  await page.goto("/login");
  await page
    .getByLabel("Email address")
    .fill(`operator${operator}@themove.local`);
  await page.getByLabel("Password", { exact: true }).fill("move-demo-2026");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
}

async function workspace(request: APIRequestContext): Promise<WorkspaceData> {
  const response = await request.get("/api/workspace");
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}

async function mutate(
  request: APIRequestContext,
  data: object,
  path = "/api/projects",
) {
  return request.post(path, { headers: { Origin: origin }, data });
}

async function createProject(
  request: APIRequestContext,
  title: string,
): Promise<Project> {
  const response = await mutate(request, {
    action: "create",
    title,
    channelId: "the-move",
    operatorId: "operator-1",
    format: "CAROUSEL",
  });
  expect(response.status()).toBe(200);
  const data: WorkspaceData = (await response.json()).data;
  const project = data.projects.find((item) => item.title === title);
  expect(project).toBeDefined();
  return project!;
}

test("private pages and APIs require a valid operator session", async ({
  page,
  request,
}) => {
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/login$/);
  for (const endpoint of ["/api/workspace", "/api/settings"]) {
    const response = await request.get(endpoint);
    expect(response.status(), endpoint).toBe(401);
    expect((await response.json()).code).toBe("UNAUTHENTICATED");
  }
  const write = await mutate(request, {
    action: "create",
    title: "Unauthorized request",
  });
  expect(write.status()).toBe(401);
});

test("admin can navigate all seven pages with explicit demo labeling and no browser crashes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  const pages = [
    ["Dashboard", "Dashboard"],
    ["Intelligence", "Intelligence"],
    ["Studio", "Content studio"],
    ["Canva Factory", "Canva Factory"],
    ["Office", "Virtual office."],
    ["Analytics", "Analytics"],
    ["Settings", "Settings"],
  ];
  for (const [link, heading] of pages) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: link, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: heading, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("Studio creates, edits and persists a sourced project with revision and production records", async ({
  page,
}) => {
  await login(page);
  const title = `E2E studio ${Date.now()}`;
  await page.getByRole("link", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Start a new story" }),
  ).toBeVisible();
  await dialog.getByLabel("Project title", { exact: true }).fill(title);
  await dialog
    .getByLabel("Channel", { exact: true })
    .selectOption("korea-coded");
  await dialog.getByLabel("Assigned operator").selectOption("operator-2");
  await dialog.getByLabel("Source references").fill(source);
  await dialog
    .getByLabel("Draft copy")
    .fill("A sourced editorial draft for the browser persistence test.");
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: `Open ${title}`, exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(dialog.getByLabel("Source references")).toHaveValue(source);
  await expect(dialog.getByLabel("Assigned operator")).toHaveValue(
    "operator-2",
  );
  await dialog
    .getByLabel("Draft copy")
    .fill("Updated sourced draft, saved by a human operator.");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(dialog.getByLabel("Draft copy")).toHaveValue(
    "Updated sourced draft, saved by a human operator.",
  );
  await dialog.getByLabel("Record production time").fill("17");
  await dialog.getByRole("button", { name: "Add minutes" }).click();
  await expect(
    dialog.getByText("17 minutes recorded", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Move to Research" }).click();
  await expect(
    dialog.getByRole("button", { name: "Move to Draft" }),
  ).toBeVisible();
  const saved = (await workspace(page.request)).projects.find(
    (item) => item.title === title,
  )!;
  expect(saved.stage).toBe("RESEARCH");
  expect(saved.productionMinutes).toBe(17);
  expect(saved.revisions.map((revision) => revision.note)).toContain(
    "Recorded 17 production minutes",
  );
  expect(saved.revisions.map((revision) => revision.note)).toContain("update");
});

test("stage guards prevent fabricated publication, skipped review and unsourced approval", async ({
  page,
}) => {
  await login(page);
  const project = await createProject(page.request, `E2E guards ${Date.now()}`);
  for (const stage of ["PUBLISHED", "SCHEDULED", "APPROVED", "DESIGN"]) {
    const response = await mutate(page.request, {
      action: "transition",
      projectId: project.id,
      stage,
    });
    expect(response.status(), stage).toBe(409);
  }
  for (const stage of ["RESEARCH", "DRAFT", "DESIGN", "REVIEW"]) {
    expect(
      (
        await mutate(page.request, {
          action: "transition",
          projectId: project.id,
          stage,
        })
      ).status(),
    ).toBe(200);
  }
  const rejected = await mutate(page.request, {
    action: "approve",
    projectId: project.id,
  });
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).code).toBe("RESEARCH_REQUIRED");
  const data = await workspace(page.request);
  expect(data.projects.find((item) => item.id === project.id)?.stage).toBe(
    "REVIEW",
  );
  expect(data.publications.some((item) => item.projectId === project.id)).toBe(
    false,
  );
});

test("human approval is recorded and content edits invalidate it without publishing", async ({
  page,
}) => {
  await login(page);
  const title = `E2E review ${Date.now()}`;
  const project = await createProject(page.request, title);
  expect(
    (
      await mutate(page.request, {
        action: "update",
        projectId: project.id,
        sourceUrls: [source],
        draftCopy: "Sourced draft for explicit human approval.",
      })
    ).status(),
  ).toBe(200);
  for (const stage of ["RESEARCH", "DRAFT", "DESIGN", "REVIEW"]) {
    expect(
      (
        await mutate(page.request, {
          action: "transition",
          projectId: project.id,
          stage,
        })
      ).status(),
    ).toBe(200);
  }
  await page.goto("/studio");
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Review & approve" }).click();
  await expect(
    dialog.getByText("Confirm human approval", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect(
    dialog.getByText("Editorially approved", { exact: true }),
  ).toBeVisible();
  const approved = await workspace(page.request);
  expect(
    approved.approvals.find((item) => item.projectId === project.id)?.actorId,
  ).toBe("operator-1");
  expect(
    approved.publications.some((item) => item.projectId === project.id),
  ).toBe(false);
  await dialog
    .getByLabel("Draft copy")
    .fill("A content edit after approval requires another human review.");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const updated = await workspace(page.request);
  expect(updated.projects.find((item) => item.id === project.id)?.stage).toBe(
    "REVIEW",
  );
  expect(updated.approvals.some((item) => item.projectId === project.id)).toBe(
    false,
  );
});

test("Operator 2 can sign in but cannot change administrator editorial rules", async ({
  page,
}) => {
  await login(page, 2);
  await expect(
    page
      .getByRole("complementary", { name: "Main navigation" })
      .getByText("Operator 2", { exact: true }),
  ).toBeVisible();
  const before = await workspace(page.request);
  const response = await mutate(
    page.request,
    {
      action: "guidelines",
      channelId: "the-move",
      guidelines: "Unauthorized guideline replacement should never persist.",
    },
    "/api/settings",
  );
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe("FORBIDDEN");
  const after = await workspace(page.request);
  expect(
    after.channels.find((item) => item.id === "the-move")?.guidelines,
  ).toBe(before.channels.find((item) => item.id === "the-move")?.guidelines);
});

test("session-authenticated writes reject absent or foreign Origin and logout revokes access", async ({
  page,
}) => {
  await login(page);
  const payload = {
    action: "create",
    title: "CSRF must not save",
    channelId: "the-move",
    operatorId: "operator-1",
  };
  const missing = await page.request.post("/api/projects", { data: payload });
  const foreign = await page.request.post("/api/projects", {
    headers: { Origin: "https://untrusted.example" },
    data: payload,
  });
  for (const response of [missing, foreign]) {
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe("ORIGIN_MISMATCH");
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
});

test("Canva preserves the exact approved reference designs and reports disconnected inspection", async ({
  page,
}) => {
  await login(page);
  await page.goto("/canva");
  await expect(
    page.getByRole("heading", { name: "Canva Factory", exact: true }),
  ).toBeVisible();
  const expectedIds = ["DAHPXU1IGDI", "DAHXJGy8do8", "DAHPcvVkH8k"];
  const data = await workspace(page.request);
  expect(data.templates.map((template) => template.designId)).toEqual(
    expectedIds,
  );
  expect(
    data.templates
      .filter((template) => template.format === "REEL")
      .map((template) => template.designId),
  ).toEqual(["DAHPcvVkH8k"]);
  for (const id of expectedIds) {
    await expect(
      page
        .getByRole("link", { name: "Reference", exact: true })
        .and(page.locator(`[href="https://www.canva.com/design/${id}/view"]`)),
    ).toHaveCount(1);
  }
  await expect(
    page.getByRole("button", { name: "Generate in Canva" }),
  ).toBeDisabled();
  const settingsResponse = await page.request.get("/api/settings");
  const settings = (await settingsResponse.json()).data;
  if (!settings.integrations.canva.configured) {
    await page
      .getByRole("button", { name: "Inspect dataset", exact: true })
      .first()
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      /connect|disconnected|configuration/i,
    );
    const after = await workspace(page.request);
    expect(after.templates.map((template) => template.designId)).toEqual(
      expectedIds,
    );
  }
});

test("Office displays recorded agent activity and never invents idle-agent results", async ({
  page,
}) => {
  await login(page);
  await page.goto("/office");
  await expect(
    page.getByRole("heading", { name: "Virtual office.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Activity is derived from recorded background jobs · updates every 5s",
      { exact: true },
    ),
  ).toBeVisible();
  const data = await workspace(page.request);
  for (const agent of [
    "Scout",
    "Researcher",
    "Editor",
    "Designer",
    "Publisher",
    "Analyst",
  ]) {
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^Inspect ${agent}, (idle|queued|running|error)$`),
      }),
    ).toHaveCount(1);
    const tasks = data.tasks.filter((task) => task.agent === agent);
    if (!tasks.length) {
      await page.getByRole("button", { name: agent, exact: true }).click();
      await expect(
        page.getByText(`No recorded tasks for ${agent}.`, { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByText("Idle and ready", { exact: true }),
      ).toBeVisible();
    }
  }
  await mkdir("/tmp/move-screenshots", { recursive: true });
  await page.screenshot({
    path: "/tmp/move-screenshots/office.png",
    fullPage: true,
  });
});

test("dashboard exposes channel filters, reporting periods, source and snapshot labels", async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByText("You’re viewing a demo workspace.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Sample snapshot:/)).toBeVisible();
  await expect(page.getByText(/Demo seed · sample data/)).toBeVisible();
  for (const period of ["7 days", "30 days", "90 days"]) {
    await page.getByRole("button", { name: period, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Follower growth", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByLabel("Report channel", { exact: true })
    .selectOption("the-move");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(page.getByLabel("Report start date")).toBeVisible();
  await expect(page.getByLabel("Report end date")).toBeVisible();
  await page.getByLabel("Report channel", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  await mkdir("/tmp/move-screenshots", { recursive: true });
  await page.screenshot({
    path: "/tmp/move-screenshots/dashboard.png",
    fullPage: true,
  });
});

test("theme and reduced motion preferences persist across reloads and Office navigation", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("checkbox", { name: /Reduce motion/ }).check();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("checkbox", { name: /Reduce motion/ }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Office", exact: true })
    .click();
  await expect(page.getByText("REDUCED MOTION", { exact: true })).toBeVisible();
});

test("media references persist and edits invalidate approval until assets are human reviewed", async ({
  page,
}) => {
  await login(page);
  const title = `E2E media ${Date.now()}`;
  const project = await createProject(page.request, title);
  expect(
    (
      await mutate(page.request, {
        action: "update",
        projectId: project.id,
        sourceUrls: [source],
        draftCopy: "Sourced copy with a separately reviewed media reference.",
      })
    ).status(),
  ).toBe(200);
  for (const stage of ["RESEARCH", "DRAFT", "DESIGN", "REVIEW"])
    expect(
      (
        await mutate(page.request, {
          action: "transition",
          projectId: project.id,
          stage,
        })
      ).status(),
    ).toBe(200);
  expect(
    (
      await mutate(page.request, { action: "approve", projectId: project.id })
    ).status(),
  ).toBe(200);
  await page.goto("/studio");
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Link media", exact: true }).click();
  await dialog
    .getByLabel("External HTTPS media URL")
    .fill("https://example.com/e2e-media.jpg");
  await dialog
    .getByLabel("Source credit & usage rights")
    .fill(
      "Operator-provided test fixture; no actual image ownership is asserted.",
    );
  await dialog.getByRole("button", { name: "Link media", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Approve asset", exact: true }),
  ).toBeVisible();
  let data = await workspace(page.request);
  expect(data.projects.find((p) => p.id === project.id)?.stage).toBe("REVIEW");
  expect(data.approvals.filter((a) => a.projectId === project.id)).toHaveLength(
    0,
  );
  expect(
    (
      await mutate(page.request, { action: "approve", projectId: project.id })
    ).status(),
  ).toBe(409);
  await dialog
    .getByRole("button", { name: "Approve asset", exact: true })
    .click();
  await expect(
    dialog.getByText("Human reviewed", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(
    dialog.getByText("Human reviewed", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await mutate(page.request, { action: "approve", projectId: project.id })
    ).status(),
  ).toBe(200);
  data = await workspace(page.request);
  expect(data.assets.find((a) => a.projectId === project.id)?.approved).toBe(
    true,
  );
  const unsafe = await mutate(
    page.request,
    {
      action: "add",
      projectId: project.id,
      kind: "IMAGE",
      url: "https://127.0.0.1/private",
      credit: "test",
    },
    "/api/assets",
  );
  expect(unsafe.status()).toBe(400);
});

test("new channels remain disconnected with no invented account metrics", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings");
  const name = `E2E future ${Date.now()}`;
  await page.getByLabel("Channel name", { exact: true }).fill(name);
  await page
    .getByLabel("Channel handle", { exact: true })
    .fill(`@future${Date.now()}`);
  await page
    .getByLabel("Initial editorial guidelines")
    .fill(
      "Verify primary sources and use restrained editorial copy for this future channel.",
    );
  await page.getByRole("button", { name: "Add channel", exact: true }).click();
  await expect(page.getByText(/channel added/i)).toBeVisible();
  const data = await workspace(page.request);
  const channel = data.channels.find((c) => c.name === name)!;
  expect(channel).toBeDefined();
  expect(channel.connected).toBe(false);
  expect(
    data.accountMetrics.filter((m) => m.channelId === channel.id),
  ).toHaveLength(0);
});

test("manual Canva copies are recorded for review without inventing an API success", async ({
  page,
}) => {
  await login(page);
  const project = await createProject(
    page.request,
    `E2E manual Canva ${Date.now()}`,
  );
  expect(
    (
      await mutate(page.request, {
        action: "update",
        projectId: project.id,
        sourceUrls: [source],
        draftCopy: "A sourced carousel draft for manual design review.",
      })
    ).status(),
  ).toBe(200);
  for (const stage of ["RESEARCH", "DRAFT", "DESIGN"])
    expect(
      (
        await mutate(page.request, {
          action: "transition",
          projectId: project.id,
          stage,
        })
      ).status(),
    ).toBe(200);
  await page.goto("/canva");
  await page.getByLabel("Editorial project").selectOption(project.id);
  await page
    .getByRole("button", {
      name: "Select THE MOVE • Operator 1 carousel",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Record a new Canva copy", exact: true })
    .click();
  const designId = `E2E_COPY_${Date.now()}`;
  await page
    .getByLabel("New Canva editable link")
    .fill(`https://www.canva.com/design/${designId}/edit`);
  await page.getByLabel("Actual page count").fill("5");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Submit copy for review", exact: true })
    .click();
  await expect(
    page.getByText(/Your new copy is recorded as Manual review/),
  ).toBeVisible();
  const data = await workspace(page.request);
  const design = data.designs.find((d) => d.externalId === designId)!;
  expect(design.status).toBe("MANUAL_REVIEW");
  expect(design.error).toContain("not verified");
  expect(data.projects.find((p) => p.id === project.id)?.stage).toBe("REVIEW");
  expect(data.approvals.filter((a) => a.projectId === project.id)).toHaveLength(
    0,
  );
});
