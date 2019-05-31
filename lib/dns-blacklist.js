const dns = require("dns");
const util = require("util");
const lookup = util.promisify(dns.lookup);

const dnsbl = require("dnsbl");

/**
 * Checks to given IP addresses against various DNS blackhole lists.
 *
 * @param {Array<String>} ipAddresses array of IP addresses to check
 * @returns {boolean} true if IP addresses are listed in a blacklist, false otherwise
 */
const checkIpAddresses = exports.checkIpAddresses = async function checkIpAddresses(ipAddresses) {
    if (!Array.isArray(ipAddresses)) {
        throw new Error("Invalid IP addresses provided!");
    }

    const results = await dnsbl.batch(ipAddresses, process.env.DNS_BLACKLISTS.split(";"));
    return results.some(result => result.listed === true)
};

/**
 * Checks if the given domain occurs on spam blacklists.
 *
 * @param {String} domain the domain to check
 * @return {boolean} true if one of the domain's IP addresses is on a blacklist, false if not.
 */
const isDomainBlacklisted = exports.isDomainBlacklisted = async function checkDomain(domain) {
    try {
        // example.com and neverssl.com will always fail
        if (domain === "example.com" || domain === "neverssl.com") {
            return await checkIpAddresses(["127.0.0.2"]);
        }

        const result = await lookup(domain, {
            all: true
        });

        return await checkIpAddresses(result.map(address => address.address));
    } catch (e) {
        // e.g. if domain cannot be looked up
        return false;
    }
};
