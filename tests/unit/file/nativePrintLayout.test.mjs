import assert from "node:assert/strict";
import test from "node:test";
const { nativePrintGeometry } = await import(`${process.env.ZERO_QUALITY_TEST_ROOT ?? "/private/tmp/zero-tests"}/plugins/file/engine/nativePrintLayout.js`);
test("Windows uses unscaled CSS pixels and rejects mixed geometry before printing", () => {
 const a4={x:0,y:0,width:793.7,height:1122.5};
 assert.equal(nativePrintGeometry("windows",[a4])[0].width,793.7);
 assert.throws(()=>nativePrintGeometry("windows",[a4,{...a4,width:1056,height:816}]),/unsupportedInput/);
});
test("macOS converts CSS pixels to points once and retains mixed paper geometry", () => {
 const pages=nativePrintGeometry("macos",[{x:0,y:0,width:800,height:1100},{x:0,y:1100,width:1100,height:800}]);
 assert.equal(pages[0].width,600);assert.equal(pages[1].height,600);assert.equal(pages[1].y,825);
});
test("native layout rejects non-finite, empty and excessive page geometries", () => {
 for(const pages of [[],[{x:0,y:0,width:NaN,height:100}],Array.from({length:513},()=>({x:0,y:0,width:100,height:100}))])assert.throws(()=>nativePrintGeometry("macos",pages),/unsupportedInput/);
});
