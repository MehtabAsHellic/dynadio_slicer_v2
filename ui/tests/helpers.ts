import { expect, type Page } from '@playwright/test';

export type Theme = 'light' | 'dark';

export async function openApp(page: Page, theme: Theme = 'light'): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('dynadio.theme', value);
    window.localStorage.removeItem('dynadio.recent');
  }, theme);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.topbar');
}

export async function loadSample(page: Page, name: 'Jet' | 'Cube' | 'Torus' = 'Jet'): Promise<void> {
  await page.locator('.demo-card').filter({ hasText: name }).first().click();
  await page.waitForFunction(
    () => {
      const chip = document.querySelector('.viewport-chip');
      return !!chip && chip.textContent.includes('mm');
    },
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(250);
}

export async function dismissToasts(page: Page): Promise<void> {
  const close = page.locator('.toast .icon-btn');
  for (let i = 0; i < 8; i += 1) {
    if ((await close.count()) === 0) break;
    await close.first().click({ timeout: 1000 }).catch(() => undefined);
    await page.waitForTimeout(80);
  }
}

export async function slice(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Slice/i }).first().click();
  await page.waitForSelector('.footer-progress');
  await page.waitForFunction(
    () => document.querySelector('.statusbar')?.textContent?.includes('Points'),
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(350);
  await dismissToasts(page);
}

export async function openInspector(page: Page, tab = 'strokes'): Promise<void> {
  const drawer = page.getByTestId('inspector');
  if (!(await drawer.isVisible())) {
    await page.getByRole('button', { name: 'Open the Inspector' }).click();
  }
  await page.getByTestId(`inspector-${tab}`).click();
  await page.waitForTimeout(150);
}

interface ClipIssue {
  text: string;
  tag: string;
  className: string;
  axis: 'x' | 'y';
  rect: number;
  limit: number;
}

/**
 * Every visible text node must be fully inside every ancestor that clips its
 * overflow. Scroll containers are fine (their content is reachable); hidden
 * overflow is not. Code panes and visually hidden helpers are intentionally
 * scrollable or clipped and are excluded by class.
 */
export async function clippedText(page: Page): Promise<ClipIssue[]> {
  return page.evaluate(() => {
    const EXCLUDED =
      '.gcode-view, .gcode-line, .code-preview, .sr-only, .visually-hidden, .select-field, .legend-select, .stroke-range, .layer-rail input, .section-control input';
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION', 'TITLE']);
    const issues: ClipIssue[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent?.trim() ?? '';
      if (!text) {
        node = walker.nextNode();
        continue;
      }
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) {
        node = walker.nextNode();
        continue;
      }
      if (parent.closest(EXCLUDED)) {
        node = walker.nextNode();
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0.5 && rect.height > 0.5);
      if (!rects.length) {
        node = walker.nextNode();
        continue;
      }
      let hidden = false;
      let ancestor: HTMLElement | null = parent;
      while (ancestor && ancestor !== document.body) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          hidden = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (hidden) {
        node = walker.nextNode();
        continue;
      }
      let clipper: HTMLElement | null = parent;
      while (clipper && clipper !== document.body) {
        const style = getComputedStyle(clipper);
        const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
        const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
        if (clipsX || clipsY) {
          const box = clipper.getBoundingClientRect();
          for (const rect of rects) {
            if (clipsX && (rect.left < box.left - 1 || rect.right > box.right + 1)) {
              issues.push({
                text: text.slice(0, 48),
                tag: clipper.tagName,
                className: String(clipper.className).slice(0, 60),
                axis: 'x',
                rect: Math.round(rect.left),
                limit: Math.round(box.left),
              });
              break;
            }
            if (clipsY && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) {
              issues.push({
                text: text.slice(0, 48),
                tag: clipper.tagName,
                className: String(clipper.className).slice(0, 60),
                axis: 'y',
                rect: Math.round(rect.top),
                limit: Math.round(box.top),
              });
              break;
            }
          }
        }
        clipper = clipper.parentElement;
      }
      node = walker.nextNode();
    }
    return issues;
  });
}

export async function assertNoClippedText(page: Page): Promise<void> {
  const issues = await clippedText(page);
  expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
}

const CONTROL_SELECTOR =
  'button, [role="button"], a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Give every visible, enabled control a stable probe id, then walk the page
 * with Tab until every probe has received focus at least once.
 */
export async function assertTabReachable(page: Page): Promise<number> {
  const count = await page.evaluate((selector) => {
    document.querySelectorAll<HTMLElement>('[data-tab-probe]').forEach((element) => {
      element.removeAttribute('data-tab-probe');
    });
    // A modal is its own focus scope; the rest of the window is inert while
    // it is open, so only its controls are expected to receive focus.
    const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
    });
    const scope: ParentNode = dialog ?? document;
    const elements = Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter((element) => {
      if (element.closest('[inert]')) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      if ((element as HTMLButtonElement).disabled) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      return true;
    });
    elements.forEach((element, index) => element.setAttribute('data-tab-probe', String(index)));
    if (elements.length) elements[0].focus();
    else if (dialog) dialog.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
    return elements.length;
  }, CONTROL_SELECTOR);

  const seen = new Set<number>();
  await page.evaluate(() => {
    const store = window as unknown as {
      __dynadioSeen?: number[];
      __dynadioTabHandler?: (event: FocusEvent) => void;
    };
    store.__dynadioSeen = [];
    if (store.__dynadioTabHandler) {
      document.removeEventListener('focusin', store.__dynadioTabHandler, true);
    }
    store.__dynadioTabHandler = () => {
      const active = document.activeElement as HTMLElement | null;
      const value = active?.getAttribute('data-tab-probe');
      if (value != null && store.__dynadioSeen && !store.__dynadioSeen.includes(Number(value))) {
        store.__dynadioSeen.push(Number(value));
      }
    };
    document.addEventListener('focusin', store.__dynadioTabHandler, true);
  });
  const seen0 = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const value = active?.getAttribute('data-tab-probe');
    return value == null ? null : Number(value);
  });
  if (seen0 != null) seen.add(seen0);

  // One Tab per probe plus a few extra presses to wrap around. The focusin
  // recorder lives in the page, keeping each press a single protocol call.
  const limit = count + 6;
  for (let press = 0; press < limit; press += 1) {
    await page.keyboard.press('Tab');
  }
  const recorded = await page.evaluate(
    () => (window as unknown as { __dynadioSeen?: number[] }).__dynadioSeen ?? [],
  );
  recorded.forEach((index) => seen.add(index));
  expect([...Array(count).keys()].filter((index) => !seen.has(index)), 'controls never reached with Tab').toEqual([]);
  return count;
}