const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({});vm.runInContext(fs.readFileSync('src/board-core.js','utf8'),context);const B=context.JbpBoard;
test('Jira style defaults, presets and untrusted import validation',()=>{
 assert.equal(B.validate({}).jiraStyle,'standard');assert.ok(B.jiraStyles.length>=11);assert.equal(new Set(B.jiraStyles.map(p=>p.id)).size,B.jiraStyles.length);
 for(const p of B.jiraStyles){assert.equal(B.validate({jiraStyle:p.id}).jiraStyle,p.id);if(p.bg)for(const key of ['bg','surface','muted','text','subtle','accent','onAccent'])assert.match(p[key],/^#[0-9a-f]{6}$/i);}
 for(const jiraStyle of ['invalid','__proto__','</style>',null,42,{}])assert.throws(()=>B.validate({jiraStyle}),/стиль Jira/);
});
