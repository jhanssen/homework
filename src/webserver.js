/*global module,require,__filename*/

"use strict";

const path = require("path");
const http = require("http");
const url = require("url");
const fs = require("fs");

const root = path.resolve(fs.realpathSync(__filename), '../..') + path.sep;

function get(pathname, cb)
{
    const isRelative = (pathname) => {
        for (var i = 0; i < pathname.length; ++i) {
            if (pathname[i].indexOf("..") !== -1)
                return true;
        }
        return false;
    };

    const servePath = (root, pathname, cb) => {
        const path = root + pathname.join("/");
        fs.readFile(path, { encoding: "utf-8" }, (err, data) => {
            if (err) {
                cb(404, {'Content-Type': 'text/plain'}, "File not found");
                return;
            }
            var ct;
            const dotidx = path.lastIndexOf(".");
            if (dotidx !== -1) {
                const ext = path.substr(dotidx + 1).toLowerCase();

                const cts = {
                    html: "text/html",
                    css: "text/css",
                    js: "application/javascript",
                    gif: "image/gif",
                    png: "image/png",
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    txt: "text/plain"
                };
                if (ext in cts) {
                    ct = cts[ext];
                }
            }
            if (ct === undefined) {
                ct = "application/octet-stream";
            }
            cb(200, {'Content-Type': ct}, data);
        });
    };

    pathname = pathname.split("/").filter((p) => { return p.length > 0; });
    console.log("serving", pathname);

    if (!pathname.length)
        pathname.push("index.html");
    // verify that we're not trying to access parent paths
    if (isRelative(pathname)) {
        cb(400, { 'Content-Type': 'text/plain' }, "Nope");
        return;
    }
    // check if we are using special paths
    if (pathname.length > 1) {
        if (pathname[0] === "node_modules" || pathname[0] === "sub") {
            servePath(root, pathname, cb);
            return;
        } else if (pathname[0] === "uib") {
            pathname[0] = "angular-ui-bootstrap";
            pathname.splice(0, 0, "node_modules");
            servePath(root, pathname, cb);
            return;
        }
    }
    pathname.splice(0, 0, "html");
    servePath(root, pathname, cb);
}

const WebServer = {
    _server: undefined,

    serve: function(homework, config) {
        const port = (config && config.port) || 8089;

        homework.Console.log(`Serving html on port ${port} from ${root}`);

        this._server = http.createServer((req, resp) => {
            const parsedUrl = url.parse(req.url);
            get(parsedUrl.pathname, (statusCode, headers, body) => {
                resp.writeHead(statusCode, headers);
                resp.end(body);
            });
        });
        this._server.listen(port);
    }
};

module.exports = { Server: WebServer, get: get };
