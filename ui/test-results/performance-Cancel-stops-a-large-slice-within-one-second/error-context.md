# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: performance.spec.ts >> Cancel stops a large slice within one second
- Location: tests\performance.spec.ts:107:1

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 1000
Received:   1073
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic "DynaDio Slicer" [ref=e6]: DynaDio
      - button "Open an STL file (Ctrl+O)" [ref=e14] [cursor=pointer]
      - button "Save a settings profile (Ctrl+S)" [ref=e18] [cursor=pointer]
    - group "Workflow stage" [ref=e24]:
      - button "Prepare" [pressed] [ref=e25] [cursor=pointer]
      - button "Preview" [disabled] [ref=e29]
    - generic [ref=e33]:
      - button "Undo" [ref=e34] [cursor=pointer]
      - button "Redo" [disabled] [ref=e38]
      - button "Switch to dark theme" [ref=e43] [cursor=pointer]
      - button "Application settings" [ref=e47] [cursor=pointer]
  - generic [ref=e51]:
    - complementary "Model and transform" [ref=e52]:
      - generic [ref=e53]: Model
      - generic [ref=e64]:
        - generic [ref=e65]:
          - generic "torus.stl" [ref=e66]
          - generic "Every edge is shared by two triangles." [ref=e67]: Watertight
        - generic [ref=e71]:
          - generic [ref=e72]:
            - text: Size
            - generic [ref=e73]: 175.9 KB
          - generic [ref=e74]:
            - text: Triangles
            - generic [ref=e75]: 3,600
          - generic [ref=e76]:
            - text: Footprint
            - generic [ref=e77]: 39.01×39.01 mm
          - generic [ref=e78]:
            - text: Height
            - generic [ref=e79]: 9.70 mm
        - generic [ref=e80]:
          - button "Replace" [ref=e81] [cursor=pointer]
          - button "Remove" [ref=e84] [cursor=pointer]
      - generic [ref=e88]: Transform
      - generic [ref=e93]:
        - generic [ref=e94]:
          - button "Auto-orient" [ref=e95] [cursor=pointer]
          - button "Lay flat" [ref=e99] [cursor=pointer]
        - generic [ref=e103]:
          - generic [ref=e104]: Up axis
          - generic [ref=e105]: model → print Z
        - group "Up axis" [ref=e106]:
          - button "X" [ref=e107] [cursor=pointer]
          - button "Y" [ref=e108] [cursor=pointer]
          - button "Z" [pressed] [ref=e109] [cursor=pointer]
        - generic [ref=e111]:
          - generic [ref=e112]:
            - generic [ref=e113]: Move X
            - generic [ref=e115]:
              - textbox "Move X" [ref=e116]: "0"
              - generic "Drag to change the value" [ref=e117]: mm
              - generic [ref=e118]:
                - button "Increase Move X" [ref=e119] [cursor=pointer]
                - button "Decrease Move X" [ref=e122] [cursor=pointer]
          - generic [ref=e125]:
            - generic [ref=e126]: Move Y
            - generic [ref=e128]:
              - textbox "Move Y" [ref=e129]: "0"
              - generic "Drag to change the value" [ref=e130]: mm
              - generic [ref=e131]:
                - button "Increase Move Y" [ref=e132] [cursor=pointer]
                - button "Decrease Move Y" [ref=e135] [cursor=pointer]
        - generic [ref=e138]:
          - generic [ref=e139]:
            - generic [ref=e140]: Tilt about X
            - generic [ref=e141] [cursor=pointer]:
              - generic [ref=e142]: Flip
              - switch "Lean the other way" [ref=e143]
          - generic [ref=e144]:
            - slider "Tilt angle" [ref=e145]: "0"
            - generic [ref=e146]: 0°
          - generic [ref=e148]:
            - generic [ref=e149]: Exact tilt
            - generic [ref=e151]:
              - textbox "Tilt" [ref=e152]: "0"
              - generic "Drag to change the value" [ref=e153]: deg
              - generic [ref=e154]:
                - button "Increase Tilt" [ref=e155] [cursor=pointer]
                - button "Decrease Tilt" [ref=e158] [cursor=pointer]
        - generic [ref=e162]:
          - generic [ref=e163]:
            - generic [ref=e164]: Size along up axis
            - generic [ref=e166]:
              - textbox "Size along up axis" [ref=e167]: "9.7"
              - generic "Drag to change the value" [ref=e168]: mm
              - generic [ref=e169]:
                - button "Increase Size along up axis" [ref=e170] [cursor=pointer]
                - button "Decrease Size along up axis" [ref=e173] [cursor=pointer]
          - generic [ref=e176]:
            - generic [ref=e177]: Scale
            - generic [ref=e179]: 243.8%
        - group "Viewport tool" [ref=e180]:
          - button "Select" [pressed] [ref=e181] [cursor=pointer]
          - button "Move" [ref=e186] [cursor=pointer]
          - button "Rotate" [ref=e191] [cursor=pointer]
          - button "Scale" [ref=e196] [cursor=pointer]
        - generic [ref=e202]: Orbit with the mouse. Scroll to zoom; right-drag to pan.
        - generic [ref=e203]:
          - button "Reset transform" [ref=e204] [cursor=pointer]
          - generic [ref=e205]: "auto: X axis"
      - generic [ref=e206]: Print health
      - generic [ref=e212]:
        - generic [ref=e213]:
          - generic [ref=e214]: Mesh
          - generic [ref=e215]: Watertight
        - generic [ref=e216]:
          - generic [ref=e217]: Shells
          - generic [ref=e218]: "1"
        - generic [ref=e219]:
          - generic [ref=e220]: Fits the bed
          - generic [ref=e221]: "No"
        - generic [ref=e222]:
          - generic [ref=e223]: Under height limit
          - generic [ref=e224]: "Yes"
        - generic [ref=e225]:
          - generic [ref=e226]: Work area
          - generic [ref=e227]: 18.84 × 15.67 mm
    - main "3D view" [ref=e228]:
      - generic "torus.stl" [ref=e231]
      - group "View cube" [ref=e235]:
        - img "View cube" [ref=e236]:
          - button "Top view" [ref=e237] [cursor=pointer]
          - button "Front view" [ref=e238] [cursor=pointer]
          - button "Right view" [ref=e239] [cursor=pointer]
          - generic: TOP
          - generic: FRONT
          - generic: RIGHT
        - generic [ref=e240]:
          - button "ISO" [ref=e241] [cursor=pointer]
          - button "FIT" [ref=e242] [cursor=pointer]
      - group "View options" [ref=e244]:
        - button "Wireframe" [ref=e245] [cursor=pointer]
        - button "Show the bed grid" [pressed] [ref=e249] [cursor=pointer]
        - button "Section plane" [ref=e253] [cursor=pointer]
        - button "Frame the model" [ref=e258] [cursor=pointer]
      - generic [aria-hidden]:
        - generic: 2 mm
    - complementary "Process settings" [ref=e262]:
      - generic [ref=e263]: Presets
      - generic [ref=e268]:
        - button "Machine DynaDio air-pump bed" [ref=e270] [cursor=pointer]:
          - generic [ref=e271]: Machine
          - generic [ref=e275]: DynaDio air-pump bed
        - button "Needle 21G · 0.514 mm" [ref=e277] [cursor=pointer]:
          - generic [ref=e278]: Needle
          - generic [ref=e282]: 21G · 0.514 mm
        - button "Process Custom Modified from the preset" [ref=e284] [cursor=pointer]:
          - generic [ref=e285]: Process
          - generic [ref=e289]: Custom
          - generic "Modified from the preset" [ref=e290]
      - generic [ref=e291]:
        - group "Settings detail" [ref=e292]:
          - button "Simple" [pressed] [ref=e293] [cursor=pointer]
          - button "Advanced" [ref=e294] [cursor=pointer]
        - generic [ref=e295]: 9 settings
      - generic [ref=e296]:
        - generic [ref=e297]:
          - button "Model" [expanded] [ref=e298] [cursor=pointer]
          - group [ref=e306]:
            - generic [ref=e307]:
              - generic [ref=e308]:
                - generic "Size along up axis" [ref=e309]
                - note "Uniform scale so the chosen up-axis dimension becomes this size. The model is never stretched." [ref=e310]: i Uniform scale so the chosen up-axis dimension becomes this size. The model is never stretched.
              - generic [ref=e311]:
                - textbox "Size along up axis" [ref=e312]: "9.7"
                - generic "Drag to change the value" [ref=e313]: mm
                - generic [ref=e314]:
                  - button "Increase Size along up axis" [ref=e315] [cursor=pointer]
                  - button "Decrease Size along up axis" [ref=e318] [cursor=pointer]
            - generic [ref=e321]:
              - generic [ref=e322]:
                - generic "Up axis" [ref=e323]
                - note "The model axis that becomes print Z. A cyclic swap keeps the model from being mirrored." [ref=e324]: i The model axis that becomes print Z. A cyclic swap keeps the model from being mirrored.
              - combobox "Up axis" [ref=e325]:
                - option "x"
                - option "y"
                - option "z" [selected]
        - generic [ref=e326]:
          - button "Layers 1" [expanded] [ref=e327] [cursor=pointer]:
            - generic [ref=e331]: Layers
            - generic "1 changed" [ref=e332]: "1"
          - group [ref=e336]:
            - generic [ref=e337]:
              - generic [ref=e338]:
                - generic "Layer distance" [ref=e339]
                - note "Distance between horizontal cutting planes. Also the gel bead height used for estimates." [ref=e340]: i Distance between horizontal cutting planes. Also the gel bead height used for estimates.
                - generic "Changed from preset" [ref=e341]
                - button "Reset Layer distance to the preset value" [ref=e342] [cursor=pointer]
              - generic [ref=e347]:
                - textbox "Layer distance" [ref=e348]: "0.08"
                - generic "Drag to change the value" [ref=e349]: mm
                - generic [ref=e350]:
                  - button "Increase Layer distance" [ref=e351] [cursor=pointer]
                  - button "Decrease Layer distance" [ref=e354] [cursor=pointer]
        - generic [ref=e357]:
          - button "Print method" [expanded] [ref=e358] [cursor=pointer]
          - group [ref=e366]:
            - generic [ref=e367]:
              - generic [ref=e368]:
                - generic "Print method" [ref=e369]
                - note "Spiral links outlines that continue upward into one rising curve. Layered prints every outline as its own closed stroke with a pump start and stop." [ref=e370]: i Spiral links outlines that continue upward into one rising curve. Layered prints every outline as its own closed stroke with a pump start and stop.
              - combobox "Print method" [ref=e371]:
                - option "spiral" [selected]
                - option "layered"
        - button "Motion" [ref=e373] [cursor=pointer]
        - button "Pump" [ref=e380] [cursor=pointer]
        - button "Path" [ref=e388] [cursor=pointer]
  - contentinfo [ref=e395]:
    - generic "Print estimates" [ref=e396]:
      - generic [ref=e402]:
        - generic [ref=e403]: Time
        - generic [ref=e404]: —
      - generic [ref=e410]:
        - generic [ref=e411]: Gel
        - generic [ref=e412]: —
    - button "Slice" [ref=e414] [cursor=pointer]
  - status [ref=e417]:
    - generic [ref=e418]: torus.stl
    - generic [ref=e424]:
      - generic [ref=e425]: All units mm · GRBL
      - generic [ref=e427]:
        - text: Method
        - generic [ref=e428]: spiral
      - generic [ref=e430]:
        - text: Up
        - generic [ref=e431]: Z
      - generic [ref=e433]: API v1.0.0
  - generic "Notifications":
    - status [ref=e434]:
      - generic [ref=e438]:
        - generic [ref=e439]: Slicing cancelled
        - generic [ref=e440]: Your settings and the model were kept.
      - button "Dismiss notification" [ref=e441] [cursor=pointer]
```

# Test source

```ts
  20  |   );
  21  |   await page.getByRole('group', { name: 'Up axis' }).getByRole('button', { name: 'Z' }).click();
  22  |   const pitch = page.getByLabel('Layer distance').first();
  23  |   await pitch.fill('0.08');
  24  |   await pitch.press('Enter');
  25  |   await page.waitForTimeout(300);
  26  | }
  27  | 
  28  | async function measureFps(page: import('playwright').Page, durationMs = 3000): Promise<FrameStats> {
  29  |   return page.evaluate(
  30  |     (duration) =>
  31  |       new Promise<FrameStats>((resolve) => {
  32  |         const times: number[] = [];
  33  |         const start = performance.now();
  34  |         const tick = (now: number) => {
  35  |           times.push(now);
  36  |           if (now - start < duration) {
  37  |             requestAnimationFrame(tick);
  38  |             return;
  39  |           }
  40  |           const deltas: number[] = [];
  41  |           for (let i = 1; i < times.length; i += 1) deltas.push(times[i] - times[i - 1]);
  42  |           deltas.sort((a, b) => a - b);
  43  |           const average = deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length);
  44  |           resolve({
  45  |             frames: deltas.length,
  46  |             fps: Number((1000 / average).toFixed(1)),
  47  |             averageMs: Number(average.toFixed(2)),
  48  |             p95Ms: Number(deltas[Math.floor(deltas.length * 0.95)].toFixed(2)),
  49  |           });
  50  |         };
  51  |         requestAnimationFrame(tick);
  52  |       }),
  53  |     durationMs,
  54  |   );
  55  | }
  56  | 
  57  | test('300,000+ preview points render at 30 fps or better', async () => {
  58  |   test.skip(!!process.env.CI, 'This measurement needs a headed browser with a hardware GPU.');
  59  |   test.setTimeout(300_000);
  60  | 
  61  |   const browser = await chromium.launch({
  62  |     headless: false,
  63  |     args: [
  64  |       '--disable-backgrounding-occluded-windows',
  65  |       '--disable-renderer-backgrounding',
  66  |       '--disable-background-timer-throttling',
  67  |     ],
  68  |   });
  69  |   try {
  70  |     const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
  71  |     await page.bringToFront();
  72  |     await page.goto(URL, { waitUntil: 'networkidle' });
  73  |     await prepareStressModel(page);
  74  | 
  75  |     const started = Date.now();
  76  |     await page.getByRole('button', { name: /^Slice/i }).first().click();
  77  |     await page.waitForSelector('.footer-progress');
  78  |     await page.waitForFunction(
  79  |       () => document.querySelector('.statusbar')?.textContent?.includes('Points'),
  80  |       null,
  81  |       { timeout: 180_000 },
  82  |     );
  83  |     const sliceSeconds = (Date.now() - started) / 1000;
  84  |     await page.waitForTimeout(2500);
  85  | 
  86  |     const status = (await page.locator('.statusbar').textContent()) ?? '';
  87  |     const match = /Points\s*([\d,]+)/.exec(status.replace(/\s+/g, ' '));
  88  |     const points = match ? Number(match[1].replace(/,/g, '')) : 0;
  89  |     expect(points, `status bar: ${status}`).toBeGreaterThanOrEqual(300_000);
  90  | 
  91  |     const stats = await measureFps(page, 3000);
  92  |     console.log(
  93  |       `preview performance: ${points.toLocaleString('en-US')} points, ` +
  94  |         `slice ${sliceSeconds.toFixed(2)} s, ${stats.frames} frames, ` +
  95  |         `${stats.fps} fps average, p95 ${stats.p95Ms} ms`,
  96  |     );
  97  | 
  98  |     await page.getByRole('button', { name: 'Frame the model' }).click();
  99  |     await page.waitForTimeout(500);
  100 |     await page.screenshot({ path: '../artifacts/screenshots/perf-300k.png' });
  101 |     expect(stats.fps).toBeGreaterThanOrEqual(30);
  102 |   } finally {
  103 |     await browser.close();
  104 |   }
  105 | });
  106 | 
  107 | test('Cancel stops a large slice within one second', async ({ page }) => {
  108 |   test.setTimeout(120_000);
  109 |   await openApp(page, 'light');
  110 |   await prepareStressModel(page);
  111 | 
  112 |   await page.getByRole('button', { name: /^Slice/i }).first().click();
  113 |   await page.waitForSelector('.footer-progress');
  114 |   await page.waitForTimeout(250);
  115 |   const started = Date.now();
  116 |   await page.getByRole('button', { name: /Cancel/i }).click();
  117 |   await page.waitForSelector('.footer-progress', { state: 'detached', timeout: 5000 });
  118 |   const elapsed = Date.now() - started;
  119 |   console.log(`cancel returned to idle in ${elapsed} ms`);
> 120 |   expect(elapsed).toBeLessThan(1000);
      |                   ^ Error: expect(received).toBeLessThan(expected)
  121 |   await expect(page.getByText('Slicing cancelled')).toBeVisible({ timeout: 5000 });
  122 | });
```