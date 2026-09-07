# Station reference geography

The app uses `data/geography/stations.v1.json`: 15 selected reference points from
Land Transport Authority's **Train Station (March 2026)** archive, accessed
2026-09-07. This is presentation data, separate from fabricated planning topology.
No source polygon, raw archive, attachment content or internal metadata is stored
in the repository. No network or provider key is needed at runtime.

`npm run geo:verify` validates the bundled snapshot offline. Given a separately
obtained local copy of the exact source archive, verify reproducibility with:

```sh
npm run geo:verify -- --source /absolute/path/TrainStation_Mar2026.zip
```

To regenerate the same snapshot after reviewing a local source:

```sh
node --import tsx scripts/geography/generate.ts /absolute/path/TrainStation_Mar2026.zip
```

The archive SHA-256 is pinned in snapshot metadata. The generator invokes
`unzip -p` with fixed member paths using `execFile`, never a shell or file
extraction. It checks the archive size/hash, polygon header, UTF-8 code page,
exact source SVY21 WKT, 231-feature count and selected source identities. Changed
source archives must undergo a new review and version change; they fail closed.

`station-selection.json` is the reviewed allowlist. `sourceFeatureIndex` is
**zero based**, in SHP/DBF record order. `sourceAttachment` is the exact DBF
`ATTACHEMEN` string, with a null/blank DBF value represented as `""`. Selection
requires one exact `STN_NAM_DE` plus attachment match at its reviewed index.
Buona Vista EW21 uses the blank attachment at 119 rather than CC22 at 68;
MacPherson CC10 uses `CC10_MPS STN.zip` at 116 rather than the blank row at 140.

Each reference point is an area-weighted polygon centroid computed in source
metres, with holes subtracted and multipart areas weighted. Ring winding does not
change the result. The transform then uses pinned `proj4` to convert the archive
SVY21 WKT to WGS84 longitude/latitude, rounded to seven decimal places. This
precision is a deterministic serialization choice, **not an accuracy claim**.
Centroids are not entrances, surveyed track locations or a guarantee of being
inside a concave polygon. Connectors drawn between them are illustrative.

The runtime schema rejects missing/duplicate/unknown station codes, wrong names,
source identities, duplicate coordinates, non-finite/out-of-Singapore points,
unknown properties, and metadata outside this reviewed version. The runtime has
no import path to shapefile, proj4, child processes, or transformer scripts.

## Unresolved source-publication permission

[DataMall's catalogue](https://datamall.lta.gov.sg/content/datamall/en/static-data.html)
links the source archive. The
[Singapore Open Data Licence v1.0](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html)
grants reuse subject to its terms, but the archive XML says **“The data is for
internal use only”**. Older dates in metadata do not establish that this notice
was superseded. Both facts are retained in snapshot provenance; `licenceStatus`
is `conflicting`. Confirm with LTA before public deployment or redistribution.
The point snapshot is for local prototype review and does not imply LTA endorsement.
