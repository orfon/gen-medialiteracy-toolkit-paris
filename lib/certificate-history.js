const axios = require("axios");
const { Certificate } = require("@fidm/x509");
const { DateTime, Interval } = require("luxon");

const config = require("../config");

/**
 * Checks the Facebook Certificate Transparency API for all known issued certificates
 * for the given domain.
 *
 * @param {String} domain the domain name to check
 * @return {Promise<*>} array containing the individual certificates
 */
const getIssuedCertificates = async function(domain) {
    const query = encodeURIComponent(domain);
    const accessToken = process.env.FACEBOOK_APP_TOKEN;

    // calls the Facebook Certificate Transparency API
    try {
        let certificates = [],
            i = 0,
            nextUrl = null;

        do {
            const response = await axios.get(
                `https://graph.facebook.com/v3.3/certificates?query=${query}&access_token=${accessToken}&limit=100`
            );

            if (response.status !== 200 || !Array.isArray(response.data.data)) {
                console.error(`Graph API Error: ${response.status}\n${response.data}`);
                return Promise.reject("Bad Gateway");
            }

            certificates = certificates.concat(
                response.data.data.map(data => Certificate.fromPEM(data.certificate_pem))
            );

            // If more certificates are available, read at most 1,000 of them
            nextUrl = response.data.paging ? (response.data.paging.next || null) : null;
        } while (++i < 10 && nextUrl !== null);

        return Promise.resolve(certificates.map(cert => {
            return {
                serialNumber: cert.serialNumber,
                signatureAlgorithm: cert.signatureAlgorithm,
                validFrom: new Date(cert.validFrom),
                validTo: new Date(cert.validTo),
                dnsNames: cert.dnsNames,
                issuingCertificateURL: cert.issuingCertificateURL,
                infoSignatureOID: cert.infoSignatureOID,
                signatureOID: cert.signatureOID,
                signature: cert.signature.toString("hex"),
                commonName: cert.subject.commonName,
                issuer: {
                    commonName: cert.issuer.commonName,
                    organizationName: cert.issuer.organizationName,
                    organizationalUnitName: cert.issuer.organizationalUnitName,
                    countryName: cert.issuer.countryName,
                    localityName: cert.issuer.localityName,
                    serialName: cert.issuer.serialName
                }
            }
        }));
    } catch (e) {
        console.error(e);
        return Promise.reject("Bad Gateway");
    }
};

/**
 * Returns all certificates that are applicable for the given hostname, including wildcard certificates.
 *
 * @param {String} hostname hostname to find all known issued certificates for.
 * @return {Promise<Array>} an array of certificates
 */
const certificatesForHostname = async function(hostname) {
    const certs = await getIssuedCertificates(hostname);
    return certs.filter(cert => {
        if (cert.dnsNames.indexOf(hostname) >= 0) {
            return true;
        }

        const wildcards = cert.dnsNames.filter(name => name.indexOf("*.") === 0);
        if (wildcards.length > 0) {
            return wildcards.some(wildcard => wildcard === hostname.replace(/^[^.]+\./, "*."));
        } else {
            return false;
        }
    });
};

/**
 * Returns all certificates that are applicable for the given hostname, including wildcard certificates.
 * Certificates with the same serial number but different signatures will be reduced to the first found certificate.
 *
 * @param {String} hostname hostname to find all known issued certificates for.
 * @return {Promise<Array>} an array of certificates with unique serial numbers
 */
const uniqueCertificatesForHostname = async function(hostname) {
    const certificates = await certificatesForHostname(hostname);
    const serialNumbers = new Set();

    for (const cert of certificates) {
        serialNumbers.add(cert.serialNumber);
    }

    const uniqueCertificates = [];
    for (const serial of serialNumbers) {
        uniqueCertificates.push(certificates.find(cert => cert.serialNumber === serial));
    }

    return uniqueCertificates.sort((certA, certB) => certB.validFrom - certA.validFrom);
};

/**
 * Analyzes the given certificates and returns the number of periods not covered by a certificate (holes)
 * and the total duration of coverage by at least one certificate in months.
 *
 * @param {Array} certificates the certificates to analyze
 * @return {{holes: number, duration: number}}
 */
const certificateTimeSpan = function(certificates) {
    if (certificates.length === 0) {
        return {
            holes: 0,
            duration: 0
        }
    }

    const certificateIntervals = [];
    for (const cert of certificates) {
        certificateIntervals.push(Interval.fromDateTimes(
            DateTime.fromJSDate(cert.validFrom),
            DateTime.fromJSDate(cert.validTo)
        ));
    }

    const timeSpansCovered = Interval.merge(certificateIntervals);
    const coverageHoles = timeSpansCovered.length - 1;
    const coverageMonths = timeSpansCovered.map(interval => interval.toDuration().as("months")).reduce((prev, curr) => {
        return prev + curr
    }, 0);

    return {
        holes: coverageHoles,
        duration: Math.floor(coverageMonths)
    }
};

/**
 * Analyzes the given certificates for free to use certificates, e.g. issued by Let's Encrypt.
 * Free / non-profit certificate authorities are a good thing, so you should them neutral.
 * Though, if a website uses a paid certificate, it might be a positive indicator and create more trust.
 *
 * @param {Array} certificates the certificates to analyze
 * @return {{freeCount: number, freeRate: number}}
 */
const freeCertificateAuthorityStats = function(certificates) {
    if (certificates.length === 0) {
        return {
            freeCount: 0,
            freeRate: 0
        }
    }

    const freeCAs = config.get("freeCertificateAuthorities") || [];
    const freeCertificates = certificates.filter(cert => freeCAs.indexOf(cert.issuer.commonName) >= 0);

    return {
        freeCount: freeCertificates.length,
        freeRate: freeCertificates.length / certificates.length
    }
};

/**
 * Returns all available static certificate statistics for the given hostname.
 *
 * @param {string} hostname the hostname to look up
 * @return {Promise<{freeCount: number, freeRate: number, holes: number, duration: number}>}
 */
exports.getCertificateStats = async function(hostname) {
    try {
        const certificates = await uniqueCertificatesForHostname(hostname);

        return Promise.resolve({
            ...freeCertificateAuthorityStats(certificates),
            ...certificateTimeSpan(certificates)
        });
    } catch (e) {
        console.error(e);
        return Promise.reject({});
    }
};
