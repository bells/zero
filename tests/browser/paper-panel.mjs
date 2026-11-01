import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium, webkit } = await import(process.env.PAPER_PLAYWRIGHT_MODULE || "playwright");
const engine = process.env.PAPER_BROWSER === "webkit" ? webkit : chromium;
const browser = await engine.launch({headless:true, ...(process.env.PAPER_BROWSER_PATH ? {executablePath:process.env.PAPER_BROWSER_PATH} : {})});
const output = process.env.PAPER_OUTPUT || "/tmp/zero-paper-panel";
await fs.mkdir(output,{recursive:true});
const errors = [], measurements = [], compactGaps = [];
try {
  const page = await browser.newPage({viewport:{width:1000,height:750}});
  await page.clock.setFixedTime(new Date("2026-11-01T01:30:00Z"));
  page.on("pageerror",error => errors.push(String(error)));
  page.on("console",message => { if (message.type() === "error") errors.push(message.text()); });
  const origin = process.env.PAPER_TEST_ORIGIN || "http://127.0.0.1:1420";
  for (const language of ["zh-CN","en-US"]) {
    await page.setViewportSize({width:1000,height:750});
    const labels = language === "zh-CN" ? {older:"查看更早的壁纸",latest:"回到最新",refresh:"立即刷新"} : {older:"View an older wallpaper",latest:"Return to latest",refresh:"Refresh now"};
    await page.goto(`${origin}/tests/fixtures/paper/panel.html?language=${language}`);
    await page.locator(".wallpaper-preview-button img").waitFor();
    await page.waitForFunction(() => !document.querySelector('.bing-wallpaper-panel').getAttribute('aria-busy')?.includes('true'));
    const initial = await page.evaluate(() => {
      const preview = document.querySelector('.wallpaper-preview-button').getBoundingClientRect();
      const content = document.querySelector('.wallpaper-content');
      const meta = document.querySelector('.wallpaper-meta').getBoundingClientRect();
      return {width:preview.width,track:content.getBoundingClientRect().width-meta.width-parseFloat(getComputedStyle(content).columnGap)};
    });
    assert.ok(Math.abs(initial.width - initial.track) < 1, `initial preview ${initial.width}px must fill the ${initial.track}px media space`);
    for (const label of [labels.latest,labels.refresh]) {
      const action = page.getByRole("button",{name:label,exact:true});
      assert.equal(await action.locator("svg").count(),1,"quick actions use named icons");
      assert.equal(await action.locator("xpath=..").getAttribute("class"),"wallpaper-actions","quick actions share the arrow toolbar");
    }
    await page.getByRole("button",{name:labels.older,exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.wallpaper-meta > strong')?.textContent === 'Older image');
    const latest = page.getByRole("button",{name:labels.latest,exact:true});
    await latest.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('.wallpaper-meta > strong')?.textContent === 'Latest image');
    const checks = () => page.evaluate(() => window.paperCalls.filter(c => c.cmd === "refresh_bing_wallpapers").length);
    const previous = await checks();
    await page.getByRole("button",{name:labels.refresh,exact:true}).click();
    await page.waitForFunction(before => window.paperCalls.filter(c => c.cmd === "refresh_bing_wallpapers").length > before,previous);
    await page.waitForFunction(() => !document.querySelector('.wallpaper-refresh-action')?.hasAttribute('disabled'));
    const callsBeforeResize = await checks();
    for (const width of [1600,800,1400,1000]) {
      await page.setViewportSize({width,height:900});
      const geometry = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
        const preview = document.querySelector('.wallpaper-preview-button').getBoundingClientRect();
        const content = document.querySelector('.wallpaper-content');
        const track = content.getBoundingClientRect().width - document.querySelector('.wallpaper-meta').getBoundingClientRect().width - parseFloat(getComputedStyle(content).columnGap);
        resolve({width:innerWidth,previewWidth:preview.width,previewHeight:preview.height,track,contentWidth:content.getBoundingClientRect().width,contentHeight:content.getBoundingClientRect().height});
      })));
      measurements.push(geometry);
      assert.ok(geometry.contentHeight + 1 >= geometry.previewHeight,"the image row height follows its resized preview in the first frame");
      if (width >= 1000) assert.ok(geometry.previewWidth / geometry.contentWidth >= 0.66,"the main preview uses at least two thirds of its workspace");
      assert.ok(Math.abs(geometry.previewWidth - geometry.track) < 1,"preview fills its current media space in the first frame");
      assert.ok(Math.abs(geometry.previewWidth / geometry.previewHeight - 16/9) < 0.02,`preview keeps its ratio on resize: ${JSON.stringify(geometry)}`);
      if (width === 1600) await page.screenshot({path:`${output}/main-maximized-${language}.png`});
    }
    assert.equal(await checks(),callsBeforeResize,"resizing does not refetch wallpaper");
    assert.equal(await page.evaluate(() => window.paperCalls.some(c => c.cmd === "apply_bing_wallpaper")),false,"navigation and refresh do not apply wallpaper");
    await page.screenshot({path:`${output}/main-${language}.png`});
    for (const [surface,width,height] of [["paper",400,360],["tray",360,560],["tray",320,560]]) {
      await page.setViewportSize({width,height});
      await page.goto(`${origin}/tests/fixtures/paper/panel.html?surface=${surface}&language=${language}`);
      await page.locator('.wallpaper-preview-button img').waitFor();
      assert.equal(await page.locator('.paper-preview-controls').count(),0,"no separate row above the image");
      await page.locator('.wallpaper-last-checked').waitFor();
      const freshness = await page.evaluate(() => {
        const source = document.querySelector('.wallpaper-source');
        const checked = document.querySelector('.wallpaper-last-checked');
        const sourceRect = source.getBoundingClientRect();
        const checkedRect = checked.getBoundingClientRect();
        return {followsBing:source.nextElementSibling === checked,sameRow:Math.abs(sourceRect.y-checkedRect.y)<3,toTheRight:checkedRect.x>=sourceRect.right,duplicate:document.querySelector('.paper-runtime-status')?.textContent.includes('2026') ?? false};
      });
      assert.ok(freshness.followsBing,"the whole last-check label and time follow Bing");
      assert.equal(freshness.duplicate,false,"normal freshness is not repeated below the image");
      if (width === 400) assert.ok(freshness.sameRow && freshness.toTheRight,"Paper freshness fits to the right of Bing");
      const layout = await page.evaluate(() => {
        const toolbar = document.querySelector('.wallpaper-actions').getBoundingClientRect();
        const panel = document.querySelector('.bing-wallpaper-panel');
        return {toolbarRight:toolbar.right,width:innerWidth,overflow:panel.scrollWidth-panel.clientWidth,verticalOverflow:panel.scrollHeight-panel.clientHeight,bottomSpace:panel.getBoundingClientRect().bottom-document.querySelector('.wallpaper-meta').getBoundingClientRect().bottom};
      });
      assert.ok(layout.toolbarRight <= width,"toolbar stays in the compact surface");
      assert.ok(layout.overflow <= 1,"compact panels have no horizontal overflow");
      if(surface === "paper") {
        assert.ok(layout.verticalOverflow <= 1,"the compact Paper window fits normal content");
        assert.ok(layout.bottomSpace >= 0 && layout.bottomSpace <= 24,`Paper bottom space stays compact: ${layout.bottomSpace}px`);
        const gap = await page.evaluate(() => document.querySelector('.wallpaper-meta-topline').getBoundingClientRect().top - document.querySelector('.wallpaper-preview-button').getBoundingClientRect().bottom);
        compactGaps.push({language,gap});
        assert.ok(gap >= 0 && gap <= 10,`Paper metadata stays close to its image: ${gap}px gap`);
      }
      await page.screenshot({path:`${output}/${surface}-${width}-${language}.png`});
    }
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:process.env.PAPER_BROWSER || "chromium",measurements,compactGaps,errors},null,2));
} finally {await browser.close();}
