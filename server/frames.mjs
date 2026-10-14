import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const devices = JSON.parse(
  readFileSync(new URL("../shared/devices.json", import.meta.url), "utf8"),
);
export function validateCapture(value) {
  if (!value || typeof value.url !== "string" || value.url.length > 2048)
    throw new Error("Enter a website address.");
  let address = value.url.trim();
  if (
    /^[a-z][a-z\d+.-]*:/i.test(address) &&
    !/^https?:\/\//i.test(address) &&
    !/^(localhost|127\.0\.0\.1):\d/i.test(address)
  )
    throw new Error("Use an HTTP or HTTPS website address.");
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(address))
    address = /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(address)
      ? "http://" + address
      : "https://" + address;
  let url;
  try {
    url = new URL(address);
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS address.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use an HTTP or HTTPS address without embedded credentials.",
    );
  const device = devices.find((d) => d.id === value.device);
  if (!device) throw new Error("Choose a supported device frame.");
  return { url: url.href, device };
}
export async function captureWebsite(value, { signal } = {}) {
  const { url, device } = validateCapture(value);
  if (process.env.FORMA_CAPTURE_ENDPOINT && process.env.FORMA_CAPTURE_TOKEN) {
    const response = await fetch(process.env.FORMA_CAPTURE_ENDPOINT, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Forma-Capture": process.env.FORMA_CAPTURE_TOKEN },
      body: JSON.stringify({ url, device: device.id }), signal: signal || AbortSignal.timeout(40000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Website capture failed.");
    return result;
  }
  const browser = await chromium.launch({
    ...(process.platform === "win32" ? { channel: "msedge" } : {}),
    headless: true,
    timeout: 15000,
  });
  const abort = () => void browser.close();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) throw new Error("Capture cancelled.");
    const context = await browser.newContext({
      viewport: device.viewport,
      deviceScaleFactor: 1,
      isMobile: device.mobile,
      hasTouch: device.mobile,
      colorScheme: "light",
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on("dialog", (dialog) => void dialog.dismiss());
    context.on("page", (popup) => {
      if (popup !== page) void popup.close();
    });
    await context.route("**/*", (route) => {
      const request = route.request(),
        address = new URL(request.url());
      // A requested local website is allowed. Browsing never receives the host user's cookies or files.
      if (
        !["http:", "https:"].includes(address.protocol) ||
        (request.isNavigationRequest() &&
          !["GET", "HEAD"].includes(request.method()))
      )
        return route.abort();
      return route.continue();
    });
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    if (response && response.status() >= 400)
      throw new Error(
        `The website returned ${response.status()}. Check its address or upload a screen image.`,
      );
    await page
      .waitForLoadState("networkidle", { timeout: 4500 })
      .catch(() => {});
    await page.evaluate(() =>
      Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]),
    );
    const bytes = await page.screenshot({
      type: "png",
      animations: "disabled",
      timeout: 10000,
    });
    return {
      src: "data:image/png;base64," + bytes.toString("base64"),
      url: page.url(),
      title: (await page.title()).slice(0, 200) || new URL(url).hostname,
      device: device.id,
      width: device.viewport.width,
      height: device.viewport.height,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    signal?.removeEventListener("abort", abort);
    await browser.close();
  }
}
export function createFrameService({ json }) {
  let active = false;
  return {
    async handle(req, res, url) {
      if (req.method !== "POST" || url.pathname !== "/frames/capture")
        return false;
      if (active) {
        json(res, 409, {
          error: "Another screen is being captured. Please wait a moment.",
        });
        return true;
      }
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        json(res, 415, { error: "JSON required." });
        return true;
      }
      const controller = new AbortController();
      let ownsCapture = false;
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      try {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 5000)
            throw new Error("The address is too long.");
        }
        const value = JSON.parse(raw);
        validateCapture(value);
        if (active) {
          json(res, 409, { error: "Another screen is being captured." });
          return true;
        }
        active = true;
        ownsCapture = true;
        const result = await captureWebsite(value, {
          signal: controller.signal,
        });
        if (!res.destroyed) json(res, 200, result);
      } catch (error) {
        if (!res.destroyed)
          json(res, 400, {
            error: controller.signal.aborted
              ? "Capture cancelled."
              : error.message.includes("Timeout")
                ? "The website took too long. Try again or upload a screen image."
                : error.message,
          });
      } finally {
        if (ownsCapture) active = false;
      }
      return true;
    },
  };
}
