import {registerBackground} from '@zero/sdk';
registerBackground(async(event,context)=>{
  if(event.eventId!=='scheduled.smoke'||event.payload?.fixture!=='background-smoke') throw new Error('Unexpected native context');
  const interactive=await context.bridge.request('ui.showMessage',{message:'Hidden sessions must never display this'});
  if(interactive.ok||interactive.error.code!=='session.kind') throw new Error('Native hidden UI gate failed');
  const previous=await context.bridge.request('storage.get',{key:'marker'});
  if(!previous.ok) throw new Error(previous.error.code);
  const count=(previous.value?.count??0)+1;
  const saved=await context.bridge.request('storage.set',{key:'marker',value:{count,interactiveDenied:true,occurrenceId:event.occurrenceId,attempt:event.attempt}});
  if(!saved.ok) throw new Error(saved.error.code);
  return {outcome:'completed',nextAtMs:Date.now()+3000};
});
