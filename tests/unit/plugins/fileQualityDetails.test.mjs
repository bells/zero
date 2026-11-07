import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FileQualityDetails} from '/private/tmp/zero-tests/plugins/file/FileQualityDetails.js';
import {createFileTranslator} from '/private/tmp/zero-tests/plugins/file/i18n.js';
function render(language,issues){const translate=createFileTranslator(language);return renderToStaticMarkup(createElement(FileQualityDetails,{issues,t:(key,values)=>Object.entries(values??{}).reduce((text,[name,value])=>text.replaceAll(`{${name}}`,String(value)),translate(key))}));}
test('quality details relocalize counts and distinguish pages from one-based displayed sections',()=>{
 const issues=[{code:'fontMissing',pageNumbers:[3],fontFamilies:['Fixture Family'],occurrences:7,truncated:true},{code:'layoutReflowed',sectionIndexes:[1],occurrences:1,truncated:false}];
 const original=JSON.stringify(issues),zh=render('zh-CN',issues),en=render('en-US',issues);
 assert.match(zh,/源文件页码 3/);assert.match(zh,/DOCX 节 2/);assert.match(zh,/共 7 处/);
 assert.match(en,/Source pages 3/);assert.match(en,/DOCX sections 2/);assert.match(en,/7 occurrences/);assert.doesNotMatch(en,/\{count\}/);
 assert.equal(JSON.stringify(issues),original);
});
test('unknown issue codes show safe generic guidance and empty reports stay absent',()=>{
 const en=render('en-US',[{code:'<script>/private/path',occurrences:1,truncated:false}]);
 assert.doesNotMatch(en,/<script>|private\/path/);assert.match(en,/quality issue unknown/i);
 assert.equal(render('en-US',[]),'');
});
