import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { koreanLabel } from "../../lib/korean";
import type { WorkspaceData, Project } from "../../lib/domain";

const origin = "http://localhost:3000";
const source = "https://www.bbc.com/news";

async function login(page: Page, operator = 1) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(`operator${operator}@themove.local`);
  await page.getByLabel("비밀번호", { exact: true }).fill("move-demo-2026");
  await page.getByRole("button", { name: "작업 공간 열기" }).click();
  await expect(
    page.getByRole("heading", { name: "대시보드", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("데모 모드", { exact: true })).toBeVisible();
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
    ["대시보드", "대시보드"],
    ["정보 수집", "정보 수집"],
    ["스튜디오", "콘텐츠 스튜디오"],
    ["캔바 제작소", "캔바 제작소"],
    ["오피스", "가상 오피스."],
    ["분석", "분석"],
    ["설정", "설정"],
  ];
  for (const [link, heading] of pages) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: link, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: heading, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("데모 모드", { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("Studio creates, edits and persists a sourced project with revision and production records", async ({
  page,
}) => {
  await login(page);
  const title = `E2E studio ${Date.now()}`;
  await page.getByRole("link", { name: "새 프로젝트", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "새 콘텐츠 시작" }),
  ).toBeVisible();
  await dialog.getByLabel("프로젝트 제목", { exact: true }).fill(title);
  await dialog.getByLabel("채널", { exact: true }).selectOption("korea-coded");
  await dialog.getByLabel("담당 운영자").selectOption("operator-2");
  await dialog.getByLabel("출처 링크").fill(source);
  await dialog
    .getByLabel("초안")
    .fill("A sourced editorial draft for the browser persistence test.");
  await dialog
    .getByRole("button", { name: "프로젝트 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: `${title} 열기`, exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: `${title} 열기`, exact: true })
    .click();
  await expect(dialog.getByLabel("출처 링크")).toHaveValue(source);
  await expect(dialog.getByLabel("담당 운영자")).toHaveValue("operator-2");
  await dialog
    .getByLabel("초안")
    .fill("Updated sourced draft, saved by a human operator.");
  await dialog.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: `${title} 열기`, exact: true })
    .click();
  await expect(dialog.getByLabel("초안")).toHaveValue(
    "Updated sourced draft, saved by a human operator.",
  );
  await dialog.getByLabel("제작 시간 기록").fill("17");
  await dialog.getByRole("button", { name: "시간 추가 (분)" }).click();
  await expect(dialog.getByText("17 분 기록됨", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "다음 단계: 조사" }).click();
  await expect(
    dialog.getByRole("button", { name: "다음 단계: 초안" }),
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
    .getByRole("button", { name: `${title} 열기`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "검토 및 승인" }).click();
  await expect(
    dialog.getByText("사람의 검토 확인", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "승인 확인", exact: true }).click();
  await expect(
    dialog.getByText("편집 승인 완료", { exact: true }),
  ).toBeVisible();
  const approved = await workspace(page.request);
  expect(
    approved.approvals.find((item) => item.projectId === project.id)?.actorId,
  ).toBe("operator-1");
  expect(
    approved.publications.some((item) => item.projectId === project.id),
  ).toBe(false);
  await dialog
    .getByLabel("초안")
    .fill("A content edit after approval requires another human review.");
  await dialog.getByRole("button", { name: "변경 저장", exact: true }).click();
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
      .getByRole("complementary", { name: "주 메뉴" })
      .getByText("운영자 2", { exact: true }),
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
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
});

test("Canva preserves the exact approved reference designs and reports disconnected inspection", async ({
  page,
}) => {
  await login(page);
  await page.goto("/canva");
  await expect(
    page.getByRole("heading", { name: "캔바 제작소", exact: true }),
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
        .getByRole("link", { name: "원본", exact: true })
        .and(page.locator(`[href="https://www.canva.com/design/${id}/view"]`)),
    ).toHaveCount(1);
  }
  await expect(
    page.getByRole("button", { name: "Canva에서 생성" }),
  ).toBeDisabled();
  const settingsResponse = await page.request.get("/api/settings");
  const settings = (await settingsResponse.json()).data;
  if (!settings.integrations.canva.configured) {
    await page
      .getByRole("button", { name: "필드 검사", exact: true })
      .first()
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      /인증|연결|설정/,
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
    page.getByRole("heading", { name: "가상 오피스.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "활동은 기록된 백그라운드 작업을 기준으로 표시합니다 · 5초마다 갱신",
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
        name: new RegExp(
          `^${koreanLabel(agent)} 작업 확인, (대기|대기 중|실행 중|오류)$`,
        ),
      }),
    ).toHaveCount(1);
    const tasks = data.tasks.filter((task) => task.agent === agent);
    if (!tasks.length) {
      await page
        .getByRole("button", { name: koreanLabel(agent), exact: true })
        .click();
      await expect(
        page.getByText(`기록된 작업 없음: ${koreanLabel(agent)}.`, {
          exact: false,
        }),
      ).toBeVisible();
      await expect(page.getByText("대기 중", { exact: true })).toBeVisible();
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
    page.getByText("현재 데모 작업 공간입니다.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/예시 기록:/)).toBeVisible();
  await expect(page.getByText(/데모 · 예시 데이터/)).toBeVisible();
  for (const period of ["7일", "30일", "90일"]) {
    await page.getByRole("button", { name: period, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "팔로워 추이", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByLabel("보고서 채널", { exact: true })
    .selectOption("the-move");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await page.getByRole("button", { name: "직접 선택", exact: true }).click();
  await expect(page.getByLabel("보고 시작일")).toBeVisible();
  await expect(page.getByLabel("보고 종료일")).toBeVisible();
  await page.getByLabel("보고서 채널", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "30일", exact: true }).click();
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
  await page.getByRole("button", { name: "어둡게", exact: true }).click();
  await page.getByRole("checkbox", { name: /움직임 줄이기/ }).check();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "어둡게", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("checkbox", { name: /움직임 줄이기/ }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "오피스", exact: true })
    .click();
  await expect(page.getByText("움직임 줄이기", { exact: true })).toBeVisible();
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
    .getByRole("button", { name: `${title} 열기`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "미디어 연결", exact: true })
    .click();
  await dialog
    .getByLabel("외부 HTTPS 미디어 주소")
    .fill("https://example.com/e2e-media.jpg");
  await dialog
    .getByLabel("출처 및 이용 권한")
    .fill(
      "Operator-provided test fixture; no actual image ownership is asserted.",
    );
  await dialog
    .getByRole("button", { name: "미디어 연결", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "미디어 승인", exact: true }),
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
    .getByRole("button", { name: "미디어 승인", exact: true })
    .click();
  await expect(
    dialog.getByText("사람 검토 완료", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: `${title} 열기`, exact: true })
    .click();
  await expect(
    dialog.getByText("사람 검토 완료", { exact: true }),
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
  await page.getByLabel("채널 이름", { exact: true }).fill(name);
  await page
    .getByLabel("채널 아이디", { exact: true })
    .fill(`@future${Date.now()}`);
  await page
    .getByLabel("초기 편집 규칙")
    .fill(
      "Verify primary sources and use restrained editorial copy for this future channel.",
    );
  await page.getByRole("button", { name: "채널 추가", exact: true }).click();
  await expect(page.getByText(/채널을 추가했습니다/)).toBeVisible();
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
  await page.getByLabel("편집 프로젝트").selectOption(project.id);
  await page
    .getByRole("button", {
      name: "THE MOVE · 운영자 1 캐러셀 선택",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "새 Canva 사본 등록", exact: true })
    .click();
  const designId = `E2E_COPY_${Date.now()}`;
  await page
    .getByLabel("새 Canva 편집 링크")
    .fill(`https://www.canva.com/design/${designId}/edit`);
  await page.getByLabel("실제 페이지 수").fill("5");
  await page
    .getByRole("checkbox", { name: /원본을 수정하지 않고 새 사본/ })
    .check();
  await page
    .getByRole("button", { name: "사본 검토 요청", exact: true })
    .click();
  await expect(
    page.getByText(/새 사본을 수동 검토 상태로 등록했습니다/),
  ).toBeVisible();
  const data = await workspace(page.request);
  const design = data.designs.find((d) => d.externalId === designId)!;
  expect(design.status).toBe("MANUAL_REVIEW");
  expect(design.error).toContain("확인되지 않았습니다");
  expect(data.projects.find((p) => p.id === project.id)?.stage).toBe("REVIEW");
  expect(data.approvals.filter((a) => a.projectId === project.id)).toHaveLength(
    0,
  );
});
