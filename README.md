# GEN Media Literacy Hackathon Paris 2019

This project is one part of Group 3's solution at the [GEN Media Literacy Hackathon 2019][1].
The overall goal of the hackathon was to produce first prototypes
for [The European Media Literacy Toolkit for Newsrooms][2].

> Developers, product managers, journalists, and designers will be invited to develop the tools participants in the
> three unconferences have come up with. The goal of this hackathon is to produce working prototypes of each tool,
> which will be presented at the GEN Summit in Athens, Greece to an international high-profile audience of senior news executives and editors-in-chief. 

This code is not intended to be used in a production environment. It is a proof of concept, but not ready for any
production-grade system.

## Documentation

The URL scoring runs on a [Google Cloud Function][3] and can be triggered via HTTPS:

```
https://europe-west1-gen-medialiteracy-paris2019.cloudfunctions.net/scoreUrl?url=<URL_TO_SCORE>
```

Please note that you need to perform URL encoding for the `url` query parameter. The endpoint sends an wildcard `*` access control header to fully enable CORS requests.

### Examples

* [https://orf.at](https://europe-west1-gen-medialiteracy-paris2019.cloudfunctions.net/scoreUrl?url=https%3A%2F%2Forf.at) – very trusted source
* [https://example.com](https://europe-west1-gen-medialiteracy-paris2019.cloudfunctions.net/scoreUrl?url=https%3A%2F%2Fexample.com) – demo URL which will always fail

### Reference

#### Response

```json
{
  "score": -0.5,
  "details": {
    "spamBacklisted": true,
    "certificateChecks": {
      "freeCount": 4,
      "freeRate": 0.3234241,
      "holes": 1,
      "duration": 100
    }
  }
}

```

#### Score

The score for an URL can be between -1 (highly problematic), 0 (neutral), 1 (no suspicion, inspiring confidence).

##### Detailed Factors

The final score is determined by weighted checks. The following formula is used to calculate a score: `Math.max(Math.min(scorePoints, 100), -100) / 100`

* **Spam Blacklisting** – blacklisted IP addresses will get -10 points.
* **Certificate Checks** – use Certificate Transparency Logs to look for issued certificates for the given URL.
  Old records of issued certificates are an indicator for the general age of an URL. An URL must have
  at least 4 month of issued certificates to get a positive score. The use of free certificate 
  authorities has no negative impact on the score, but paid certificates get positive points.
  The maximum score for good certificate practice is 50 points.
  
  The current implementation allows wildcard certificates for the given URL and will match them. All implemented checks for this prototype:
  
  * *number of free certificates* – certificates issued by an non-profit or free certificate authority
  * *holes* – the number of periods where no valid certificate has been issued for the given URL's domain. If the administrator forgot to renew an SSL/TLS certificate, this leads to a hole in the time span.
  * *duration* – number of month with at least one known issued valid certificate for the given URL's domain.

## License

Apache License 2.0

[1]: https://www.globaleditorsnetwork.org/programmes/the-media-literacy-toolkit/hackathon-in-paris/
[2]: https://www.globaleditorsnetwork.org/programmes/the-media-literacy-toolkit/
[3]: https://cloud.google.com/functions/
