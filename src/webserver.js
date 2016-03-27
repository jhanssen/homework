/*global module,require,__filename*/

"use strict";

const path = require("path");
const http = require("http");
const url = require("url");
const fs = require("fs");

const WebServer = {
    _server: undefined,

    serve: function(homework, config) {
        const isRelative = (pathname) => {
            for (var i = 0; i < pathname.length; ++i) {
                if (pathname[i].indexOf("..") !== -1)
                    return true;
            }
            return false;
        };
        const servePath = (root, pathname, resp) => {
            const path = root + pathname.join("/");
            fs.readFile(path, (err, data) => {
                if (err) {
                    resp.writeHead(404, {'Content-Type': 'text/plain'});
                    resp.end("File not found");
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
                resp.writeHead(200, {'Content-Type': ct});
                resp.end(data);
            });
        };

        const root = path.resolve(fs.realpathSync(__filename), '../..') + path.sep;
        const port = (config && config.port) || 8089;
        homework.Console.log(`Serving html on port ${port} from ${root}`);

        this._server = http.createServer((req, resp) => {
            const parsedUrl = url.parse(req.url);
            const pathname = parsedUrl.pathname.split("/").filter((p) => { return p.length > 0; });
            if (!pathname.length)
                pathname.push("index.html");
            // verify that we're not trying to access parent paths
            if (isRelative(pathname)) {
                resp.writeHead(400, {'Content-Type': 'text/plain'});
                resp.end("Nope");
                return;
            }
            // check if we are using special paths
            if (pathname.length > 1) {
                if (pathname[0] === "node_modules" || pathname[0] === "sub") {
                    servePath(root, pathname, resp);
                    return;
                } else if (pathname[0] === "uib") {
                    pathname[0] = "angular-ui-bootstrap";
                    pathname.splice(0, 0, "node_modules");
                    servePath(root, pathname, resp);
                    return;
                }
            }
            pathname.splice(0, 0, "html");
            servePath(root, pathname, resp);
        });
        this._server.listen(port);
    }
};

module.exports = WebServer;
