import assert from "node:assert/strict";
import test from "node:test";
import { transformPoint, inverseTransform, transformBounds } from "/private/tmp/zero-tests/plugins/file/engine/pdfGeometry.js";
import { reconstructStructuredPage } from "/private/tmp/zero-tests/plugins/file/engine/pdfStructure.js";

const sample = (text, x, y, width = 40, height = 12) => ({ text, x, y, width, height, rotationDegrees: 0 });
const page = (text, lines = [], figures = []) => ({ width: 600, height: 800, text, lines, figures });
const line = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
const body = block => block.paragraph.runs.map(run => run.text).join("");

test("crop/rotation transforms round trip all right-angle orientations and reject singular geometry", () => {
  for (const matrix of [[1,0,0,-1,-10,810],[0,1,1,0,-20,-10],[-1,0,0,1,610,-20],[0,-1,-1,0,820,610]]) {
    const point = transformPoint(matrix, 73, 199);
    const restored = transformPoint(inverseTransform(matrix), ...point);
    assert.ok(Math.abs(restored[0]-73)<1e-8 && Math.abs(restored[1]-199)<1e-8);
    const box = transformBounds(matrix,{x:10,y:20,width:100,height:50});
    assert.equal(box.width*box.height,5000);
  }
  assert.throws(()=>inverseTransform([0,0,0,0,0,0]),/unsupportedInput/);
  assert.throws(()=>transformBounds([1,0,0,1,0,0],{x:NaN,y:0,width:1,height:1}),/unsupportedInput/);
});

test("ruled grid preserves horizontal and vertical merges and accounts for each source once", () => {
  const lines = [line(40,100,340,100),line(40,140,340,140),line(140,180,340,180),line(40,220,340,220),
    line(40,100,40,220),line(140,140,140,220),line(240,100,240,220),line(340,100,340,220)];
  const result = reconstructStructuredPage(page([
    sample("Before",40,60),sample("Merged AB",50,125,110),sample("C",250,125),
    sample("Vertical A",50,165,75),sample("B2",150,165),sample("C2",250,165),
    sample("B3",150,205),sample("C3",250,205),sample("After",40,260),
  ],lines));
  assert.deepEqual(result.blocks.map(block=>block.kind),["paragraph","table","paragraph"]);
  const table=result.blocks[1];
  assert.deepEqual(table.columnWidths,[100,100,100]);
  assert.deepEqual(table.cells.map(cell=>[cell.row,cell.column,cell.rowSpan,cell.colSpan,cell.paragraphs.flatMap(p=>p.runs.map(r=>r.text)).join("")]),[
    [0,0,1,2,"Merged AB"],[0,2,1,1,"C"],[1,0,2,1,"Vertical A"],[1,1,1,1,"B2"],[1,2,1,1,"C2"],[2,1,1,1,"B3"],[2,2,1,1,"C3"],
  ]);
  assert.equal(result.dispositions.length,9);
  assert.equal(new Set(result.dispositions.map(item=>item.id)).size,9);
});

test("full-width heading precedes complete left/right columns and retains page furniture", () => {
  const result=reconstructStructuredPage(page([
    sample("Heading",40,40,520,24),sample("Header",40,15,80,8),
    ...[0,1,2].flatMap(i=>[sample(`Left ${i}`,40,100+i*40,180),sample(`Right ${i}`,340,100+i*40,180)]),sample("Page 1",280,780,40,8),
  ]));
  assert.deepEqual(result.blocks.map(body),["Header","Heading","Left 0","Left 1","Left 2","Right 0","Right 1","Right 2","Page 1"]);
  assert.equal(result.blocks[1].paragraph.heading,1);
});

test("figures stay between paragraphs and cannot swallow editable body", () => {
  const result=reconstructStructuredPage(page([sample("Before",40,60),sample("After",40,300)],[],[{id:"image0",bounds:{x:40,y:100,width:200,height:100},nonEditable:true}]));
  assert.deepEqual(result.blocks.map(b=>b.kind),["paragraph","figure","paragraph"]);
  assert.throws(()=>reconstructStructuredPage(page([sample("Body",50,150)],[],[{id:"bad",bounds:{x:40,y:100,width:200,height:100},nonEditable:true}])),/unsupportedInput/);
});

test("incomplete rectangular merges, ambiguous cell text and unaccounted sources are rejected", () => {
  const lines=[line(40,100,340,100),line(40,200,340,200),line(40,100,40,200),line(340,100,340,200),line(140,100,140,200)];
  assert.throws(()=>reconstructStructuredPage(page([sample("Crosses boundary",130,150,100)],lines)),/unsupportedInput/);
  assert.throws(()=>reconstructStructuredPage(page([sample("bad",40,60)],[],[{id:"bad",bounds:{x:0,y:0,width:600,height:800},nonEditable:true}])),/unsupportedInput/);
});

test("borderless three-column tables preserve complete row order with explicit simplification", () => {
  const result=reconstructStructuredPage(page([0,1,2].flatMap(row=>[0,1,2].map(column=>sample(`R${row}C${column}`,40+column*160,100+row*36,60)))));
  assert.equal(result.tableSimplified,true);
  assert.equal(result.blocks.map(body).join(' ').replace(/\s+/g,' '),'R0C0 R0C1 R0C2 R1C0 R1C1 R1C2 R2C0 R2C1 R2C2');
});

test('word-fragmented two-column lines do not become a row-major borderless table',()=>{
 const result=reconstructStructuredPage(page([0,1,2].flatMap(row=>[
   sample(`Left${row}`,40,100+row*40,35),sample('word',85,100+row*40,30),sample('end',125,100+row*40,25),
   sample(`Right${row}`,340,100+row*40,40),sample('word',390,100+row*40,30),sample('end',430,100+row*40,25),
 ])));
 assert.equal(result.tableSimplified,false);
 assert.deepEqual(result.blocks.map(body),['Left0 word end','Left1 word end','Left2 word end','Right0 word end','Right1 word end','Right2 word end']);
});
