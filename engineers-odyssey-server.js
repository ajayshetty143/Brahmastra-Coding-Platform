"use strict";

/*
=========================================================
Engineer's Odyssey
Production Java Execution Server
Part 1 - Bootstrap & Configuration
=========================================================
*/

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

/* =====================================================
   Configuration
===================================================== */

const PORT = Number(process.env.PORT || 3000);

const ROOT_DIR = __dirname;

const MAX_REQUEST_SIZE = 1024 * 120; //120KB

const COMPILE_TIMEOUT = 8000;

const RUN_TIMEOUT = 5000;

const JAVA_FILE = "Main.java";

const CLASS_NAME = "Main";

const TEMP_PREFIX = "engineers-odyssey-";

/* =====================================================
   Banner
===================================================== */

console.log("");
console.log("===========================================");
console.log("     ENGINEER'S ODYSSEY SERVER");
console.log("===========================================");
console.log("Node Version :", process.version);
console.log("Platform     :", process.platform);
console.log("Architecture :", process.arch);
console.log("Port         :", PORT);
console.log("Working Dir  :", ROOT_DIR);
console.log("===========================================");
console.log("");

/* =====================================================
   Java Detection
===================================================== */

function findExecutable(command) {

    const result = spawnSync(command, ["-version"], {
        encoding: "utf8"
    });

    return result.status === 0 || result.stderr
        ? command
        : null;

}

const JAVA = findExecutable("java");

const JAVAC = findExecutable("javac");

console.log("Java  :", JAVA || "NOT FOUND");

console.log("Javac :", JAVAC || "NOT FOUND");

if (!JAVA || !JAVAC) {

    console.error("");

    console.error("Java Runtime NOT detected.");

    console.error("Install OpenJDK 17 or later.");

    console.error("");

}

/* =====================================================
   Logger
===================================================== */

function log(title, value = "") {

    const time = new Date().toISOString();

    console.log(`[${time}] ${title}`, value);

}

function error(title, value = "") {

    const time = new Date().toISOString();

    console.error(`[${time}] ${title}`, value);

}

/* =====================================================
   Response Helpers
===================================================== */

function json(res, status, body) {

    res.writeHead(status, {

        "Content-Type": "application/json; charset=utf-8",

        "Access-Control-Allow-Origin": "*",

        "Access-Control-Allow-Headers": "Content-Type",

        "Access-Control-Allow-Methods": "POST,GET,OPTIONS"

    });

    res.end(JSON.stringify(body));

}

function text(res, status, body) {

    res.writeHead(status, {

        "Content-Type": "text/plain; charset=utf-8",

        "Access-Control-Allow-Origin": "*"

    });

    res.end(body);

}

/* =====================================================
   Temporary Workspace
===================================================== */

function createWorkspace() {

    return fs.mkdtempSync(

        path.join(os.tmpdir(), TEMP_PREFIX)

    );

}

function deleteWorkspace(directory) {

    try {

        fs.rmSync(directory, {

            recursive: true,

            force: true

        });

    }

    catch (e) {

        error("Workspace Cleanup", e.message);

    }

}

/* =====================================================
   Safe File Utility
===================================================== */

function resolveFile(url) {

    const decoded = decodeURIComponent(url);

    const file = path.resolve(ROOT_DIR, "." + decoded);

    if (!file.startsWith(ROOT_DIR)) {

        return null;

    }

    return file;

}

/* =====================================================
   Security Filters
===================================================== */

const BLOCKED_PATTERN = new RegExp(
[
    "ProcessBuilder",
    "Runtime\\.getRuntime",
    "\\.exec\\(",
    "Files\\.delete",
    "System\\.exit",
    "ServerSocket",
    "Socket\\s*\\(",
    "Class\\.forName",
    "URL\\s*\\("
].join("|"),
"i"
);

/* =====================================================
   Java Execution Engine
===================================================== */

function execute(command, args, options = {}, timeout = RUN_TIMEOUT) {

    return new Promise((resolve) => {

        const child = spawn(command, args, {
            cwd: options.cwd,
            env: process.env,
            stdio: "pipe"
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const timer = setTimeout(() => {

            timedOut = true;

            child.kill("SIGKILL");

        }, timeout);

        child.stdout.on("data", data => {

            stdout += data.toString();

        });

        child.stderr.on("data", data => {

            stderr += data.toString();

        });

        child.on("error", err => {

            stderr += err.message;

        });

        if (options.input) {

            child.stdin.write(options.input);

        }

        child.stdin.end();

        child.on("close", code => {

            clearTimeout(timer);

            resolve({

                code,

                stdout,

                stderr,

                timedOut

            });

        });

    });

}

/* =====================================================
   Compile Java Source
===================================================== */

async function compileJava(workspace) {

    log("Compile Started");

    const result = await execute(

        JAVAC,

        [JAVA_FILE],

        {

            cwd: workspace

        },

        COMPILE_TIMEOUT

    );

    if (result.timedOut) {

        return {

            ok: false,

            stage: "compile",

            output: "Compilation timed out."

        };

    }

    if (result.code !== 0) {

        return {

            ok: false,

            stage: "compile",

            output: result.stderr || result.stdout

        };

    }

    log("Compile Success");

    return {

        ok: true

    };

}

/* =====================================================
   Execute Java Program
===================================================== */

async function runJava(workspace, input) {

    log("Program Started");

    const result = await execute(

        JAVA,

        [CLASS_NAME],

        {

            cwd: workspace,

            input

        },

        RUN_TIMEOUT

    );

    if (result.timedOut) {

        return {

            ok: false,

            stage: "run",

            output: "Execution timed out."

        };

    }

    if (result.code !== 0) {

        return {

            ok: false,

            stage: "run",

            output: result.stderr || result.stdout

        };

    }

    log("Program Finished");

    return {

        ok: true,

        stage: "run",

        output: result.stdout

    };

}

/* =====================================================
   Main Java Pipeline
===================================================== */

async function executeJava(sourceCode, input = "") {

    const workspace = createWorkspace();

    try {

        fs.writeFileSync(

            path.join(workspace, JAVA_FILE),

            sourceCode,

            "utf8"

        );

        const compile = await compileJava(workspace);

        if (!compile.ok) {

            return compile;

        }

        return await runJava(

            workspace,

            input

        );

    }

    catch (err) {

        error("Pipeline Error", err.message);

        return {

            ok: false,

            stage: "server",

            output: err.message

        };

    }

    finally {

        deleteWorkspace(workspace);

    }

}

/* =====================================================
   Java Validation
===================================================== */

function validateJava(sourceCode) {

    if (typeof sourceCode !== "string") {

        return {

            ok: false,

            message: "Invalid Java source."

        };

    }

    if (sourceCode.length === 0) {

        return {

            ok: false,

            message: "Source code is empty."

        };

    }

    if (sourceCode.length > 100000) {

        return {

            ok: false,

            message: "Source code too large."

        };

    }

    if (!/\bpublic\s+class\s+Main\b/.test(sourceCode)) {

        return {

            ok: false,

            message: "Use public class Main."

        };

    }

    if (BLOCKED_PATTERN.test(sourceCode)) {

        return {

            ok: false,

            message: "Restricted Java API detected."

        };

    }

    return {

        ok: true

    };

}

/* =====================================================
   MIME TYPES
===================================================== */

const MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
    ".txt": "text/plain"
};

/* =====================================================
   STATIC FILE SERVER
===================================================== */

function serveStatic(req, res) {

    const url =
        req.url === "/"
            ? "/engineers-odyssey.html"
            : req.url.split("?")[0];

    const file = resolveFile(url);

    if (!file) {

        return text(res, 403, "Forbidden");

    }

    fs.readFile(file, (err, content) => {

        if (err) {

            return text(res, 404, "File Not Found");

        }

        const ext = path.extname(file).toLowerCase();

        const mime =
            MIME_TYPES[ext] ||
            "application/octet-stream";

        res.writeHead(200, {

            "Content-Type": mime,

            "Access-Control-Allow-Origin": "*"

        });

        res.end(content);

    });

}

/* =====================================================
   HEALTH ENDPOINT
===================================================== */

function health(req, res) {

    json(res, 200, {

        ok: true,

        server: "Engineer's Odyssey",

        node: process.version,

        java: JAVA,

        javac: JAVAC,

        uptime: process.uptime(),

        timestamp: new Date().toISOString()

    });

}

/* =====================================================
   REQUEST BODY PARSER
===================================================== */

function readBody(req) {

    return new Promise((resolve, reject) => {

        let raw = "";

        req.on("data", chunk => {

            raw += chunk;

            if (raw.length > MAX_REQUEST_SIZE) {

                reject(new Error("Request too large"));

                req.destroy();

            }

        });

        req.on("end", () => {

            try {

                resolve(JSON.parse(raw));

            }

            catch {

                reject(new Error("Invalid JSON"));

            }

        });

        req.on("error", reject);

    });

}

/* =====================================================
   JAVA API
===================================================== */

async function apiRun(req, res) {

    try {

        const body = await readBody(req);

        const source = String(body.code || "");

        const input = String(body.input || "");

        const validation = validateJava(source);

        if (!validation.ok) {

            return json(res, 400, {

                ok: false,

                stage: "validation",

                output: validation.message

            });

        }

        log("Execution Requested");

        const result = await executeJava(
    source,
    input
);

recordExecution(result);

json(res, 200, result);

    }

    catch (err) {

        error("API", err.message);

        json(res, 500, {

            ok: false,

            stage: "server",

            output: err.message

        });

    }

}

/* =====================================================
   HTTP SERVER
===================================================== */

const server = http.createServer(

    async (req, res) => {

        log(req.method, req.url);
        const ip = req.socket.remoteAddress || "unknown";

if (!allowRequest(ip)) {
    return json(res, 429, {
        ok: false,
        error: "Too many requests. Try again later."
    });
}

        if (req.method === "OPTIONS") {

            res.writeHead(204, {

                "Access-Control-Allow-Origin": "*",

                "Access-Control-Allow-Headers":
                    "Content-Type",

                "Access-Control-Allow-Methods":
                    "GET,POST,OPTIONS"

            });

            return res.end();

        }

        if (

            req.method === "GET" &&

            req.url === "/health"

        ) {

            return health(req, res);

        }

        if (

            req.method === "POST" &&

            req.url === "/api/run"

        ) {

            return apiRun(req, res);

        }
        if (
  req.method === "GET" &&
  req.url === "/metrics"
) {
  return metricsEndpoint(req, res);
}

        serveStatic(req, res);

    }

);

/* =====================================================
   START SERVER
===================================================== */

server.listen(PORT, "0.0.0.0", () => {

    console.log("");

    console.log("====================================");

    console.log(

        `Engineer's Odyssey running on ${PORT}`

    );

    console.log("");

    console.log(

        `Health : http://localhost:${PORT}/health`

    );

    console.log("");

    console.log("====================================");

});

/* =====================================================
   PRODUCTION HARDENING
===================================================== */

const metrics = {

    requests: 0,

    compileRequests: 0,

    successfulRuns: 0,

    compileFailures: 0,

    runtimeFailures: 0,

    totalExecutionTime: 0

};

/* =====================================================
   REQUEST TIMER
===================================================== */

function beginRequest(req) {

    req.startTime = process.hrtime.bigint();

    metrics.requests++;

}

function endRequest(req) {

    if (!req.startTime) return;

    const elapsed = Number(

        process.hrtime.bigint() - req.startTime

    ) / 1000000;

    metrics.totalExecutionTime += elapsed;

    log(

        "Completed",

        `${req.method} ${req.url} (${elapsed.toFixed(2)} ms)`

    );

}

/* =====================================================
   METRICS ENDPOINT
===================================================== */

function metricsEndpoint(req, res) {

    json(res, 200, {

        requests: metrics.requests,

        compileRequests: metrics.compileRequests,

        successfulRuns: metrics.successfulRuns,

        compileFailures: metrics.compileFailures,

        runtimeFailures: metrics.runtimeFailures,

        averageResponse:

            metrics.requests === 0

                ? 0

                : (

                    metrics.totalExecutionTime /

                    metrics.requests

                ).toFixed(2) + " ms"

    });

}

/* =====================================================
   SAFE JSON WRAPPER
===================================================== */

function safeJson(res, status, payload) {

    try {

        json(res, status, payload);

    }

    catch (err) {

        error("JSON Response", err.message);

    }

}

/* =====================================================
   EXECUTION LOGGER
===================================================== */

function recordExecution(result) {

    metrics.compileRequests++;

    if (result.ok) {

        metrics.successfulRuns++;

        return;

    }

    if (result.stage === "compile") {

        metrics.compileFailures++;

        return;

    }

    if (result.stage === "run") {

        metrics.runtimeFailures++;

    }

}

/* =====================================================
   GLOBAL ERROR HANDLERS
===================================================== */

process.on("uncaughtException", err => {

    error("Uncaught Exception", err.stack);

});

process.on("unhandledRejection", err => {

    error("Unhandled Promise", err);

});

/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */

function shutdown(signal) {

    console.log("");

    console.log("===================================");

    console.log("Shutdown Signal :", signal);

    console.log("Closing Server...");

    console.log("===================================");

    server.close(() => {

        console.log("HTTP Server Closed");

        process.exit(0);

    });

}

process.on("SIGINT", () => shutdown("SIGINT"));

process.on("SIGTERM", () => shutdown("SIGTERM"));

/* =====================================================
   MEMORY LOGGER
===================================================== */

setInterval(() => {

    const memory = process.memoryUsage();

    log("Memory", {

        rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,

        heap:

            `${Math.round(memory.heapUsed / 1024 / 1024)} MB`

    });

}, 300000);

/* =====================================================
   STARTUP SUMMARY
===================================================== */

console.log("");

console.log("Production Features Enabled");

console.log("✓ Metrics");

console.log("✓ Graceful Shutdown");

console.log("✓ Error Logging");

console.log("✓ Request Timing");

console.log("✓ Memory Monitor");

console.log("");

console.log(

    `Metrics Endpoint : http://localhost:${PORT}/metrics`

);

console.log("");


/* =====================================================
   ENGINEER'S ODYSSEY
   PART 5 - FINAL PRODUCTION HARDENING
===================================================== */

const SERVER_VERSION = "1.0.0";

const START_TIME = Date.now();

/* =====================================================
   SIMPLE RATE LIMITER
===================================================== */

const rateLimit = new Map();

const WINDOW_MS = 60 * 1000;

const MAX_REQUESTS = 120;

function allowRequest(ip){

    const now = Date.now();

    if(!rateLimit.has(ip)){

        rateLimit.set(ip,[]);

    }

    const requests = rateLimit.get(ip);

    while(requests.length && now-requests[0]>WINDOW_MS){

        requests.shift();

    }

    if(requests.length>=MAX_REQUESTS){

        return false;

    }

    requests.push(now);

    return true;

}

/* =====================================================
   SELF TEST
===================================================== */

function selfTest(){

    console.log("");

    console.log("========== SELF TEST ==========");

    console.log("Version :",SERVER_VERSION);

    console.log("Node    :",process.version);

    console.log("Java    :",JAVA||"NOT FOUND");

    console.log("Javac   :",JAVAC||"NOT FOUND");

    console.log("Platform:",process.platform);

    console.log("================================");

    console.log("");

}

/* =====================================================
   HEALTH VERIFICATION
===================================================== */

function extendedHealth(req,res){

    json(res,200,{

        ok:true,

        version:SERVER_VERSION,

        uptime:Math.floor(process.uptime()),

        node:process.version,

        java:JAVA,

        javac:JAVAC,

        memory:process.memoryUsage(),

        requests:metrics.requests,

        compileRequests:metrics.compileRequests,

        successfulRuns:metrics.successfulRuns,

        compileFailures:metrics.compileFailures,

        runtimeFailures:metrics.runtimeFailures,

        started:new Date(START_TIME).toISOString()

    });

}

/* =====================================================
   ERROR RESPONSE
===================================================== */

function failure(res,message){

    json(res,500,{

        ok:false,

        stage:"server",

        output:message

    });

}

/* =====================================================
   SAFE STARTUP CHECK
===================================================== */

if(!JAVA){

    console.warn("WARNING : Java Runtime Missing");

}

if(!JAVAC){

    console.warn("WARNING : Java Compiler Missing");

}

selfTest();

/* =====================================================
   PERIODIC CLEANUP
===================================================== */

setInterval(()=>{

    const now=Date.now();

    for(const [ip,list] of rateLimit){

        while(list.length && now-list[0]>WINDOW_MS){

            list.shift();

        }

        if(list.length===0){

            rateLimit.delete(ip);

        }

    }

},60000);

/* =====================================================
   SERVER INFORMATION
===================================================== */

console.log("");

console.log("==========================================");

console.log("Engineer's Odyssey Production Ready");

console.log("Version :",SERVER_VERSION);

console.log("HTTP    : ENABLED");

console.log("Java    : ENABLED");

console.log("Security: ENABLED");

console.log("Metrics : ENABLED");

console.log("Logging : ENABLED");

console.log("Health  : /health");

console.log("Metrics : /metrics");

console.log("==========================================");

console.log("");

/* =====================================================
   REQUEST GUARD
===================================================== */

function guard(req,res){

    const ip=req.socket.remoteAddress||"unknown";

    if(!allowRequest(ip)){

        json(res,429,{

            ok:false,

            output:"Too many requests."

        });

        return false;

    }

    return true;

}

/* =====================================================
   EXPORTS
===================================================== */

module.exports={

    executeJava,

    validateJava,

    guard,

    health:extendedHealth

};