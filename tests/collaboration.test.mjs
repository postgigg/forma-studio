import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedDesign, validateLiveDesign, diffDesign, applyTransaction } from '../shared/collaboration.mjs';
const fixture=()=>({id:'design-1',name:'Spring launch',kind:'whiteboard',width:1080,height:1080,pages:[{id:'page-1',name:'Launch',data:{background:'#fff',objects:[{id:'a',type:'Rect',left:20,top:30,width:80,height:50,fill:'#754adb'},{id:'b',type:'Textbox',text:'Fresh flowers',left:120,top:30,width:200}]},comments:[]}]});
const actor={id:'anna',name:'Anna'};
test('only selected artwork and used media are shared',()=>{
  const doc={...fixture(),campaignId:'private',folderId:'private',aiDirection:{prompt:'private'},aiJobId:'private',pages:fixture().pages.map(page=>({...page,thumbnail:'private'}))};
  const shared=sharedDesign(doc);validateLiveDesign(shared);
  assert.equal(shared.campaignId,undefined);assert.equal(shared.aiDirection,undefined);assert.equal(shared.pages[0].thumbnail,undefined);
});
test('independent simultaneous edits merge and stale same-property edits are reported',()=>{
  const base=fixture(),a=structuredClone(base),b=structuredClone(base);
  a.pages[0].data.objects[0].left=50;b.pages[0].data.objects[1].text='A new season';
  const first=applyTransaction(base,diffDesign(base,a),{actor});
  const both=applyTransaction(first.design,diffDesign(base,b),{actor:{id:'ben',name:'Ben'}});
  assert.equal(both.design.pages[0].data.objects[0].left,50);assert.equal(both.design.pages[0].data.objects[1].text,'A new season');assert.deepEqual(both.conflicts,[]);
  b.pages[0].data.objects[0].left=100;b.pages[0].data.objects[0].top=70;
  const stale=applyTransaction(first.design,diffDesign(base,b),{actor});
  assert.equal(stale.design.pages[0].data.objects[0].left,50);assert.equal(stale.design.pages[0].data.objects[0].top,70);assert.equal(stale.conflicts.length,1);
});
test('simultaneous insertions keep both new elements and replicate identically',()=>{
  const base=fixture(),a=structuredClone(base),b=structuredClone(base);
  a.pages[0].data.objects.push({id:'c',type:'Circle',radius:20});b.pages[0].data.objects.push({id:'d',type:'Rect',width:20,height:30});
  const first=applyTransaction(base,diffDesign(base,a),{actor}),second=applyTransaction(first.design,diffDesign(base,b),{actor});
  assert.deepEqual(new Set(second.design.pages[0].data.objects.map(o=>o.id)),new Set(['a','b','c','d']));
  assert.deepEqual(applyTransaction(first.design,second.ops,{authoritative:true}).design,second.design);
});
test('viewer and commenter permissions reject forged artwork updates',()=>{
  const base=fixture(),next=structuredClone(base);next.name='Hacked';
  for(const role of ['view','comment'])assert.throws(()=>applyTransaction(base,diffDesign(base,next),{role,actor}),/permission/);
  const unsafe=JSON.parse('{"path":["meta","constructor"],"after":{"prototype":{"polluted":true}}}');
  assert.throws(()=>applyTransaction(base,[unsafe],{actor}),/Invalid/);assert.equal({}.polluted,undefined);
});
test('shared comments use the authenticated author and cannot be impersonated or overwritten',()=>{
  const base=fixture(),next=structuredClone(base);next.pages[0].comments.push({id:'note-1',text:'More space around the title',x:200,y:100,resolved:false,createdAt:new Date().toISOString(),authorId:'someone-else',authorName:'Fake'});
  const result=applyTransaction(base,diffDesign(base,next),{role:'comment',actor});
  const comment=result.design.pages[0].comments[0];assert.equal(comment.authorId,'anna');assert.equal(comment.authorName,'Anna');
  const edited=structuredClone(result.design);edited.pages[0].comments[0].text='Changed';
  assert.throws(()=>applyTransaction(result.design,diffDesign(result.design,edited),{role:'edit',actor:{id:'ben',name:'Ben'}}),/author/);
  edited.pages[0].comments[0].text=comment.text;edited.pages[0].comments[0].resolved=true;
  assert.equal(applyTransaction(result.design,diffDesign(result.design,edited),{role:'comment',actor:{id:'ben',name:'Ben'}}).design.pages[0].comments[0].resolved,true);
});
test('undoing one participant preserves another participant’s independent edit',()=>{
  const base=fixture(),first=structuredClone(base);first.pages[0].data.objects[0].left=80;
  const mine=applyTransaction(base,diffDesign(base,first),{actor}),other=structuredClone(mine.design);other.pages[0].data.objects[1].text='Shared work';
  const theirs=applyTransaction(mine.design,diffDesign(mine.design,other),{actor:{id:'ben',name:'Ben'}});
  const undo=mine.ops.slice().reverse().map(op=>({path:op.path,before:op.after,after:op.before}));
  const final=applyTransaction(theirs.design,undo,{actor});assert.equal(final.design.pages[0].data.objects[0].left,20);assert.equal(final.design.pages[0].data.objects[1].text,'Shared work');
});
test('deletions do not resurrect objects, and malformed or external media is rejected',()=>{
  const base=fixture(),deleted=structuredClone(base);deleted.pages[0].data.objects.shift();
  const result=applyTransaction(base,diffDesign(base,deleted),{actor}),stale=structuredClone(base);stale.pages[0].data.objects[0].left=400;
  assert.equal(applyTransaction(result.design,diffDesign(base,stale),{actor}).design.pages[0].data.objects.length,1);
  const external=fixture();external.pages[0].data.objects[0].src='http://127.0.0.1:51861/private';assert.throws(()=>validateLiveDesign(external),/embedded/);
  const duplicate=fixture();duplicate.pages[0].data.objects[1].id='a';assert.throws(()=>validateLiveDesign(duplicate),/unique/);
});
