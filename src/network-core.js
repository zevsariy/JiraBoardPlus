globalThis.JbpBudget = class {
  constructor(now=()=>Date.now()) { this.now=now;this.started=now();this.active=new Map();this.config={concurrency:2,intervalMs:500};this.next=0;this.cooldown=0;this.stats={requests:0,errors:0,waits:0,durationMs:0,cacheHits:0}; }
  configure(c){if(!Number.isInteger(c.concurrency)||c.concurrency<1||c.concurrency>6||!Number.isInteger(c.intervalMs)||c.intervalMs<100||c.intervalMs>10000)throw Error('Параллельность 1–6, интервал 100–10000 мс.');this.config={concurrency:c.concurrency,intervalMs:c.intervalMs};}
  acquire(owner){const now=this.now();for(const [id,v]of this.active)if(v.until<=now){this.active.delete(id);this.stats.errors++;}
    if(this.active.size>=this.config.concurrency||now<this.next||now<this.cooldown){this.stats.waits++;return {waitMs:Math.min(1000,Math.max(100,this.next-now,this.cooldown-now))};}
    const id=crypto.randomUUID();this.active.set(id,{owner,at:now,until:now+30000});this.next=now+this.config.intervalMs;this.stats.requests++;return {id};
  }
  release(owner,id,status,durationMs,retryMs){const item=this.active.get(id);if(!item||item.owner!==owner)return;this.active.delete(id);this.stats.durationMs+=Math.max(0,Math.min(30000,Number(durationMs)||0));if(!status||status>=400)this.stats.errors++;if(status===429||status>=500)this.cooldown=Math.max(this.cooldown,this.now()+Math.min(900000,Math.max(30000,Number(retryMs)||0)));}
  snapshot(){return {since:new Date(this.started).toISOString(),...this.stats,active:this.active.size,cooldownUntil:this.cooldown?new Date(this.cooldown).toISOString():null,config:this.config};}
};
