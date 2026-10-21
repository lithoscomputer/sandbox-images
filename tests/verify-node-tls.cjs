const https=require('node:https');
const hosts=['dv-g3b','dv-g3c','ev-g3b','ev-g3c','ov-g3b','ov-g3c'].flatMap(x=>[x+'-emudhra.we-have-a-problem.com',x+'-aaa-emudhra.we-have-a-problem.com']);
const certError = /CERT|ISSUER|SELF_SIGNED/;
const request=(host,bad)=>new Promise((resolve,reject)=>{
 const req=https.get('https://'+host+'/',res=>{res.resume();bad?reject(new Error(host+' ACCEPTED')):resolve({host,status:res.statusCode});});
 req.setTimeout(15000,()=>req.destroy(new Error('timeout')));
 req.on('error',e=>bad&&certError.test(e.code)?resolve({host,code:e.code}):reject(e));
});
(async()=>{for(const host of hosts)console.log(JSON.stringify(await request(host,true)));console.log(JSON.stringify(await request('example.com',false)));})().catch(e=>{console.error(e);process.exitCode=1;});
