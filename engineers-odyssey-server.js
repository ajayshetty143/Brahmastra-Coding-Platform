const http=require("http");
const fs=require("fs");
const os=require("os");
const path=require("path");
const {spawn,execSync}=require("child_process");
const root=__dirname, port=process.env.PORT||3000;
const blocked=/ProcessBuilder|Runtime\.getRuntime|\.exec\(|Files\.delete|System\.exit|Socket\s*\(|ServerSocket|URL\s*\(|Class\.forName/i;
function send(res,s,d,t="application/json"){res.writeHead(s,{"Content-Type":`${t}; charset=utf-8`,"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type"});res.end(t==="application/json"?JSON.stringify(d):d);}
function run(cmd,args,opt,to){return new Promise(r=>{const {input,...o}=opt;const c=spawn(cmd,args,{env:process.env,...o});let out="";let timed=false;const tm=setTimeout(()=>{timed=true;c.kill();},to);c.stdout.on("data",d=>out+=d);c.stderr.on("data",d=>out+=d);c.on("error",e=>out+=e.message);input?c.stdin.end(input):c.stdin.end();c.on("close",code=>{clearTimeout(tm);r({code,output:out,timedOut:timed});});});}
http.createServer((req,res)=>{
if(req.method==="OPTIONS"){res.writeHead(204,{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST, OPTIONS"});return res.end();}
if(req.method==="POST"&&req.url==="/api/run"){let raw="";req.on("data",c=>raw+=c);req.on("end",async()=>{let b;try{b=JSON.parse(raw);}catch{return send(res,400,{ok:false,output:"Invalid request."});}
const code=String(b.code||""),input=String(b.input||"");if(!/public\\s+class\\s+Main\\b/.test(code))return send(res,400,{ok:false,output:"Use public class Main."});if(blocked.test(code))return send(res,400,{ok:false,output:"Restricted Java API."});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"odyssey-java-"));try{fs.writeFileSync(path.join(dir,"Main.java"),code);const javac=process.env.JAVAC_PATH||"/usr/bin/javac";const java=process.env.JAVA_PATH||"/usr/bin/java";const c=await run(javac,["Main.java"],{cwd:dir},6000);if(c.code!==0||c.timedOut)return send(res,200,{ok:false,stage:"compile",output:c.output});const e=await run(java,["Main"],{cwd:dir,input},4000);return send(res,200,{ok:e.code===0,stage:"run",output:e.output});}finally{fs.rmSync(dir,{recursive:true,force:true});}});return;}
const url=decodeURIComponent(req.url==="/"?"/engineers-odyssey.html":req.url.split("?")[0]);const file=path.resolve(root,"."+url);if(!file.startsWith(root))return send(res,403,"Forbidden","text/plain");fs.readFile(file,(err,content)=>{if(err)return send(res,404,"Not found","text/plain");const ext=path.extname(file);const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".pdf":"application/pdf"}[ext]||"application/octet-stream";send(res,200,content,mime);});
}).listen(port,"0.0.0.0",()=>console.log(`Engineer's Odyssey running at http://0.0.0.0:${port}`));
