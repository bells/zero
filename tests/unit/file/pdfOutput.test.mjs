import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
const requirePdf = createRequire(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
const canvas = requirePdf("@napi-rs/canvas");
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
globalThis.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
globalThis.document = {baseURI:pathToFileURL(process.cwd()+"/").href,createElement(name){assert.equal(name,"canvas");const value=canvas.createCanvas(1,1);value.toBlob=callback=>callback(new Blob([value.toBuffer("image/png")]));return value;}};
const {convertPdfToDocx} = await import("/private/tmp/zero-tests/plugins/file/engine/pdfToDocx.js");
const corpus=JSON.parse(fs.readFileSync("tests/fixtures/fileConversion/quality/expected.json","utf8"));
const options={assetBaseUrl:pathToFileURL(process.cwd()+"/public/file-engine/").href};
const normalize=value=>value.normalize("NFC").replace(/\s+/gu," ").trim();
const decode=value=>value.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
const paragraphs=xml=>[...xml.matchAll(/<w:p\b[^>]*>(.*?)<\/w:p>/gs)].map(match=>[...match[1].matchAll(/<w:t\b[^>]*>(.*?)<\/w:t>/gs)].map(run=>decode(run[1])).join(""));
async function convert(id,extra={}){
 const result=await convertPdfToDocx(new Uint8Array(fs.readFileSync(`tests/fixtures/fileConversion/quality/${id}.pdf`)),new AbortController().signal,async()=>{}, {...options,...extra});
 const zip=await JSZip.loadAsync(result.bytes),xml=await zip.file("word/document.xml").async("string");return{result,zip,xml};
}
for(const id of ["P01","P02","P03","P04","P05","P06","P09","P11"]){
 test(`${id} real PDF output preserves the entire expected editable body in order`,async()=>{
  const fixture=corpus.cases.find(c=>c.id===id),{result,xml,zip}=await convert(id);
  assert.equal(normalize(paragraphs(xml).join(" ")),normalize(fixture.target.fullEditableText));
  assert.doesNotMatch(xml,/w:vanish|w:webHidden/);
  for(const issue of fixture.target.warnings)assert.ok(result.qualityIssues.some(i=>i.code===issue.code),`${id}: ${issue.code}`);
  if(id==="P01") {assert.match(xml,/<w:pStyle w:val="Heading1"/);assert.match(xml,/<w:pStyle w:val="Heading2"/);assert.match(xml,/<w:jc w:val="right"/);assert.match(xml,/<w:ind w:left="480"/);}
  if(id==="P03") {assert.match(xml,/<w:tbl>/);assert.match(xml,/<w:gridSpan w:val="2"/);assert.match(xml,/<w:vMerge w:val="restart"/);assert.match(xml,/<w:vMerge w:val="continue"/);assert.equal((xml.match(/P03 Vertical/g)??[]).length,1);}
  if(id==="P05")assert.ok(xml.indexOf("P05 Before")<xml.indexOf("<w:drawing>")&&xml.indexOf("<w:drawing>")<xml.indexOf("P05 After"));
  if(id==="P06") {assert.match(xml,/<w:drawing>/);assert.doesNotMatch(xml,/<m:oMath|<c:chart|Legend A/);const media=Object.keys(zip.files).filter(name=>name.startsWith("word/media/")&&!zip.files[name].dir);assert.equal(media.length,1);const picture=await canvas.loadImage(await zip.file(media[0]).async("nodebuffer"));assert.ok(picture.width>500&&picture.height>200);}
  if(id==="P09")assert.equal((xml.match(/<w:sectPr\b/g)??[]).length,4);
  if(id==="P11")assert.ok(!result.qualityIssues.some(i=>i.code==="ocrUsed"));
 });
}
for(const id of ["P07","P14","P15"]){test(`${id} rejects ambiguous/incomplete content before writer`,async()=>{
 let writes=0;await assert.rejects(convert(id,{writeDocx:async()=>{writes++;return new Uint8Array();}}),/unsupportedInput/);assert.equal(writes,0);
});}

// Recognizer injection tests the adapter and accounting, not native OCR accuracy.
for(const id of ["P08","P10","P12"]){test(`${id} region OCR merges complete body, preserves graphics and clears each raster`,async()=>{
 const fixture=corpus.cases.find(c=>c.id===id),calls=[];
 const {result,xml}=await convert(id,{recognizePage:async(raster,pageNumber,region)=>{
  calls.push({raster,pageNumber,region});
  const expected=fixture.target.regions.find(r=>(r.sourcePage??1)===pageNumber);
  const text=(expected.expectedText??expected.text)[0];
  let minX=raster.width,minY=raster.height,maxX=0,maxY=0;
  for(let y=0;y<raster.height;y++)for(let x=0;x<raster.width;x++){const i=(y*raster.width+x)*4;if(raster.pixels[i]<235){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
  return{width:raster.width,height:raster.height,warnings:[],lines:[{text,confidence:1,bounds:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}}]};
 }});
 assert.equal(normalize(paragraphs(xml).join(" ")),normalize(fixture.target.fullEditableText));
 assert.ok(result.qualityIssues.some(i=>i.code==="ocrUsed"));
 if(id!=="P08")assert.match(xml,/<w:drawing>/);
 if(id==="P12")assert.ok(result.qualityIssues.some(i=>i.code==="nonEditableGraphic"));
 for(const call of calls){assert.equal(call.region.id,1);assert.equal(call.region.bounds.x,54);assert.ok(call.raster.bytes.every(b=>b===0));assert.ok(call.raster.pixels.every(b=>b===0));}
});}
test("P13 required scan failure cannot commit a partial output",async()=>{
 let writes=0;await assert.rejects(convert("P13",{writeDocx:async()=>{writes++;return new Uint8Array();}}),/ocrRequired/);assert.equal(writes,0);
});

function pdfFromObjects(objects) {
 let bytes=Buffer.from('%PDF-1.4\n');const offsets=[0];
 for(const [i,object]of objects.entries()){offsets.push(bytes.length);bytes=Buffer.concat([bytes,Buffer.from(`${i+1} 0 obj\n`),Buffer.isBuffer(object)?object:Buffer.from(object),Buffer.from('\nendobj\n')]);}
 const xref=bytes.length;
 return new Uint8Array(Buffer.concat([bytes,Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)]));
}
function rawPdf(content,resources='',extras=[]) {
 return pdfFromObjects(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> ${resources} >> /Contents 5 0 R >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,...extras]);
}
for(const [label,input]of [
 ['unmodeled gradient',rawPdf('BT /F1 12 Tf 50 750 Td (Before chart) Tj ET\nq 150 0 0 90 50 500 cm /Sh1 sh Q\nBT /F1 12 Tf 50 450 Td (After chart) Tj ET','/Shading << /Sh1 6 0 R >>',['<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 1 1] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> /Extend [true true] >>'])],
 ['clipped hidden text',rawPdf('BT /F1 12 Tf 50 750 Td (Visible body) Tj ET\nq 10 10 10 10 re W n BT /F1 12 Tf 50 600 Td (Invisible clipped secret) Tj ET Q')],
 ['unbacked invisible text',rawPdf('BT /F1 12 Tf 50 750 Td (Visible body) Tj ET\nBT /F1 12 Tf 3 Tr 50 600 Td (Invisible searchable secret) Tj ET')],
])test(`${label} cannot bypass visible-content accounting`,async()=>{
 let writes=0;await assert.rejects(convertPdfToDocx(input.slice(),new AbortController().signal,async()=>{}, {...options,writeDocx:async()=>{writes++;return new Uint8Array();}}),/unsupportedInput/);assert.equal(writes,0);
});

test('PDF preflight reads the actual subset font identity instead of its generic renderer fallback',async()=>{
 let requested=[];
 await convert('P01',{inspectFonts:async families=>{requested=families;return[];}});
 assert.ok(requested.some(family=>family.startsWith('NotoSansSC')));
 assert.ok(requested.every(family=>!family.includes('+')&&!['serif','sans-serif','monospace'].includes(family)));
});

test('legacy ruled table header shading remains table decoration with complete editable content',async()=>{
 const legacy=JSON.parse(fs.readFileSync('tests/fixtures/fileConversion/expected.json','utf8')).cases.find(c=>c.file==='rich-layout.pdf');
 const result=await convertPdfToDocx(new Uint8Array(fs.readFileSync('tests/fixtures/fileConversion/rich-layout.pdf')),new AbortController().signal,async()=>{},options);
 const zip=await JSZip.loadAsync(result.bytes),xml=await zip.file('word/document.xml').async('string');
 assert.match(xml,/<w:tbl>/);
 const characters=value=>[...value.replace(/\s/gu,'')].sort().join('');
 assert.equal(characters(paragraphs(xml).join('')),characters(legacy.expectedFullText));
});
test('a searchable title cannot turn a shaded scanned table into a completed picture',async()=>{
 const scan=canvas.createCanvas(500,450),context=scan.getContext('2d');
 context.fillStyle='white';context.fillRect(0,0,500,450);context.fillStyle='black';context.font='12px sans-serif';context.fillText('Digital title',30,50);
 context.fillStyle='#ddd';context.fillRect(50,180,400,180);context.fillStyle='black';context.strokeStyle='black';context.lineWidth=2;context.strokeRect(50,180,400,180);
 for(const [value,x,y]of [['SCANNED A',70,220],['SCANNED B',270,220],['SCANNED C',70,310],['SCANNED D',270,310]])context.fillText(value,x,y);
 const image=scan.toBuffer('image/jpeg'),stream=Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 500 /Height 450 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),image,Buffer.from('\nendstream')]);
 const input=rawPdf('q 500 0 0 450 50 150 cm /Im1 Do Q\nBT /F1 12 Tf 80 550 Td (Digital title) Tj ET','/XObject << /Im1 6 0 R >>',[stream]);
 let calls=0,writes=0;
 await assert.rejects(convertPdfToDocx(input,new AbortController().signal,async()=>{}, {...options,recognizePage:async()=>{calls++;throw new Error('providerFailed');},writeDocx:async()=>{writes++;return new Uint8Array();}}),/providerFailed/);
 assert.equal(calls,1);assert.equal(writes,0);
});

test('invalid and encrypted inputs preserve typed classifications before packaging',async()=>{
 for(const [name,code]of [['malformed.pdf','invalidInput'],['encrypted.pdf','passwordRequired']]){
  let writes=0;await assert.rejects(convertPdfToDocx(new Uint8Array(fs.readFileSync(`tests/fixtures/fileConversion/${name}`)),new AbortController().signal,async()=>{}, {...options,writeDocx:async()=>{writes++;return new Uint8Array();}}),new RegExp(code));assert.equal(writes,0);
 }
});

test('clipped composite scan recognizes visible body once, recovers isolated labels and keeps its photo',async()=>{
 const scan=canvas.createCanvas(600,800),context=scan.getContext('2d');
 context.fillStyle='white';context.fillRect(0,0,600,800);
 context.fillStyle='#608572';context.fillRect(40,70,520,3);
 context.fillStyle='black';context.font='16px sans-serif';
 for(const [value,x,y]of [['Composite title',40,50],['A',40,120],['Visible body',90,120],['Last paragraph',40,220]])context.fillText(value,x,y);
 const jpeg=scan.toBuffer('image/jpeg');
 const photo=canvas.createCanvas(80,100),photoContext=photo.getContext('2d'),pixels=photoContext.createImageData(80,100);
 for(let y=0;y<100;y++)for(let x=0;x<80;x++){const i=(y*80+x)*4;pixels.data.set([40+x*2,30+y*2,50+(x+y)%150,255],i);}
 photoContext.putImageData(pixels,0,0);
 const stream=(bytes,width,height)=>Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`),bytes,Buffer.from('\nendstream')]);
 const input=rawPdf('q 0 0 600 800 re W n 600 0 0 800 0 0 cm /Im1 Do Q\nq 80 0 0 100 470 450 cm /Im2 Do Q','/XObject << /Im1 6 0 R /Im2 7 0 R >>',[stream(jpeg,600,800),stream(photo.toBuffer('image/jpeg'),80,100)]);
 const recognized=[['Composite title',40,34,130,18],['Visible body',90,104,110,18],['Last paragraph',40,204,145,22]];
 const calls=[];
 const result=await convertPdfToDocx(input,new AbortController().signal,async()=>{}, {...options,recognizePage:async(raster,pageNumber,region)=>{
  calls.push(region);
  const boxes=calls.length===1?recognized:[['A Visible body',40,104,160,18]];
  return{width:raster.width,height:raster.height,warnings:[],lines:boxes.map(([text,x,y,width,height])=>({text,confidence:1,bounds:{x:(x-region.bounds.x)*raster.width/region.bounds.width,y:(y-region.bounds.y)*raster.height/region.bounds.height,width:width*raster.width/region.bounds.width,height:height*raster.height/region.bounds.height}}))};
 }});
 const zip=await JSZip.loadAsync(result.bytes),xml=await zip.file('word/document.xml').async('string');
 assert.equal(normalize(paragraphs(xml).join(' ')),'Composite title A Visible body Last paragraph');
 assert.equal(calls.length,2);assert.deepEqual(calls.map(call=>call.id),[1,2]);
 assert.equal(calls[0].bounds.width,600);assert.equal(calls[0].bounds.height,800);
 assert.equal(Object.keys(zip.files).filter(name=>name.startsWith('word/media/')&&!zip.files[name].dir).length,1);
 assert.ok(result.qualityIssues.some(issue=>issue.code==='ocrUsed'));
 assert.ok(result.qualityIssues.some(issue=>issue.code==='layoutReflowed'));
 assert.doesNotMatch(xml,/<w:pStyle w:val="Heading/);
 assert.doesNotMatch(xml,/w:vanish|w:webHidden/);
});

test('composite scan keeps local columns and portrait beside editable text with source-colored headings',async()=>{
 const scan=canvas.createCanvas(600,800),ctx=scan.getContext('2d');
 ctx.fillStyle='white';ctx.fillRect(0,0,600,800);
 const rows=[['Profile',230,40,140,32,'#608572'],['Details',40,110,65,14,'white'],
  ['Name: Sample',40,150,150,16,'black'],['City: Example',40,172,150,16,'black'],['Role: Engineer',40,194,150,16,'black'],
  ['Education: College',245,155,170,16,'black'],['Skills: Editing',245,177,170,16,'black'],['Languages: Two',245,199,170,16,'black'],
  ['Experience',40,275,90,14,'white'],['Complete editable body below both columns.',40,310,480,16,'black']];
 ctx.fillStyle='#608572';ctx.fillRect(36,106,95,22);ctx.fillRect(36,271,120,22);
 for(const[text,x,y,w,h,color]of rows){ctx.font=`${h*.8}px sans-serif`;ctx.fillStyle=color;ctx.fillText(text,x,y+h*.85,w);}
 const photo=canvas.createCanvas(80,100),pc=photo.getContext('2d'),pixels=pc.createImageData(80,100);
 for(let y=0;y<100;y++)for(let x=0;x<80;x++)pixels.data.set([40+x*2,30+y*2,50+(x+y)%150,255],(y*80+x)*4);
 pc.putImageData(pixels,0,0);
 const stream=(bytes,w,h)=>Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`),bytes,Buffer.from('\nendstream')]);
 const input=rawPdf('q 0 0 600 800 re W n 600 0 0 800 0 0 cm /Im1 Do Q\nq 80 0 0 100 470 560 cm /Im2 Do Q','/XObject << /Im1 6 0 R /Im2 7 0 R >>',[stream(scan.toBuffer('image/jpeg'),600,800),stream(photo.toBuffer('image/jpeg'),80,100)]);
 const result=await convertPdfToDocx(input,new AbortController().signal,async()=>{}, {...options,recognizePage:async raster=>({width:raster.width,height:raster.height,warnings:[],lines:rows.map(([text,x,y,width,height])=>({text,confidence:1,bounds:{x:x*raster.width/600,y:y*raster.height/800,width:width*raster.width/600,height:height*raster.height/800}}))})});
 const zip=await JSZip.loadAsync(result.bytes),xml=await zip.file('word/document.xml').async('string');
 assert.match(xml,/<w:tbl>/,'local columns must not become a vertical list');
 const table=xml.match(/<w:tbl>.*?<\/w:tbl>/s)?.[0];
 assert.equal((table.match(/<w:tc>/g)??[]).length,3);
 assert.match(table,/<w:drawing>/,'portrait stays alongside the fields');
 assert.ok(table.indexOf('Name: Sample')<table.indexOf('Education: College'));
 assert.ok(xml.indexOf('</w:tbl>')<xml.indexOf('Complete editable body'));
 assert.match(xml,/<w:shd[^>]*w:fill="[0-9A-F]{6}"/);
 assert.match(xml,/<w:color w:val="FFFFFF"/);
 assert.doesNotMatch(xml,/w:vanish|w:webHidden/);
 for(const [text]of rows)assert.equal(paragraphs(xml).filter(p=>p.includes(text)).length,1);
});
