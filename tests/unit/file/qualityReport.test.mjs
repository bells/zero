import assert from "node:assert/strict";
import test from "node:test";
const { aggregateQualityIssues, qualityIssue, normalizeFontFamily } = await import(`${process.env.ZERO_QUALITY_TEST_ROOT ?? "/private/tmp/zero-tests"}/plugins/file/engine/qualityReport.js`);

test("quality reports aggregate all occurrences and bound retained locations without losing truncation", () => {
  const report = aggregateQualityIssues(Array.from({length: 150}, (_, i) => qualityIssue("ocrUsed", {pageNumbers:[i+1]})));
  assert.equal(report.length, 1);
  assert.equal(report[0].occurrences, 150);
  assert.equal(report[0].pageNumbers.length, 100);
  assert.equal(report[0].truncated, true);
  assert.deepEqual(report[0].pageNumbers.slice(0,3), [1,2,3]);
});
test("quality reports distinguish source pages and sections and reject private paths", () => {
  const report = aggregateQualityIssues([
    qualityIssue("fontMissing", {sectionIndexes:[0],fontFamilies:["Missing Synthetic Font", "/Users/private/font.ttf", "https://fonts.invalid/font"]}),
    qualityIssue("fontInspectionIncomplete"),
  ]);
  assert.deepEqual(report[0].sectionIndexes,[0]);
  assert.equal(report[0].pageNumbers,undefined);
  assert.deepEqual(report[0].fontFamilies,["Missing Synthetic Font"]);
  assert.equal(report[0].truncated,true);
  assert.equal(report[1].occurrences,1);
});
test("PDF subset prefixes normalize while valid family names remain intact", () => {
  assert.equal(normalizeFontFamily("ABCDEF+Noto Sans CJK SC"), "Noto Sans CJK SC");
  assert.equal(normalizeFontFamily("Abc+Family"), "Abc+Family");
  assert.equal(normalizeFontFamily(" /Users/secret/font "), undefined);
});

test("unknown quality codes are grouped safely and invalid occurrence values remain finite", () => {
  const issues=aggregateQualityIssues([{code:"<private>body/path",occurrences:NaN,truncated:false},{code:"futureCode",occurrences:2,truncated:false}]);
  assert.equal(issues.length,1);assert.equal(issues[0].code,"unknown");assert.equal(issues[0].occurrences,3);assert.equal(issues[0].truncated,true);
});

test("structured action errors retain bounded quality facts and discard invalid report fields", async () => {
 const {normalizeFileConversionError}=await import(`${process.env.ZERO_QUALITY_TEST_ROOT ?? "/private/tmp/zero-tests"}/plugins/file/fileServiceCore.js`);
 const error=normalizeFileConversionError({code:"unsupportedInput",message:"Unsupported",retryable:false,qualityIssues:[{code:"fontMissing",fontFamilies:["Synthetic Missing Font"],occurrences:1,truncated:false,body:"must not cross"}]});
 assert.equal(error.qualityIssues.length,1);assert.deepEqual(error.qualityIssues[0].fontFamilies,["Synthetic Missing Font"]);assert.equal(error.qualityIssues[0].body,undefined);
});

test("font families containing DEL or Unicode control characters cannot cross the report boundary", () => {
  for (const value of ["Synthetic\u007fFont", "Synthetic\u0085Font"]) {
    assert.equal(normalizeFontFamily(value), undefined);
    assert.equal(aggregateQualityIssues([qualityIssue("fontMissing", {fontFamilies: [value]})])[0].truncated, true);
  }
});
