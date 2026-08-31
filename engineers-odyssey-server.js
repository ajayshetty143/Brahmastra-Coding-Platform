const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execSync } = require("child_process");

const root = __dirname;
const port = process.env.PORT || 3000;

console.log("=== SERVER STARTING ===");
console.log("PORT =", process.env.PORT);
console.log("NODE =", process.version);

try {
    console.log("PATH =", process.env.PATH);
    console.log("JAVAC =", execSync("which javac || command -v javac || echo NOT_FOUND").toString());
    console.log("JAVA =", execSync("which java || command -v java || echo NOT_FOUND").toString());
    console.log(execSync("java -version 2>&1").toString());
} catch (err) {
    console.log(err.toString());
}

const blocked =
    /ProcessBuilder|Runtime\.getRuntime|\.exec\(|Files\.delete|System\.exit|Socket\s*\(|ServerSocket|URL\s*\(|Class\.forName/i;

function send(res, status, data, type = "application/json") {
    res.writeHead(status, {
        "Content-Type": `${type}; charset=utf-8`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
    });

    res.end(type === "application/json" ? JSON.stringify(data) : data);
}

function run(command, args, options, timeoutMs) {
    return new Promise((resolve) => {
        const { input, ...spawnOptions } = options;

        const child = spawn(command, args, {
            env: process.env,
            ...spawnOptions,
        });

        let output = "";
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);

        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("error", (e) => (output += e.message));

        if (input) {
            child.stdin.end(input);
        } else {
            child.stdin.end();
        }

        child.on("close", (code) => {
            clearTimeout(timer);

            resolve({
                code,
                output,
                timedOut,
            });
        });
    });
}

http.createServer(async (req, res) => {

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        });

        return res.end();
    }

    if (req.method === "POST" && req.url === "/api/run") {

        let raw = "";

        req.on("data", (chunk) => {
            raw += chunk;

            if (raw.length > 120000) {
                req.destroy();
            }
        });

        req.on("end", async () => {

            let body;

            try {
                body = JSON.parse(raw);
            } catch {
                return send(res, 400, {
                    ok: false,
                    output: "Invalid request.",
                });
            }

            const code = String(body.code || "");
            const input = String(body.input || "");

            if (!/public\s+class\s+Main\b/.test(code)) {
                return send(res, 400, {
                    ok: false,
                    output: "Use public class Main.",
                });
            }

            if (blocked.test(code)) {
                return send(res, 400, {
                    ok: false,
                    output: "Restricted Java API.",
                });
            }

            const dir = fs.mkdtempSync(
                path.join(os.tmpdir(), "odyssey-java-")
            );

            try {

                fs.writeFileSync(path.join(dir, "Main.java"), code);

                const compile = await run(
                    "/usr/bin/javac",
                    ["Main.java"],
                    {
                        cwd: dir,
                    },
                    6000
                );

                if (compile.code !== 0 || compile.timedOut) {
                    return send(res, 200, {
                        ok: false,
                        stage: "compile",
                        output: compile.output,
                    });
                }

                const execute = await run(
                    "/usr/bin/java",
                    ["Main"],
                    {
                        cwd: dir,
                        input,
                    },
                    4000
                );

                return send(res, 200, {
                    ok: execute.code === 0,
                    stage: "run",
                    output: execute.output,
                });

            } finally {
                fs.rmSync(dir, {
                    recursive: true,
                    force: true,
                });
            }
        });

        return;
    }

    const url = decodeURIComponent(
        req.url === "/"
            ? "/engineers-odyssey.html"
            : req.url.split("?")[0]
    );

    const file = path.resolve(root, "." + url);

    if (!file.startsWith(root)) {
        return send(res, 403, "Forbidden", "text/plain");
    }

    fs.readFile(file, (err, content) => {

        if (err) {
            return send(res, 404, "Not found", "text/plain");
        }

        const ext = path.extname(file);

        const mime =
            ext === ".html"
                ? "text/html"
                : ext === ".js"
                ? "text/javascript"
                : ext === ".css"
                ? "text/css"
                : ext === ".pdf"
                ? "application/pdf"
                : "application/octet-stream";

        send(res, 200, content, mime);
    });

}).listen(port, "0.0.0.0", () => {
    console.log(`Engineer's Odyssey running at http://0.0.0.0:${port}`);
});