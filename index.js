const { isDomainBlacklisted } = require("./lib/dns-blacklist");
const { getCertificateStats } = require("./lib/certificate-history");

/**
 * The Google Cloud function.
 *
 * @param req Express request object
 * @param res Express response object
 */
exports.scoreUrl = async function(req, res) {
    let scorePoints = 0;
    const scoreDetails = {};

    // global headers
    res.set({
        "Access-Control-Allow-Origin": "*"
    });

    // check if an URL has been provided
    if (!req.query.url) {
        res.status(400).json({
            error: "Query parameter missing: url"
        });
        return;
    }

    let url;
    try {
        url = new URL(req.query.url);
    } catch (e) {
        res.status(400).json({
            error: "Invalid URL provided!"
        });
        return;
    }

    // Empty host names lead to a empty 200 response to keep the Chrome extension running;
    // the service should return a bad request in a production-ready system.
    if (!url.hostname || url.hostname.indexOf(".") < 1) {
        console.warn(`Empty hostname provided: ${url}`);
        res.status(200).json({
            score: 0,
            details: {}
        });
        return;
    }

    try {
        // Spam Blacklisting
        const spamBlacklisted = await isDomainBlacklisted(url.hostname) === true;
        scorePoints -= spamBlacklisted ? 50 : 0;
        scoreDetails.spamBacklisted = spamBlacklisted;

        // Certificate Statistics
        const certStats = await getCertificateStats(url.hostname);
        scoreDetails.certificateChecks = certStats;

        // Only add points if certs are available
        if (certStats.duration >= 4) {
            scorePoints += certStats.freeRate < 0.25 ? 10 : 0;
            scorePoints += certStats.freeRate < 0.10 ? 20 : 0;
            scorePoints += certStats.freeCount === 0 ? 10 : 0;
            scorePoints += certStats.holes === 0 ? 10 : 0;
            const durationFactor = certStats.holes === 0 ? 0.5 : (1 / (4 + certStats.holes));
            scorePoints += Math.min(Math.floor(certStats.duration * durationFactor), 50);
        }

        res.status(200).json({
            score: (Math.max(Math.min(scorePoints, 100), -100) / 100),
            details: scoreDetails
        });
    } catch (e) {
        console.error(e);
        res.status(200).json({
            score: 0,
            details: {}
        });
    }
};
