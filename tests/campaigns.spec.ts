import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { saved } from "../scripts/qa-fixture.mjs";
import { configureStyle, personalStyle } from "./style-fixture";

async function records(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve) => {
        const r = indexedDB.open("forma-studio");
        r.onsuccess = () => {
          const db = r.result,
            request = db
              .transaction("workspace")
              .objectStore("workspace")
              .getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result.filter(Boolean));
          };
        };
      }),
  );
}
async function setup(page: Page, personalize = false) {
  const requests: any[] = [],
    jobs = new Map<string, any>();
  let failFacebook = false,
    hold = false;
  const fixture = JSON.parse(
    await readFile("tests/designer.fixture.json", "utf8"),
  );
  const text = fixture.pages[0].elements.find((e: any) => e.type === "text");
  await page.route("**/session", (r) =>
    r.fulfill({ json: { ready: true, token: "campaign-test" } }),
  );
  await page.route("**/jobs", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: [] });
    const body = r.request().postDataJSON();
    requests.push(body);
    const result = {
      title: "Campaign collection",
      description: "Editorial hierarchy with cream and violet.",
      palette: ["#764bdd", "#f5f3ed"],
      width: body.width,
      height: body.height,
      extraAssets: body.campaignImages.map((a: any, i: number) => ({
        ...a,
        id: `campaign-image-${i + 1}`,
        category: "Campaign image",
      })),
      pages: Array.from({ length: body.pages }, (_, i) => ({
        name: `Composition ${i + 1}`,
        background: "#f5f3ed",
        elements: [
          {
            ...text,
            name: "Campaign headline",
            text: "Flowers with feeling",
            x: 60,
            y: 60,
            width: body.width - 120,
            height: 120,
            fontSize: 64,
          },
          ...body.campaignImages.map((a: any, j: number) => ({
            ...text,
            type: "asset",
            name: a.name,
            text: "",
            asset: `campaign-image-${j + 1}`,
            x: 70 + j * 300,
            y: 230,
            width: 250,
            height: 250,
          })),
        ],
      })),
    };
    const job = {
      id: body.clientRequestId,
      status:
        failFacebook && body.width === 1200 && body.height === 630
          ? "failed"
          : hold
            ? "running"
            : "completed",
      stage: "Composing",
      error: "Temporary provider failure",
      result,
    };
    if (job.status === "failed") failFacebook = false;
    jobs.set(job.id, job);
    await r.fulfill({ json: job });
  });
  await page.route("**/jobs/*", (r) => {
    const id = new URL(r.request().url()).pathname.split("/").at(-1)!;
    const job = jobs.get(id);
    if (!job) return r.fulfill({ status: 404, json: { error: "Missing job" } });
    return r.fulfill({
      json:
        !hold && job.status === "running"
          ? { ...job, status: "completed" }
          : job,
    });
  });
  await page.goto("/");
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "A little growth",
  );
  if (personalize) await configureStyle(page);
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  return {
    requests,
    failNextFacebook: () => {
      failFacebook = true;
    },
    hold: () => {
      hold = true;
    },
    release: () => {
      hold = false;
    },
  };
}
async function brief(page: Page) {
  await page
    .getByRole("button", { name: "Create a campaign", exact: true })
    .click();
  await page
    .getByLabel("Campaign name", { exact: true })
    .fill("Spring flowers");
  await page
    .getByLabel("Campaign objective", { exact: true })
    .fill("Introduce local flower delivery and earn first-time orders.");
  await page
    .getByLabel("Campaign audience", { exact: true })
    .fill("Local gift buyers");
  await page
    .getByLabel("Visual direction", { exact: true })
    .fill("Editorial botanical imagery with confident typography.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Folder name", { exact: true }).fill("Mother’s Day");
  await page
    .getByLabel("Folder intent", { exact: true })
    .fill("Celebrate thoughtful hand-tied bouquets and invite gift orders.");
  await page
    .getByLabel("Required message and facts", { exact: true })
    .fill("Hand-tied locally.");
  await page
    .getByLabel("Call to action", { exact: true })
    .fill("Explore the bouquet collection");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

test("print, ads and custom sizes reach the designer and save at their exact dimensions", async ({
  page,
}) => {
  const api = await setup(page, true);
  await expect(
    page.getByText("ONE IDEA. EVERY FORMAT.", { exact: true }),
  ).toHaveCount(0);
  await brief(page);
  for (const name of ["Instagram post", "Facebook post", "LinkedIn post"])
    await page.getByLabel(`${name} count`, { exact: true }).fill("0");
  for (const name of [
    "Poster",
    "A4 document",
    "Flyer",
    "Yard sign",
    "Business card",
    "Square ad",
    "Landscape ad",
    "Website banner",
    "Presentation",
  ])
    await expect(
      page.getByLabel(`${name} count`, { exact: true }),
    ).toBeAttached();
  await page.getByLabel("Poster count", { exact: true }).fill("1");
  await page.getByLabel("A4 document count", { exact: true }).fill("1");
  await page.getByLabel("Square ad count", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Add custom size", exact: true })
    .click();
  await page.getByLabel("Custom size 1 name").fill("Storefront display");
  await page.getByLabel("Custom size 1 width (px)").fill("1460");
  await page.getByLabel("Custom size 1 height (px)").fill("920");
  await page.getByLabel("Custom size 1 count").fill("2");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".campaign-review-formats")).toContainText(
    "Storefront display · 1460 × 920 px",
  );
  await page
    .getByRole("button", { name: "Create 6 designs", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your collection is ready" }),
  ).toBeVisible();
  expect(api.requests.map((b) => [b.width, b.height, b.pages])).toEqual([
    [1200, 1600, 1],
    [2480, 3508, 1],
    [1080, 1080, 2],
    [1460, 920, 2],
  ]);
  for (const body of api.requests)
    expect(body.designProfile).toEqual(personalStyle);
  const all = await records(page),
    campaign = all.find((v) => v.folders),
    folder = campaign.folders[0];
  expect(folder.batches[0].tasks.at(-1).format).toMatchObject({
    name: "Storefront display",
    width: 1460,
    height: 920,
  });
  expect(
    all
      .filter((v) => v.campaignId === campaign.id)
      .map((v) => [v.width, v.height])
      .sort(),
  ).toEqual(
    [
      [1200, 1600],
      [2480, 3508],
      [1080, 1080],
      [1080, 1080],
      [1460, 920],
      [1460, 920],
    ].sort(),
  );
  await page.reload();
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await page
    .locator(".campaign-navigation")
    .getByRole("button", { name: /Spring flowers/ })
    .click();
  await page
    .locator(".campaign-folder-card")
    .filter({ hasText: /Mother.*Day/ })
    .click();
  await expect(page.locator(".campaign-design-grid article")).toHaveCount(6);
});

test("custom size validation and draft recovery preserve multiple independent sizes", async ({
  page,
}) => {
  await setup(page);
  await brief(page);
  await page
    .getByRole("button", { name: "Add custom size", exact: true })
    .click();
  await page.getByLabel("Custom size 1 width (px)").fill("4096");
  await page.getByLabel("Custom size 1 height (px)").fill("4096");
  await expect(page.getByRole("alert")).toContainText("12 megapixels");
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Custom size 1 width (px)").fill("255");
  await page.getByLabel("Custom size 1 height (px)").fill("800");
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Custom size 1 width (px)").fill("1600");
  await page
    .getByRole("button", { name: "Add custom size", exact: true })
    .click();
  await page.getByLabel("Custom size 2 name").fill("Counter display");
  await page.getByLabel("Custom size 2 count").fill("3");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue saved brief", exact: true })
    .click();
  await expect(page.getByLabel("Custom size 1 width (px)")).toHaveValue("1600");
  await expect(page.getByLabel("Custom size 2 name")).toHaveValue(
    "Counter display",
  );
  await expect(page.getByLabel("Custom size 2 count")).toHaveValue("3");
  await page
    .getByRole("button", { name: "Remove custom size 1", exact: true })
    .click();
  await expect(page.getByLabel("Custom size 1 name")).toHaveValue(
    "Counter display",
  );
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeEnabled();
});
test("campaign and folder intent reach every platform, images remain editable, and collections persist", async ({
  page,
}) => {
  const api = await setup(page);
  await brief(page);
  await page.getByLabel("Instagram post count").fill("2");
  await page
    .getByLabel("Upload campaign images")
    .setInputFiles("public/photos/plants.jpg");
  await expect(page.locator(".campaign-image-grid img")).toHaveCount(1);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create 4 designs", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your collection is ready" }),
  ).toBeVisible();
  await expect(page.locator(".campaign-design-grid article")).toHaveCount(4);
  expect(api.requests.map((b) => [b.width, b.height, b.pages])).toEqual([
    [1080, 1350, 2],
    [1200, 630, 1],
    [1200, 627, 1],
  ]);
  for (const b of api.requests) {
    expect(b.prompt).toContain("Introduce local flower delivery");
    expect(b.prompt).toContain("Celebrate thoughtful hand-tied bouquets");
    expect(b.prompt).toContain("Hand-tied locally.");
    expect(b.campaignImages[0].src).toMatch(/^data:image\/png;base64,/);
  }
  expect(api.requests[1].prompt).toContain("APPROVED VISUAL SYSTEM");
  const all = await records(page),
    campaign = all.find((v) => v.folders),
    docs = all.filter((v) => v.campaignId === campaign.id);
  expect(docs).toHaveLength(4);
  expect(docs.every((d) => d.folderId === campaign.folders[0].id)).toBe(true);
  expect(
    docs[0].pages[0].data.objects.some((o: any) => o.type === "Image"),
  ).toBe(true);
  await page.locator(".campaign-design-grid article button").first().click();
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await expect(page.locator(".campaign-design-grid article")).toHaveCount(4);
  await page
    .getByLabel("Move existing design to folder")
    .selectOption({ label: "A little growth" });
  await page
    .getByRole("button", { name: "Move to folder", exact: true })
    .click();
  await expect(page.locator(".campaign-design-grid article")).toHaveCount(5);
  await page.reload();
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await expect(page.locator(".campaign-design-grid article")).toHaveCount(5);
});
test("a failed format resumes without regenerating completed designs", async ({
  page,
}) => {
  const api = await setup(page);
  api.failNextFacebook();
  await brief(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create 3 designs", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume collection", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".campaign-design-grid article")).toHaveCount(1);
  const first = (await records(page)).find((v) => v.campaignId).id;
  await page
    .getByRole("button", { name: "Resume collection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your collection is ready" }),
  ).toBeVisible();
  await expect(page.locator(".campaign-design-grid article")).toHaveCount(3);
  expect(api.requests.filter((b) => b.width === 1080)).toHaveLength(1);
  expect(api.requests.filter((b) => b.height === 630)).toHaveLength(2);
  expect((await records(page)).filter((v) => v.id === first)).toHaveLength(1);
});
test("an interrupted running collection resumes the saved job after reload and retains its folder", async ({
  page,
}) => {
  const api = await setup(page);
  api.hold();
  await brief(page);
  await page.getByLabel("Facebook post count").fill("0");
  await page.getByLabel("LinkedIn post count").fill("0");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create 1 design", exact: true })
    .click();
  await expect.poll(() => api.requests.length).toBe(1);
  await expect
    .poll(
      async () =>
        (await records(page)).find((v) => v.folders)?.folders[0].batches[0]
          .tasks[0].jobId,
    )
    .toBeTruthy();
  api.release();
  await page.reload();
  await expect
    .poll(async () => (await records(page)).filter((v) => v.campaignId).length)
    .toBe(1);
  expect(api.requests).toHaveLength(1);
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await page.getByRole("button", { name: "Spring flowers 1 folder" }).click();
  await page.locator(".campaign-folder-card").click();
  await expect(page.locator(".campaign-design-grid article")).toHaveCount(1);
});
test("wizard saves a draft, works on a phone, and saves a folder without starting AI", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await setup(page);
  await brief(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect(
    await page
      .locator(".campaign-studio")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A home for this part of the story." }),
  ).toBeVisible();
  expect(api.requests).toHaveLength(0);
  await page
    .getByRole("button", { name: "Create designs", exact: true })
    .click();
  await expect(page.getByLabel("Folder intent")).toHaveValue(
    "Celebrate thoughtful hand-tied bouquets and invite gift orders.",
  );
});

test("an additional folder inherits the campaign objective and creates its own collection", async ({
  page,
}) => {
  const api = await setup(page);
  await brief(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await expect(page.locator(".campaign-parent")).toContainText(
    "Introduce local flower delivery",
  );
  await expect(page.getByLabel("Folder intent", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("Folder name", { exact: true })
    .fill("Wedding enquiries");
  await page
    .getByLabel("Folder intent", { exact: true })
    .fill("Invite engaged couples to enquire about seasonal wedding flowers.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Facebook post count").fill("0");
  await page.getByLabel("LinkedIn post count").fill("0");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create 1 design", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your collection is ready" }),
  ).toBeVisible();
  expect(api.requests[0].prompt).toContain("Introduce local flower delivery");
  expect(api.requests[0].prompt).toContain("Invite engaged couples");
  expect(api.requests[0].prompt).not.toContain("Celebrate thoughtful");
  const c = (await records(page)).find((v) => v.folders);
  expect(c.folders).toHaveLength(2);
  expect((await records(page)).find((v) => v.campaignId).folderId).toBe(
    c.folders.find((f: any) => f.name === "Wedding enquiries").id,
  );
});

test("a pause request survives reload and resumes the original in-flight job", async ({
  page,
}) => {
  const api = await setup(page);
  api.hold();
  await brief(page);
  await page.getByLabel("Facebook post count").fill("0");
  await page.getByLabel("LinkedIn post count").fill("0");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create 1 design", exact: true })
    .click();
  await expect.poll(() => api.requests.length).toBe(1);
  await page
    .getByRole("button", { name: "Pause after current format", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await records(page)).find((v) => v.folders)?.folders[0].batches[0]
          .pauseRequested,
    )
    .toBe(true);
  await page.reload();
  await expect
    .poll(
      async () =>
        (await records(page)).find((v) => v.folders)?.folders[0].batches[0]
          .status,
    )
    .toBe("paused");
  api.release();
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await page
    .getByRole("button", { name: "Spring flowers 1 folder", exact: true })
    .click();
  await page.locator(".campaign-folder-card").click();
  await page
    .getByRole("button", { name: "Resume collection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your collection is ready" }),
  ).toBeVisible();
  expect(api.requests).toHaveLength(1);
});

test("the optional campaign photo becomes an editable image in the design request", async ({
  page,
}) => {
  const api = await setup(page);
  let photoBrief: any;
  await page.route("**/photos", async (r) => {
    photoBrief = r.request().postDataJSON();
    await r.fulfill({
      json: {
        id: photoBrief.clientRequestId,
        status: "completed",
        result: {
          src:
            "data:image/jpeg;base64," +
            (await readFile("public/photos/plants.jpg")).toString("base64"),
        },
      },
    });
  });
  await brief(page);
  await page.getByLabel("Facebook post count").fill("0");
  await page.getByLabel("LinkedIn post count").fill("0");
  await page.getByLabel("Create a campaign photo with AI").check();
  await page
    .getByLabel("Campaign photo direction")
    .fill("Seasonal flowers on an ivory counter, space for a headline.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create 1 design", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your collection is ready" }),
  ).toBeVisible();
  expect(photoBrief.prompt).toContain("Introduce local flower delivery");
  expect(photoBrief.prompt).toContain("Celebrate thoughtful hand-tied");
  expect(api.requests[0].campaignImages).toHaveLength(1);
  expect(api.requests[0].campaignImages[0].src).toMatch(
    /^data:image\/png;base64,/,
  );
  expect(
    (await records(page))
      .find((v) => v.campaignId)
      .pages[0].data.objects.some((o: any) => o.type === "Image"),
  ).toBe(true);
});
