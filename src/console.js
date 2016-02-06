/*global module,require,process*/

const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer
});
rl.setPrompt("homework> ");

const data = {
    _ons: Object.create(null),
    emit: function(name, arg) {
        if (name in this._ons && this._ons[name] instanceof Array) {
            for (var i = 0; i < this._ons[name].length; ++i) {
                this._ons[name][i](arg);
            }
        }
    }
};

function completer(partial, callback) {
    callback(null, [['123'], partial]);
}

function Console()
{
}

Console.init = function()
{
    rl.on("line", (line) => {
        console.log(`hey ${line}`);
        if (line === "quit" || line === "shutdown") {
            data.emit("shutdown");
        }
        rl.prompt();
    });
    rl.on("SIGINT", () => {
        data.emit("shutdown");
    });
    rl.prompt();
};

Console.on = function(name, callback) {
    if (!(name in data._ons))
        data._ons[name] = [callback];
    else
        data._ons[name].push(callback);
};

module.exports = Console;
