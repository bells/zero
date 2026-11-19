import {registerPlugin} from '@zero/sdk';
registerPlugin({async activate(context) {
  const undeclared=await context.bridge.schedule.upsert({taskId:'forged',eventId:'undeclared.event',nextAtMs:Date.now(),payload:null});
  const fakeCompletion=await context.bridge.background.complete({outcome:'completed',nextAtMs:null});
  if(undeclared.ok||undeclared.error.code!=='background.eventDenied'||fakeCompletion.ok||fakeCompletion.error.code!=='session.kind') throw new Error('Native forgery gate failed');
  await context.bridge.request('storage.set',{key:'forgeryRejected',value:true});
  const scheduled=await context.bridge.schedule.upsert({taskId:'smoke',eventId:'scheduled.smoke',nextAtMs:Date.now()+3000,payload:{fixture:'background-smoke'}});
  if(!scheduled.ok) throw new Error(scheduled.error.code);
  await context.bridge.request('storage.set',{key:'scheduled',value:scheduled.value.generation});
}});
