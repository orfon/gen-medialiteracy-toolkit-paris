const nconf = require("nconf");

function Config() {
    nconf.argv()
        .env("__")
        .defaults({conf: `${__dirname}/config.json`})
        .file("user", nconf.get("conf"));
}

Config.prototype.get = function(key) {
    return nconf.get(key);
};

Config.prototype.overrides = function(obj) {
    return nconf.overrides(obj);
};

module.exports = new Config();
