import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3100";
const screenshot = async (name) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `docs/${name}.png`,
    fullPage: name !== "mobile",
  });
};
try {
  await page.goto(base);
  if (process.env.TEST_ADMIN_PASSWORD) {
    await page.getByLabel("运营密码").fill(process.env.TEST_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "登录工作台", exact: true }).click();
    await page.getByRole("heading", { name: /让每一次联系/ }).waitFor();
    await page.reload();
  }
  await page.getByRole("heading", { name: /让每一次联系/ }).waitFor();
  assert.ok((await page.locator("body").innerText()).includes("FormWink"));
  await page.getByRole("button", { name: "客户", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索客户" }).fill("alex");
  await page.getByText("alex.morgan@example.com", { exact: true }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByText("alex.morgan@example.com", { exact: true }).click();
  await page.getByRole("dialog", { name: "客户详情" }).waitFor();
  assert.ok(
    (await page.getByRole("dialog").innerText()).includes(
      "DEMO · 模拟订阅记录",
    ),
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await screenshot("customers");
  await page.getByRole("button", { name: "客户分群", exact: true }).click();
  await page.getByRole("button", { name: "创建分群", exact: true }).click();
  await page.getByLabel("分群名称").fill("浏览器验收分群");
  await page.getByRole("button", { name: "保存分群" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /浏览器验收分群/ }).click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "邮件模板", exact: true }).click();
  await page.getByRole("button", { name: /很高兴，与你相遇/ }).click();
  await page.getByRole("dialog").waitFor();
  await page
    .frameLocator("iframe")
    .getByText("FORMWINK", { exact: true })
    .first()
    .waitFor();
  assert.ok(
    (await page.frameLocator("iframe").locator("body").innerText()).includes(
      "Unsubscribe",
    ),
  );
  await page.getByRole("button", { name: "切换暗色模拟预览" }).click();
  await screenshot("template");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: /自动化工作流/ }).click();
  await page.getByRole("button", { name: /欢迎新朋友/ }).click();
  await page.locator(".react-flow__node").first().waitFor();
  assert.equal(await page.locator(".react-flow__node").count(), 3);
  await page.getByRole("button", { name: "校验", exact: true }).click();
  await page.getByText("✓ 图结构与模板校验通过").waitFor();
  await page.getByRole("button", { name: "关闭结果" }).click();
  await page.getByRole("button", { name: "模拟", exact: true }).click();
  await page.getByText("模拟执行轨迹").waitFor();
  await screenshot("workflow");
  await page.getByRole("button", { name: "关闭结果" }).click();
  await page.getByRole("button", { name: "返回工作流" }).click();
  await page.getByRole("button", { name: "邮件活动", exact: true }).click();
  await page.getByText("十月灵感手记", { exact: true }).first().waitFor();
  await screenshot("campaigns");
  await page.getByRole("button", { name: "事件日志", exact: true }).click();
  await page.getByRole("button", { name: "操作日志", exact: true }).click();
  await page.locator("tbody tr").first().waitFor();
  await page.getByRole("button", { name: "任务与重试", exact: true }).click();
  await page.getByRole("button", { name: "设置与连接", exact: true }).click();
  await page.getByRole("switch", { name: "真实邮件发送" }).click();
  await page.getByRole("status").waitFor();
  await screenshot("settings");
  await page.getByRole("button", { name: "总览", exact: true }).click();
  await screenshot("overview");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("mobile");
  const mobile = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    mobile.scroll <= mobile.width,
    `Mobile overflow ${JSON.stringify(mobile)}`,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: 8 pages, contact search/details, segment create/delete, email iframe/dark preview, workflow validation/simulation, settings gates, mobile overflow.",
  );
} finally {
  await browser.close();
}
